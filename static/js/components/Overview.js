import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { loadLedgers } from '../store.js';
import { formatCurrency, formatPercent } from '../utils.js';
import { GoalsPanel } from './GoalsPanel.js';
import { PortfolioIo } from './PortfolioIo.js';
import { TrendChart } from './TrendChart.js';

function cumulativeByDate(entries, withPurchases) {
    const sorted = [...entries].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let running = 0;
    return sorted.map(e => {
        running += (Number(e.installment_amount) || 0) + (withPurchases ? (Number(e.new_share_purchases) || 0) : 0);
        return { date: String(e.date), invested: running, value: Number(e.current_value) || 0 };
    });
}

export function Overview({ settings }) {
    const [ledgers, setLedgers] = useState(loadLedgers());
    useEffect(() => {
        const h = () => setLedgers(loadLedgers());
        window.addEventListener('storage', h);
        window.addEventListener('hashchange', h);
        const id = setInterval(h, 1000);
        return () => { window.removeEventListener('storage', h); clearInterval(id); };
    }, []);

    const mfEntries = ledgers['mutual-funds'] || [];
    const stEntries = ledgers.stocks || [];
    const tdEntries = ledgers['term-deposits']?.entries || [];
    const mfVal = mfEntries.length ? Number(mfEntries[mfEntries.length - 1].current_value) || 0 : 0;
    const stVal = stEntries.length ? Number(stEntries[stEntries.length - 1].current_value) || 0 : 0;
    const tdVal = tdEntries.length ? Number(tdEntries[tdEntries.length - 1].current_value) || 0 : 0;
    const total = mfVal + stVal + tdVal;
    const mfInv = mfEntries.reduce((s, e) => s + (Number(e.installment_amount) || 0), 0);
    const stInv = stEntries.reduce((s, e) => s + (Number(e.installment_amount) || 0) + (Number(e.new_share_purchases) || 0), 0);
    const tdInv = tdEntries.reduce((s, e) => s + (Number(e.installment_amount) || 0), 0);
    const totalInv = mfInv + stInv + tdInv;
    const pnl = total - totalInv;

    // Value-weighted XIRR across asset classes that have a calculated result.
    const parts = [
        { value: mfVal, xirr: ledgers.results?.['mutual-funds']?.summary?.xirr },
        { value: stVal, xirr: ledgers.results?.stocks?.summary?.xirr },
        { value: tdVal, xirr: null },
    ].filter(p => p.value > 0 && typeof p.xirr === 'number');
    const wSum = parts.reduce((s, p) => s + p.value, 0);
    const weightedXirr = wSum > 0 ? parts.reduce((s, p) => s + p.xirr * p.value, 0) / wSum : null;

    // Union timeline for the trend chart.
    const mfCum = cumulativeByDate(mfEntries, false);
    const stCum = cumulativeByDate(stEntries, true);
    const tdCum = cumulativeByDate(tdEntries, false);
    const dates = [...new Set([...mfCum, ...stCum, ...tdCum].map(r => r.date))].sort();
    function lastAt(cum, date) {
        let out = null;
        for (const r of cum) { if (r.date <= date) out = r; }
        return out;
    }
    const investedSeries = dates.map(d =>
        (lastAt(mfCum, d)?.invested || 0) + (lastAt(stCum, d)?.invested || 0) + (lastAt(tdCum, d)?.invested || 0));
    const valueSeries = dates.map(d =>
        (lastAt(mfCum, d)?.value || 0) + (lastAt(stCum, d)?.value || 0) + (lastAt(tdCum, d)?.value || 0));
    const monthlyAvg = dates.length >= 2 && totalInv > 0 ? totalInv / Math.max(dates.length - 1, 1) : 0;

    const hasData = total > 0 || totalInv > 0;
    if (!hasData) {
        return html`<div class="card">
            <h2>Overview</h2>
            <p class="muted">Add entries on asset pages and Calculate Returns to populate this overview.</p>
            <p><a href="#/mutual-funds">Mutual Funds</a> · <a href="#/stocks">Stocks</a> · <a href="#/term-deposits">Term Deposits</a></p>
        </div>`;
    }

    return html`<div>
        <div class="card">
            <h2>Portfolio</h2>
            <p class="muted">Your portfolio at a glance: how much you have put in, what it is worth now, and how it is split.</p>
            <div class="summary-cards">
                <div class="card"><div class="smallcaps">Invested</div><div class="amount">${formatCurrency(totalInv, settings.locale, settings.currency)}</div></div>
                <div class="card"><div class="smallcaps">Current Value</div><div class="amount">${formatCurrency(total, settings.locale, settings.currency)}</div></div>
                <div class="card"><div class="smallcaps">P/L</div><div class="amount" style="color:${pnl >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(pnl, settings.locale, settings.currency)} <span style="font-size:12px">(${totalInv ? formatPercent(pnl / totalInv, settings.locale) : '-'})</span></div></div>
                <div class="card"><div class="smallcaps">Weighted XIRR</div><div class="amount">${weightedXirr != null ? formatPercent(weightedXirr, settings.locale) : '-'}</div></div>
            </div>
        </div>
        <${TrendChart} labels=${dates} invested=${investedSeries} values=${valueSeries} settings=${settings} />
        <div class="summary-cards">
            <div class="card"><div class="smallcaps">Mutual Funds</div><div class="amount">${formatCurrency(mfVal, settings.locale, settings.currency)}</div><div class="muted" style="font-size:12px">Invested ${formatCurrency(mfInv, settings.locale, settings.currency)}</div></div>
            <div class="card"><div class="smallcaps">Stocks</div><div class="amount">${formatCurrency(stVal, settings.locale, settings.currency)}</div><div class="muted" style="font-size:12px">Invested ${formatCurrency(stInv, settings.locale, settings.currency)}</div></div>
            <div class="card"><div class="smallcaps">Term Deposits</div><div class="amount">${formatCurrency(tdVal, settings.locale, settings.currency)}</div><div class="muted" style="font-size:12px">Invested ${formatCurrency(tdInv, settings.locale, settings.currency)}</div></div>
        </div>
        <${GoalsPanel} settings=${settings} totalValue=${total} monthlyAvg=${monthlyAvg} />
        <${PortfolioIo} />
    </div>`;
}
