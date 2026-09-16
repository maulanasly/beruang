import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { formatCurrency, formatCompactCurrency } from '../utils.js';

// Zero-dependency SVG fund chart: projected fund trajectory climbing
// toward the flat target fund over the years to retirement. Same SVG
// pattern as NetWorthChart.js (no npm).
export function RetireChart({ schedule, targetFund, settings }) {
    const locale = settings.locale;
    const rows = Array.isArray(schedule) ? schedule : [];
    if (rows.length < 2) return html``;

    const fund = rows.map(r => Number(r.fund_value) || 0);
    const target = rows.map(r => Number(r.target_fund) || 0);
    const fundLabel = t(locale, 'retire.chartFund');
    const targetLabel = t(locale, 'retire.chartTarget');

    const w = 640, h = 220, padL = 56, padR = 12, padT = 12, padB = 28;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const max = Math.max(...fund, ...target, 1);
    const x = i => padL + (i / Math.max(rows.length - 1, 1)) * plotW;
    const y = v => padT + plotH - (Math.max(v, 0) / max) * plotH;
    const line = arr => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const ticks = 4;
    const yTicks = Array.from({ length: ticks + 1 }, (_, i) => Math.round((max * i) / ticks));
    const fmtTick = v => v >= 1000000000 ? `${Math.round(v / 1000000000)}B` : v >= 1000000 ? `${Math.round(v / 1000000)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`;

    const svgLabel = `${t(locale, 'retire.chartTitle')}: ${fundLabel} vs ${targetLabel}`;
    return html`<div class="card">
        <div class="smallcaps">${t(locale, 'retire.chartTitle')}</div>
        <svg viewBox="0 0 ${w} ${h}" width="100%" height="220" role="img" aria-label=${svgLabel} style="background:var(--surface);border:1px solid var(--hairline);border-radius:10px; margin-top:8px">
            <title>${svgLabel}</title>
            ${yTicks.map(v => html`<g>
                <line x1=${padL} y1=${y(v)} x2=${w - padR} y2=${y(v)} style="stroke:var(--chart-grid)" stroke-width="1" stroke-dasharray="3 4" />
                <text x=${padL - 6} y=${y(v) + 3} font-size="9" text-anchor="end" style="fill:var(--chart-tick)" font-family="monospace">${fmtTick(v)}</text>
            </g>`)}
            <path d=${line(target)} fill="none" style="stroke:var(--chart-tick)" stroke-width="1" stroke-dasharray="4 3" />
            <path d=${line(fund)} fill="none" style="stroke:var(--chart-blue)" stroke-width="2" />
            ${rows.map((r, i) => i % Math.ceil(rows.length / 6) === 0
                ? html`<text x=${x(i)} y=${h - 8} font-size="9" text-anchor="middle" style="fill:var(--chart-tick)">Y${r.year}</text>`
                : '')}
        </svg>
        <div class="muted" style="font-size:12px; margin-top:4px">
            <span style="color:var(--chart-blue)">— ${fundLabel}</span> ·
            <span style="color:var(--chart-tick)">- - ${targetLabel}</span> ·
            ${t(locale, 'retire.targetFund')} <span title=${formatCurrency(Number(targetFund) || 0, locale, settings.currency)}>${formatCompactCurrency(Number(targetFund) || 0, locale, settings.currency)}</span>
        </div>
    </div>`;
}
