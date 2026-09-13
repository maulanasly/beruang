import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { loadLedgers } from '../store.js';
import { formatCurrency, formatPercent } from '../utils.js';
import { t } from '../i18n.js';
import { InfoTip } from './InfoTip.js';
import { buildMonthlyReturns, portfolioTwr } from '../finance.js';
import { GoalsPanel } from './GoalsPanel.js';
import { PortfolioIo } from './PortfolioIo.js';
import { TrendChart } from './TrendChart.js';
import { DonutChart } from './DonutChart.js';
import { MonthlyReturnsTable } from './MonthlyReturnsTable.js';
import { BenchmarkPanel } from './BenchmarkPanel.js';

const ASSET_COLORS = {
    'mutual-funds': '#2563eb',
    stocks: '#f25f3a',
    'term-deposits': '#10b981',
};

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
        window.addEventListener('popstate', h);
        const id = setInterval(h, 1000);
        return () => { window.removeEventListener('storage', h); window.removeEventListener('popstate', h); clearInterval(id); };
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

    // Cash-flow adjusted monthly returns + time-weighted return (chain-linked,
    // annualized over the entry window) — same formulas as Vue useTwr/useMonthlyReturns.
    const monthly = buildMonthlyReturns({
        'mutual-funds': mfEntries,
        stocks: stEntries.map(e => ({ ...e, dividend_yield: e.dividend_yield > 1 ? e.dividend_yield / 100 : e.dividend_yield })),
        'term-deposits': tdEntries,
    });
    const twr = portfolioTwr(monthly);

    const locale = settings.locale;
    const hasData = total > 0 || totalInv > 0;
    if (!hasData) {
        return html`<div class="card">
            <h1 style="font-size:22px; margin:0 0 4px">${t(locale, 'nav.overview')}</h1>
            <p class="muted">${t(locale, 'overview.noData')}</p>
            <p><a href="/mutual-funds">${t(locale, 'nav.mutualFunds')}</a> · <a href="/stocks">${t(locale, 'nav.stocks')}</a> · <a href="/term-deposits">${t(locale, 'nav.termDeposits')}</a></p>
        </div>`;
    }

    return html`<div>
        <div class="card">
            <h1 style="font-size:22px; margin:0 0 4px">${t(locale, 'overview.portfolio')}</h1>
            <p class="muted">${t(locale, 'overview.subtitle')}</p>
            <div class="summary-cards">
                <div class="card"><div class="smallcaps">${t(locale, 'overview.totalInvested')} <${InfoTip} locale=${locale} tipKey="glossary.capitalInvested" /></div><div class="amount">${formatCurrency(totalInv, locale, settings.currency)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'overview.totalValue')}</div><div class="amount">${formatCurrency(total, locale, settings.currency)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'overview.totalPnl')} <${InfoTip} locale=${locale} tipKey="glossary.pnl" /></div><div class="amount" style="color:${pnl >= 0 ? 'var(--success)' : 'var(--danger)'}">${pnl >= 0 ? '▲ ' : '▼ '}${formatCurrency(pnl, locale, settings.currency)} <span style="font-size:12px">(${totalInv ? formatPercent(pnl / totalInv, locale) : '-'})</span></div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'overview.weightedXirr')} <${InfoTip} locale=${locale} tipKey="glossary.weightedXirr" /></div><div class="amount">${weightedXirr != null ? formatPercent(weightedXirr, locale) : '-'}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'overview.twr')} <${InfoTip} locale=${locale} tipKey="glossary.twr" /></div><div class="amount">${twr.annualized != null ? formatPercent(twr.annualized, locale) : '-'}</div></div>
            </div>
        </div>
        <${TrendChart} labels=${dates} invested=${investedSeries} values=${valueSeries} settings=${settings} />
        <${MonthlyReturnsTable} monthly=${monthly} settings=${settings} />
        <${BenchmarkPanel} labels=${dates} values=${valueSeries} settings=${settings} />
        <div class="card"><div class="smallcaps">${t(locale, 'overview.perAsset')} <${InfoTip} locale=${locale} tipKey="glossary.roi" /></div></div>
        <${DonutChart} settings=${settings} series=${[
            { label: t(locale, 'nav.mutualFunds'), value: mfVal, color: ASSET_COLORS['mutual-funds'] },
            { label: t(locale, 'nav.stocks'), value: stVal, color: ASSET_COLORS.stocks },
            { label: t(locale, 'nav.termDeposits'), value: tdVal, color: ASSET_COLORS['term-deposits'] },
        ]} />
        <div class="summary-cards">
            ${[
                { label: t(locale, 'nav.mutualFunds'), value: mfVal, invested: mfInv },
                { label: t(locale, 'nav.stocks'), value: stVal, invested: stInv },
                { label: t(locale, 'nav.termDeposits'), value: tdVal, invested: tdInv },
            ].map(a => {
                const roi = a.invested > 0 ? (a.value - a.invested) / a.invested : null;
                return html`<div class="card"><div class="smallcaps">${a.label}</div><div class="amount">${formatCurrency(a.value, settings.locale, settings.currency)}</div><div style="font-size:15px; font-weight:600">${roi != null ? formatPercent(roi, settings.locale) : '-'}</div><div class="muted" style="font-size:12px">${t(locale, 'overview.invested')} ${formatCurrency(a.invested, settings.locale, settings.currency)}</div></div>`;
            })}
        </div>
        <${GoalsPanel} settings=${settings} totalValue=${total} monthlyAvg=${monthlyAvg} />
        <${PortfolioIo} settings=${settings} />
    </div>`;
}
