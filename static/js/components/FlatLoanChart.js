import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { formatCurrency, formatCompactCurrency } from '../utils.js';

// Zero-dependency SVG loan chart: remaining balance burning down against
// cumulative interest paid, month by month. Same SVG pattern as
// RentBuyChart.js (no npm).
export function FlatLoanChart({ schedule, totalPayable, settings }) {
    const locale = settings.locale;
    const rows = Array.isArray(schedule) ? schedule : [];
    if (rows.length < 1) return html``;

    const balance = [rows.length ? Number(rows[0].balance) + Number(rows[0].principal_paid) || 0 : 0, ...rows.map(r => Number(r.balance) || 0)];
    const interest = [0, ...rows.map(r => Number(r.cum_interest) || 0)];
    const balanceLabel = t(locale, 'flatloan.chartBalance');
    const interestLabel = t(locale, 'flatloan.chartInterest');

    const w = 640, h = 220, padL = 56, padR = 12, padT = 12, padB = 28;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const max = Math.max(...balance, ...interest, 1);
    const x = i => padL + (i / Math.max(balance.length - 1, 1)) * plotW;
    const y = v => padT + plotH - (Math.max(v, 0) / max) * plotH;
    const line = arr => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const ticks = 4;
    const yTicks = Array.from({ length: ticks + 1 }, (_, i) => Math.round((max * i) / ticks));
    const fmtTick = v => v >= 1000000 ? `${Math.round(v / 1000000)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`;

    const svgLabel = `${t(locale, 'flatloan.chartTitle')}: ${balanceLabel} vs ${interestLabel}`;
    return html`<div class="card">
        <div class="smallcaps">${t(locale, 'flatloan.chartTitle')}</div>
        <svg viewBox="0 0 ${w} ${h}" width="100%" height="220" role="img" aria-label=${svgLabel} style="background:var(--surface);border:1px solid var(--hairline);border-radius:10px; margin-top:8px">
            <title>${svgLabel}</title>
            ${yTicks.map(v => html`<g>
                <line x1=${padL} y1=${y(v)} x2=${w - padR} y2=${y(v)} style="stroke:var(--chart-grid)" stroke-width="1" stroke-dasharray="3 4" />
                <text x=${padL - 6} y=${y(v) + 3} font-size="9" text-anchor="end" style="fill:var(--chart-tick)" font-family="monospace">${fmtTick(v)}</text>
            </g>`)}
            <path d=${line(balance)} fill="none" style="stroke:var(--chart-blue)" stroke-width="2" />
            <path d=${line(interest)} fill="none" style="stroke:var(--chart-orange)" stroke-width="2" />
            ${balance.map((_, i) => i % Math.ceil(balance.length / 6) === 0
                ? html`<text x=${x(i)} y=${h - 8} font-size="9" text-anchor="middle" style="fill:var(--chart-tick)">M${i}</text>`
                : '')}
        </svg>
        <div class="muted" style="font-size:12px; margin-top:4px">
            <span style="color:var(--chart-blue)">— ${balanceLabel}</span> ·
            <span style="color:var(--chart-orange)">— ${interestLabel}</span> ·
            ${t(locale, 'flatloan.totalPayable')} <span title=${formatCurrency(Number(totalPayable) || 0, locale, settings.currency)}>${formatCompactCurrency(Number(totalPayable) || 0, locale, settings.currency)}</span>
        </div>
    </div>`;
}
