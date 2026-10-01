import { download } from './ledgerIo.js';

// Pure term-deposit interest math, derived in the frontend from the
// oracle-provided primitives (monthly_rate, apy, installment, term).
// Compounding at monthly_rate over term_months reproduces the backend's
// maturity_value exactly: p·(1+mr)^n = p·(1+apy)^(n/12).
// No I/O, no framework — safe to unit-test.

export function addMonths(dateString, months) {
    if (!dateString) return '';
    const [year, month, day] = String(dateString).split('-').map(Number);
    const total = year * 12 + (month - 1) + Number(months);
    const y = Math.floor(total / 12), m = (total % 12) + 1;
    const lastDay = new Date(y, m, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');
    return `${y}-${pad(m)}-${pad(Math.min(day, lastDay))}`;
}

/** Net-of-tax interest. Rate is clamped to [0, 1]. */
export function applyTax(interest, taxRate) {
    const r = Number(taxRate);
    const rate = Number.isFinite(r) ? Math.max(0, Math.min(1, r)) : 0;
    return (Number(interest) || 0) * (1 - rate);
}

/** Month-by-month schedule for a single deposit: opening, interest, closing. */
export function buildDepositSchedule({ installment, monthlyRate, termMonths, startDate }) {
    const n = Math.max(1, Math.min(120, Math.floor(Number(termMonths) || 0)));
    const p = Number(installment) || 0;
    const r = Number(monthlyRate) || 0;
    const rows = [];
    let opening = p;
    let cumulative = 0;
    for (let i = 1; i <= n; i++) {
        const interest = opening * r;
        const closing = opening + interest;
        cumulative += interest;
        rows.push({ i, month: String(addMonths(startDate, i)).slice(0, 7), date: addMonths(startDate, i), opening, interest, closing, cumulative });
        opening = closing;
    }
    return rows;
}

function monthKey(dateString) {
    return String(dateString).slice(0, 7);
}

function addToBucket(buckets, month, interest) {
    const acc = buckets.get(month) || { month, gross: 0 };
    acc.gross += Number(interest) || 0;
    buckets.set(month, acc);
}

function finalizeBuckets(buckets, taxRate) {
    const months = [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month));
    let cum = 0, cumNet = 0;
    const out = months.map(m => {
        const net = applyTax(m.gross, taxRate);
        cum += m.gross;
        cumNet += net;
        return { month: m.month, gross: m.gross, net, cumulative: cum, cumulativeNet: cumNet };
    });
    return { months: out, totalGross: cum, totalNet: cumNet };
}

/** Calendar-month interest across every deposit, projected to the last maturity. */
export function buildPortfolioInterest(rows, monthlyRate, taxRate = 0) {
    const list = (Array.isArray(rows) ? rows : []).filter(r => r && typeof r === 'object' && r.date);
    const buckets = new Map();
    for (const row of list) {
        const schedule = buildDepositSchedule({
            installment: row.installment_amount,
            monthlyRate,
            termMonths: row.term_months,
            startDate: row.date,
        });
        for (const s of schedule) addToBucket(buckets, s.month || monthKey(s.date), s.interest);
    }
    return finalizeBuckets(buckets, taxRate);
}

/** Extend each deposit through N reinvestment cycles at the same APY. */
export function buildRolloverProjection(rows, apy, monthlyRate, cycles = 3, taxRate = 0) {
    const list = (Array.isArray(rows) ? rows : []).filter(r => r && typeof r === 'object' && r.date);
    const cycleCount = Math.max(0, Math.min(10, Math.floor(Number(cycles) || 0)));
    const apyR = Number(apy) || 0;
    const buckets = new Map();
    for (const row of list) {
        const term = Math.max(1, Math.min(120, Math.floor(Number(row.term_months) || 12)));
        let principal = Number(row.installment_amount) || 0;
        let start = row.date;
        for (let c = 0; c <= cycleCount; c++) {
            const schedule = buildDepositSchedule({ installment: principal, monthlyRate, termMonths: term, startDate: start });
            for (const s of schedule) addToBucket(buckets, s.month || monthKey(s.date), s.interest);
            principal *= Math.pow(1 + apyR, term / 12);
            start = addMonths(start, term);
        }
    }
    return finalizeBuckets(buckets, taxRate);
}

// --- CSV export -------------------------------------------------------

function csvCell(v) {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
function csvLines(rows) {
    return rows.map(r => r.map(csvCell).join(',')).join('\n');
}
function num(v) {
    return Number.isFinite(Number(v)) ? Number(v).toFixed(4) : '';
}

/** One row per deposit per month (per-deposit + portfolio source data). */
export function schedulesToCsv(rows, monthlyRate, taxRate = 0) {
    const list = (Array.isArray(rows) ? rows : []).filter(r => r && typeof r === 'object');
    const out = [['deposit', 'month', 'date', 'opening', 'interest', 'net_interest', 'closing', 'cumulative', 'net_cumulative']];
    list.forEach((row, idx) => {
        const schedule = buildDepositSchedule({ installment: row.installment_amount, monthlyRate, termMonths: row.term_months, startDate: row.date });
        for (const s of schedule) {
            out.push([idx + 1, s.month, s.date, num(s.opening), num(s.interest), num(applyTax(s.interest, taxRate)), num(s.closing), num(s.cumulative), num(applyTax(s.cumulative, taxRate))]);
        }
    });
    return csvLines(out);
}

/** Portfolio calendar-month aggregation. */
export function portfolioToCsv(portfolio) {
    const out = [['month', 'gross_interest', 'net_interest', 'cumulative', 'net_cumulative']];
    for (const m of (portfolio?.months || [])) {
        out.push([m.month, num(m.gross), num(m.net), num(m.cumulative), num(m.cumulativeNet)]);
    }
    return csvLines(out);
}

export function downloadScheduleCsv(filename, csv) {
    download(filename, csv, 'text/csv');
}
