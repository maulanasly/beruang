import { html, useState } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { formatCurrency } from '../utils.js';
import { MiniBars } from './HomeVisuals.js';
import { buildPortfolioInterest, buildRolloverProjection, applyTax, portfolioToCsv, downloadScheduleCsv } from '../depositInterest.js';

// Portfolio-wide monthly interest: calendar-month aggregation across all
// deposits, interest KPIs, and a rollover projection. Frontend-derived
// from the oracle-provided monthly_rate/apy; display-only.
const CYCLES = [0, 1, 3, 5];

export function DepositInterest(props) {
    const [cycles, setCycles] = useState(3);
    return html`<${DepositInterestView} ledger=${props.ledger} summary=${props.summary}
        monthlyRate=${props.monthlyRate} apy=${props.apy} taxRate=${props.taxRate}
        settings=${props.settings} cycles=${cycles} onCycles=${setCycles} />`;
}

export function DepositInterestView({ ledger, summary, monthlyRate, apy, taxRate, cycles, onCycles, settings }) {
    const locale = settings.locale;
    const currency = settings.currency;
    const rows = (Array.isArray(ledger) ? ledger : []).filter(r => r && typeof r === 'object' && r.date);
    if (!rows.length) return html``;

    const portfolio = buildPortfolioInterest(rows, monthlyRate, taxRate);
    const rollover = buildRolloverProjection(rows, apy, monthlyRate, cycles, taxRate);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const next12 = portfolio.months.filter(m => m.month >= currentMonth).slice(0, 12);
    const next12Net = next12.reduce((s, m) => s + m.net, 0);
    const latest = rows[rows.length - 1];
    const thisGross = Number(latest?.prorated_interest) || 0;
    const toDate = Number(summary?.total_accrued_interest) || 0;
    const avg = portfolio.months.length ? portfolio.totalGross / portfolio.months.length : 0;

    const kpis = [
        { label: t(locale, 'depositInterest.kpiThisMonth'), value: formatCurrency(thisGross, locale, currency), sub: t(locale, 'depositInterest.net') + ' ' + formatCurrency(applyTax(thisGross, taxRate), locale, currency) },
        { label: t(locale, 'depositInterest.kpiToDate'), value: formatCurrency(toDate, locale, currency), sub: t(locale, 'depositInterest.net') + ' ' + formatCurrency(applyTax(toDate, taxRate), locale, currency) },
        { label: t(locale, 'depositInterest.kpiNext12'), value: formatCurrency(next12Net, locale, currency) },
        { label: t(locale, 'depositInterest.kpiAverage'), value: formatCurrency(avg, locale, currency) },
    ];

    const exportCsv = () => downloadScheduleCsv('term-deposit-interest.csv', portfolioToCsv(portfolio));

    return html`<section class="card">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; justify-content:space-between">
            <div class="smallcaps">${t(locale, 'depositInterest.title')}</div>
            <button class="btn-ghost btn-sm" onClick=${exportCsv}>${t(locale, 'io.exportCsv')}</button>
        </div>
        <div class="summary-cards" style="margin:10px 0 12px">
            ${kpis.map(k => html`<article class="card" style="margin:0; padding:8px 10px">
                <p class="smallcaps" style="margin:0 0 4px">${k.label}</p>
                <p style="margin:0; font-size:16px; font-weight:600">${k.value}</p>
                ${k.sub && html`<p class="muted" style="margin:2px 0 0; font-size:11px">${k.sub}</p>`}
            </article>`)}
        </div>

        <${MiniBars} values=${portfolio.months.map(m => m.gross)} color="var(--chart-blue)" w=${640} h=${120} />
        <div class="smallcaps" style="font-size:10px">${t(locale, 'depositInterest.chartLabel')}</div>
        <div class="ledger-table-wrap" style="margin-top:8px"><table>
            <thead><tr>
                <th scope="col">${t(locale, 'depositInterest.month')}</th>
                <th scope="col" class="num">${t(locale, 'depositInterest.gross')}</th>
                <th scope="col" class="num">${t(locale, 'depositInterest.net')}</th>
                <th scope="col" class="num">${t(locale, 'depositInterest.cumulative')}</th>
                <th scope="col" class="num">${t(locale, 'depositSchedule.netCumulative')}</th>
            </tr></thead>
            <tbody>
                ${portfolio.months.map(m => html`<tr>
                    <td>${m.month}</td>
                    <td class="num">${formatCurrency(m.gross, locale, currency)}</td>
                    <td class="num">${formatCurrency(m.net, locale, currency)}</td>
                    <td class="num">${formatCurrency(m.cumulative, locale, currency)}</td>
                    <td class="num">${formatCurrency(m.cumulativeNet, locale, currency)}</td>
                </tr>`)}
            </tbody>
        </table></div>

        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:14px">
            <span class="smallcaps">${t(locale, 'depositInterest.rolloverCycles')}</span>
            ${CYCLES.map(c => html`<button class=${cycles === c ? 'btn-sm' : 'btn-ghost btn-sm'} aria-pressed=${cycles === c} onClick=${() => onCycles && onCycles(c)}>${c}</button>`)}
            <span class="muted" style="font-size:12px">${t(locale, 'depositInterest.rolloverTotal')}: <strong>${formatCurrency(rollover.totalNet, locale, currency)}</strong></span>
        </div>
        <${MiniBars} values=${rollover.months.map(m => m.gross)} color="var(--chart-purple)" w=${640} h=${120} />
    </section>`;
}
