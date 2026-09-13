import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { loadLedgers } from '../store.js';
import { navigate } from '../router.js';
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

function lastRow(rows) {
    return rows.length ? rows[rows.length - 1] : null;
}
function sumField(rows, ...fields) {
    return rows.reduce((s, e) => s + fields.reduce((a, f) => a + (Number(e[f]) || 0), 0), 0);
}

export function Overview({ settings }) {
    const [ledgers, setLedgers] = useState(loadLedgers());
    useEffect(() => {
        const h = () => setLedgers(loadLedgers());
        window.addEventListener('storage', h);
        window.addEventListener('popstate', h);
        return () => { window.removeEventListener('storage', h); window.removeEventListener('popstate', h); };
    }, []);

    const mfEntries = ledgers['mutual-funds'] || [];
    const stEntries = ledgers.stocks || [];
    const tdEntries = ledgers['term-deposits']?.entries || [];

    // Trust rule: dashboard numbers come from the last CALCULATED ledger
    // (validated, date-sorted server output). Raw entries are only an
    // explicitly-flagged estimate until the user presses Calculate.
    const mfLedger = ledgers.results?.['mutual-funds']?.ledger?.length
        ? ledgers.results['mutual-funds'].ledger : null;
    const stLedger = ledgers.results?.stocks?.ledger?.length
        ? ledgers.results.stocks.ledger : null;
    const tdLedger = ledgers.results?.['term-deposits']?.ledger?.length
        ? ledgers.results['term-deposits'].ledger : null;

    const mfVal = mfLedger ? Number(lastRow(mfLedger).current_value) || 0
        : mfEntries.length ? Number(mfEntries[mfEntries.length - 1].current_value) || 0 : 0;
    const stVal = stLedger ? Number(lastRow(stLedger).current_value) || 0
        : stEntries.length ? Number(stEntries[stEntries.length - 1].current_value) || 0 : 0;
    const tdVal = tdLedger ? Number(lastRow(tdLedger).current_value) || 0
        : tdEntries.length ? Number(tdEntries[tdEntries.length - 1].current_value) || 0 : 0;
    const total = mfVal + stVal + tdVal;

    const mfInv = mfLedger ? sumField(mfLedger, 'installment_amount') : sumField(mfEntries, 'installment_amount');
    const stInv = stLedger ? sumField(stLedger, 'installment_amount', 'new_share_purchases') : sumField(stEntries, 'installment_amount', 'new_share_purchases');
    const tdInv = tdLedger ? sumField(tdLedger, 'installment_amount') : sumField(tdEntries, 'installment_amount');
    const totalInv = mfInv + stInv + tdInv;
    const pnl = total - totalInv;

    const mfEst = !mfLedger && mfEntries.length > 0;
    const stEst = !stLedger && stEntries.length > 0;
    const tdEst = !tdLedger && tdEntries.length > 0;
    const estimatedAny = mfEst || stEst || tdEst;

    const stDiv = stLedger ? sumField(stLedger, 'dividends') : null;
    const tdApy = typeof ledgers.results?.['term-deposits']?.summary?.apy === 'number'
        ? ledgers.results['term-deposits'].summary.apy : null;

    const calcTimes = [
        ledgers.results?.['mutual-funds']?.calculatedAt,
        ledgers.results?.stocks?.calculatedAt,
        ledgers.results?.['term-deposits']?.calculatedAt,
    ].filter(Boolean);
    const latestCalc = calcTimes.length ? calcTimes.sort().pop() : null;

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
    const go = (e, to) => { e.preventDefault(); navigate(to); };
    function loadDemo() {
        try { localStorage.removeItem('beruang.ledgers'); } catch {}
        window.location.reload();
    }

    const hasData = total > 0 || totalInv > 0;
    if (!hasData) {
        return html`<div class="card">
            <h1 style="font-size:22px; margin:0 0 4px">${t(locale, 'nav.portfolio')}</h1>
            <p class="muted">${t(locale, 'overview.noData')}</p>
            <p style="display:flex; gap:8px; flex-wrap:wrap">
                <button onClick=${loadDemo}>${t(locale, 'overview.loadDemo')}</button>
            </p>
            <p><a href="/kalkulator/reksa-dana" onClick=${e=>go(e,'/kalkulator/reksa-dana')}>${t(locale, 'nav.mutualFunds')}</a> · <a href="/kalkulator/saham" onClick=${e=>go(e,'/kalkulator/saham')}>${t(locale, 'nav.stocks')}</a> · <a href="/kalkulator/deposito" onClick=${e=>go(e,'/kalkulator/deposito')}>${t(locale, 'nav.termDeposits')}</a></p>
        </div>`;
    }

    const provenance = [
        dates.length ? t(locale, 'overview.dataWindow', { from: dates[0], to: dates[dates.length - 1] }) : null,
        latestCalc ? t(locale, 'overview.calculatedAt', { time: new Date(latestCalc).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) }) : null,
        estimatedAny ? t(locale, 'overview.estimated') : null,
    ].filter(Boolean).join(' · ');

    return html`<div>
        <div class="card">
            <h1 style="font-size:22px; margin:0 0 4px">${t(locale, 'overview.portfolio')}</h1>
            <p class="muted">${t(locale, 'overview.subtitle')}</p>
            ${provenance && html`<p class="muted" style="font-size:12px">${provenance}</p>`}
            <div class="summary-cards">
                <div class="card"><div class="smallcaps">${t(locale, 'overview.totalInvested')} <${InfoTip} locale=${locale} tipKey="glossary.capitalInvested" /></div><div class="amount">${formatCurrency(totalInv, locale, settings.currency)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'overview.totalValue')}</div><div class="amount">${formatCurrency(total, locale, settings.currency)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'overview.totalPnl')} <${InfoTip} locale=${locale} tipKey="glossary.pnl" /></div><div class="amount" style="color:${pnl >= 0 ? 'var(--success)' : 'var(--danger)'}">${pnl >= 0 ? '▲ ' : '▼ '}${formatCurrency(pnl, locale, settings.currency)} <span style="font-size:12px">(${totalInv ? formatPercent(pnl / totalInv, locale) : '-'})</span></div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'overview.weightedXirr')} <${InfoTip} locale=${locale} tipKey=${weightedXirr != null ? 'glossary.weightedXirr' : 'glossary.apy'} /></div><div class="amount">${weightedXirr != null ? formatPercent(weightedXirr, locale) : (tdApy != null && tdVal > 0 ? html`${formatPercent(tdApy, locale)} <span style="font-size:12px">APY</span>` : '-')}</div></div>
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
                { label: t(locale, 'nav.mutualFunds'), value: mfVal, invested: mfInv, extra: mfEst ? t(locale, 'overview.estimated') : null },
                { label: t(locale, 'nav.stocks'), value: stVal, invested: stInv, div: stDiv, extra: stEst ? t(locale, 'overview.estimated') : null },
                { label: t(locale, 'nav.termDeposits'), value: tdVal, invested: tdInv, extra: tdEst ? t(locale, 'overview.estimated') : null },
            ].map(a => {
                const roi = a.invested > 0 ? (a.value - a.invested) / a.invested : null;
                return html`<div class="card"><div class="smallcaps">${a.label}</div><div class="amount">${formatCurrency(a.value, settings.locale, settings.currency)}</div><div style="font-size:15px; font-weight:600">${roi != null ? formatPercent(roi, settings.locale) : '-'}</div><div class="muted" style="font-size:12px">${t(locale, 'overview.invested')} ${formatCurrency(a.invested, settings.locale, settings.currency)}</div>${a.div != null && a.div > 0 ? html`<div class="muted" style="font-size:12px">${t(locale, 'column.dividends')}: ${formatCurrency(a.div, settings.locale, settings.currency)}</div>` : ''}${a.extra ? html`<div class="muted" style="font-size:12px">⚠ ${a.extra}</div>` : ''}</div>`;
            })}
        </div>
        <${GoalsPanel} settings=${settings} totalValue=${total} monthlyAvg=${monthlyAvg} />
        <${PortfolioIo} settings=${settings} />
    </div>`;
}
