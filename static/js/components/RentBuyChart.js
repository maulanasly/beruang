import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { formatCurrency } from '../utils.js';

// Zero-dependency SVG crossover chart: cumulative cash paid buying vs
// renting over the tenor, with a breakeven marker when the lines cross.
// Reuses the TrendChart.js SVG pattern (no npm).
export function RentBuyChart({ schedule, breakEvenMonths, settings }) {
    const locale = settings.locale;
    const rows = Array.isArray(schedule) ? schedule : [];
    if (rows.length < 2) return html``;

    const buy = rows.map(r => Number(r.cum_buy) || 0);
    const rent = rows.map(r => Number(r.cum_rent) || 0);
    const buyLabel = t(locale, 'rentbuy.chartBuy');
    const rentLabel = t(locale, 'rentbuy.chartRent');

    const w = 640, h = 220, padL = 56, padR = 12, padT = 12, padB = 28;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const max = Math.max(...buy, ...rent, 1);
    const x = i => padL + (i / Math.max(rows.length - 1, 1)) * plotW;
    const y = v => padT + plotH - (Math.max(v, 0) / max) * plotH;
    const line = arr => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const ticks = 4;
    const yTicks = Array.from({ length: ticks + 1 }, (_, i) => Math.round((max * i) / ticks));

    // Breakeven sits between yearly points; interpolate its plot position.
    let crossX = null;
    if (Number.isFinite(breakEvenMonths) && breakEvenMonths > 0) {
        const yearFloat = breakEvenMonths / 12;
        const i = Math.min(Math.floor(yearFloat), rows.length - 2);
        const frac = Math.min(Math.max(yearFloat - i, 0), 1);
        const buyI = buy[i] + (buy[i + 1] - buy[i]) * frac;
        const rentI = rent[i] + (rent[i + 1] - rent[i]) * frac;
        crossX = { x: padL + ((i + frac) / Math.max(rows.length - 1, 1)) * plotW, y: y((buyI + rentI) / 2) };
    }

    const svgLabel = `${t(locale, 'rentbuy.chartTitle')}: ${buyLabel} vs ${rentLabel}`;
    return html`<div class="card">
        <div class="smallcaps">${t(locale, 'rentbuy.chartTitle')}</div>
        <svg viewBox="0 0 ${w} ${h}" width="100%" height="220" role="img" aria-label=${svgLabel} style="background:var(--surface);border:1px solid var(--hairline);border-radius:10px; margin-top:8px">
            <title>${svgLabel}</title>
            ${yTicks.map(v => html`<g>
                <line x1=${padL} y1=${y(v)} x2=${w - padR} y2=${y(v)} style="stroke:var(--chart-grid)" stroke-width="1" stroke-dasharray="3 4" />
                <text x=${padL - 6} y=${y(v) + 3} font-size="9" text-anchor="end" style="fill:var(--chart-tick)" font-family="monospace">${v >= 1000000 ? `${Math.round(v / 1000000)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : v}</text>
            </g>`)}
            ${crossX && html`<line x1=${crossX.x} y1=${padT} x2=${crossX.x} y2=${padT + plotH} style="stroke:var(--chart-tick)" stroke-width="1" stroke-dasharray="4 3" />`}
            <path d=${line(buy)} fill="none" style="stroke:var(--chart-blue)" stroke-width="2" />
            <path d=${line(rent)} fill="none" style="stroke:var(--chart-orange)" stroke-width="2" />
            ${crossX && html`<circle cx=${crossX.x} cy=${crossX.y} r="4.5" style="fill:var(--success);stroke:var(--surface)" stroke-width="2" />`}
            ${rows.map((r, i) => i % Math.ceil(rows.length / 6) === 0
                ? html`<text x=${x(i)} y=${h - 8} font-size="9" text-anchor="middle" style="fill:var(--chart-tick)">Y${r.year}</text>`
                : '')}
        </svg>
        <div class="muted" style="font-size:12px; margin-top:4px">
            <span style="color:var(--chart-blue)">— ${buyLabel}</span> ·
            <span style="color:var(--chart-orange)">— ${rentLabel}</span> ·
            ${t(locale, 'rentbuy.totalBuy')} ${formatCurrency(buy[buy.length - 1], locale, settings.currency)}
        </div>
    </div>`;
}
