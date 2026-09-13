// Pure portfolio math (legacy Vue monthly-returns/TWR/benchmark parity).
// No framework, no I/O.

export const ASSETS = ['mutual-funds', 'stocks', 'term-deposits'];

function contributionsFor(asset, entry) {
    const installment = Number(entry?.installment_amount) || 0;
    if (asset === 'stocks') return installment + (Number(entry?.new_share_purchases) || 0);
    return installment;
}
function dividendsFor(asset, entry) {
    return asset === 'stocks' ? Number(entry?.dividends) || 0 : 0;
}
function yieldFraction(entry) {
    // Vue binds dividend_yield as a fraction; static Stocks page stores %-input.
    // Accept both: values > 1 are treated as percent.
    const raw = Number(entry?.dividend_yield);
    if (!Number.isFinite(raw) || raw === 0) return 0;
    return raw > 1 ? raw / 100 : raw;
}

function seriesFor(asset, entries) {
    const byDate = new Map();
    (entries || []).filter(e => e && e.date != null).forEach(e => byDate.set(String(e.date), e));
    const sorted = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return sorted.map((entry, index) => {
        const previous = index > 0 ? sorted[index - 1] : null;
        const monthStartValue = previous ? Number(previous.current_value) || 0 : 0;
        const currentValue = Number(entry.current_value) || 0;
        const contributions = contributionsFor(asset, entry);
        const dividends = dividendsFor(asset, entry);
        const estimatedDividend = asset === 'stocks' ? currentValue * yieldFraction(entry) / 12 : 0;
        return {
            date: String(entry.date),
            monthStartValue, currentValue, contributions, dividends, estimatedDividend,
            mom: monthStartValue > 0
                ? (currentValue - contributions + dividends + estimatedDividend - monthStartValue) / monthStartValue
                : null,
        };
    });
}

export function buildMonthlyReturns(entriesByAsset) {
    const series = {};
    const months = new Set();
    for (const asset of ASSETS) {
        series[asset] = seriesFor(asset, entriesByAsset?.[asset]);
        series[asset].forEach(row => months.add(row.date));
    }
    const sortedMonths = [...months].sort();
    const byAsset = {};
    for (const asset of ASSETS) {
        const lookup = new Map(series[asset].map(row => [row.date, row.mom]));
        byAsset[asset] = sortedMonths.map(m => lookup.get(m) ?? null);
    }
    const portfolio = sortedMonths.map(month => {
        let sumValue = 0, sumContrib = 0, sumDiv = 0, sumEst = 0, sumStart = 0;
        for (const asset of ASSETS) {
            const row = series[asset].find(r => r.date === month);
            if (!row) continue;
            sumValue += row.currentValue; sumContrib += row.contributions;
            sumDiv += row.dividends; sumEst += row.estimatedDividend; sumStart += row.monthStartValue;
        }
        if (sumStart <= 0) return null;
        return (sumValue - sumContrib + sumDiv + sumEst - sumStart) / sumStart;
    });
    return { months: sortedMonths, byAsset, portfolio };
}

/** Chain-link sub-period returns: (1+r1)(1+r2)… − 1. Null when <2 valid. */
export function chainLink(returns) {
    const valid = (returns || []).filter(v => typeof v === 'number' && Number.isFinite(v));
    if (valid.length < 2) return null;
    return valid.reduce((acc, v) => acc * (1 + v), 1) - 1;
}

/** Annualize a total return over a date window (365-day year). */
export function annualize(total, startDate, endDate) {
    if (total == null || !Number.isFinite(total)) return null;
    const start = Date.parse(startDate), end = Date.parse(endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    const days = (end - start) / 86400000;
    if (days <= 0) return null;
    return (1 + total) ** (365 / days) - 1;
}

export function portfolioTwr(monthly) {
    const total = chainLink(monthly.portfolio);
    const months = monthly.months;
    return { total, annualized: annualize(total, months[0], months[months.length - 1]) };
}

function latestCloseOnOrBefore(points, date) {
    let latest = null;
    for (const p of points) {
        if (String(p.date) <= date) latest = Number(p.close);
        else break;
    }
    return latest;
}

/** Normalize portfolio values + index closes to 100 at first portfolio date. */
export function buildComparison(labels, values, indexPoints) {
    const dates = (labels || []).map((date, i) => ({ date: String(date), value: Number(values?.[i]) }))
        .filter(p => p.value > 0 && p.date);
    if (dates.length < 2 || !Array.isArray(indexPoints) || !indexPoints.length) return null;
    const baseIndex = latestCloseOnOrBefore(indexPoints, dates[0].date);
    if (baseIndex == null) return null;
    const series = dates.map(p => ({
        date: p.date,
        portfolio: (p.value / dates[0].value) * 100,
        index: ((latestCloseOnOrBefore(indexPoints, p.date) ?? baseIndex) / baseIndex) * 100,
    }));
    return {
        labels: series.map(p => p.date),
        portfolio: series.map(p => p.portfolio),
        index: series.map(p => p.index),
    };
}
