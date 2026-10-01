import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { formatCurrency } from '../utils.js';
import { MiniLines } from './HomeVisuals.js';

// Per-deposit monthly interest schedule, derived in the frontend from
// the oracle-provided primitives (monthly_rate, installment, term).
// Compounding at monthly_rate over term_months reproduces the backend's
// maturity_value exactly: p·(1+mr)^n = p·(1+apy)^(n/12).

function addMonths(dateString, months) {
    if (!dateString) return '';
    const [year, month, day] = String(dateString).split('-').map(Number);
    const total = year * 12 + (month - 1) + Number(months);
    const y = Math.floor(total / 12), m = (total % 12) + 1;
    const lastDay = new Date(y, m, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');
    return `${y}-${pad(m)}-${pad(Math.min(day, lastDay))}`;
}

/** Pure schedule builder (exported for testing). */
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
        rows.push({ i, date: addMonths(startDate, i), opening, interest, closing, cumulative });
        opening = closing;
    }
    return rows;
}

function DepositScheduleRow({ row, monthlyRate, settings, n }) {
    const locale = settings.locale;
    const currency = settings.currency;
    const schedule = buildDepositSchedule({
        installment: row.installment_amount,
        monthlyRate,
        termMonths: row.term_months,
        startDate: row.date,
    });
    const cumulative = schedule.map(s => s.cumulative);
    const total = cumulative.length ? cumulative[cumulative.length - 1] : 0;
    const points = [0, ...cumulative];
    return html`<details class="deposit-schedule">
        <summary>
            <span>${t(locale, 'depositSchedule.deposit', { n })} · ${row.date} → ${row.maturity_date || ''}</span>
            <span class="muted">${t(locale, 'depositSchedule.total', { value: formatCurrency(total, locale, currency) })}</span>
        </summary>
        <${MiniLines} series=${[{ points, color: 'var(--chart-orange)' }]} filledFirst=${true} w=${360} h=${96}
            label=${t(locale, 'depositSchedule.chartLabel')} />
        <div class="ledger-table-wrap"><table>
            <thead><tr>
                <th scope="col">${t(locale, 'depositSchedule.month')}</th>
                <th scope="col">${t(locale, 'column.date')}</th>
                <th scope="col" class="num">${t(locale, 'depositSchedule.opening')}</th>
                <th scope="col" class="num">${t(locale, 'depositSchedule.interest')}</th>
                <th scope="col" class="num">${t(locale, 'depositSchedule.closing')}</th>
                <th scope="col" class="num">${t(locale, 'depositSchedule.cumulative')}</th>
            </tr></thead>
            <tbody>
                ${schedule.map(s => html`<tr>
                    <td class="num">${s.i}</td>
                    <td class="num">${s.date}</td>
                    <td class="num">${formatCurrency(s.opening, locale, currency)}</td>
                    <td class="num">${formatCurrency(s.interest, locale, currency)}</td>
                    <td class="num">${formatCurrency(s.closing, locale, currency)}</td>
                    <td class="num">${formatCurrency(s.cumulative, locale, currency)}</td>
                </tr>`)}
            </tbody>
        </table></div>
    </details>`;
}

export function DepositSchedule({ ledger, monthlyRate, settings }) {
    const locale = settings.locale;
    const rows = (Array.isArray(ledger) ? ledger : []).filter(r => r && typeof r === 'object' && r.maturity_status);
    if (!rows.length) return html``;
    return html`<section class="card">
        <div class="smallcaps">${t(locale, 'depositSchedule.title')}</div>
        ${rows.map((row, idx) => html`<${DepositScheduleRow} row=${row} monthlyRate=${monthlyRate} settings=${settings} n=${idx + 1} />`)}
    </section>`;
}
