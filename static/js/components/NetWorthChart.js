import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { formatCurrency, formatCompactCurrency } from '../utils.js';

// Zero-dependency SVG net-worth chart: buyer wealth (home equity net of
// selling friction + invested surplus) vs renter wealth (down payment plus
// monthly surplus, invested) over the tenor, with a marker at the
// crossover year. Same SVG pattern as RentBuyChart.js (no npm).
export function NetWorthChart({ schedule, breakEvenYear, settings }) {
    const locale = settings.locale;
    const rows = Array.isArray(schedule) ? schedule : [];
    if (rows.length < 2) return html``;

    const buy = rows.map(r => Number(r.buyer_net_worth) || 0);
    const rent = rows.map(r => Number(r.renter_net_worth) || 0);
    const buyLabel = t(locale, 'rentbuy.nwChartBuyer');
    const rentLabel = t(locale, 'rentbuy.nwChartRenter');

    const w = 640, h = 220, padL = 56, padR = 12, padT = 12, padB = 28;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    // Net worth can dip below zero (selling friction on day one), so the
    // domain starts at the data minimum instead of zero.
    const lo = Math.min(0, ...buy, ...rent);
    const hi = Math.max(...buy, ...rent, 1);
    const span = Math.max(hi - lo, 1);
    const x = i => padL + (i / Math.max(rows.length - 1, 1)) * plotW;
    const y = v => padT + plotH - ((v - lo) / span) * plotH;
    const line = arr => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const ticks = 4;
    const yTicks = Array.from({ length: ticks + 1 }, (_, i) => lo + (span * i) / ticks);
    const fmtTick = v => {
        const a = Math.abs(v);
        const s = a >= 1000000 ? `${Math.round(v / 1000000)}M` : a >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`;
        return s;
    };

    let cross = null;
    if (Number.isInteger(breakEvenYear) && breakEvenYear >= 0) {
        const i = rows.findIndex(r => r.year === breakEvenYear);
        if (i >= 0) cross = { x: x(i), y: y(buy[i]) };
    }

    const svgLabel = `${t(locale, 'rentbuy.nwChartTitle')}: ${buyLabel} vs ${rentLabel}`;
    const gap = buy[buy.length - 1] - rent[rent.length - 1];
    return html`<div class="card">
        <div class="smallcaps">${t(locale, 'rentbuy.nwChartTitle')}</div>
        <svg viewBox="0 0 ${w} ${h}" width="100%" height="220" role="img" aria-label=${svgLabel} style="background:var(--surface);border:1px solid var(--hairline);border-radius:10px; margin-top:8px">
            <title>${svgLabel}</title>
            ${yTicks.map(v => html`<g>
                <line x1=${padL} y1=${y(v)} x2=${w - padR} y2=${y(v)} style="stroke:var(--chart-grid)" stroke-width="1" stroke-dasharray="3 4" />
                <text x=${padL - 6} y=${y(v) + 3} font-size="9" text-anchor="end" style="fill:var(--chart-tick)" font-family="monospace">${fmtTick(v)}</text>
            </g>`)}
            ${cross && html`<line x1=${cross.x} y1=${padT} x2=${cross.x} y2=${padT + plotH} style="stroke:var(--chart-tick)" stroke-width="1" stroke-dasharray="4 3" />`}
            <path d=${line(buy)} fill="none" style="stroke:var(--chart-blue)" stroke-width="2" />
            <path d=${line(rent)} fill="none" style="stroke:var(--chart-orange)" stroke-width="2" />
            ${cross && html`<circle cx=${cross.x} cy=${cross.y} r="4.5" style="fill:var(--success);stroke:var(--surface)" stroke-width="2" />`}
            ${rows.map((r, i) => i % Math.ceil(rows.length / 6) === 0
                ? html`<text x=${x(i)} y=${h - 8} font-size="9" text-anchor="middle" style="fill:var(--chart-tick)">Y${r.year}</text>`
                : '')}
        </svg>
        <div class="muted" style="font-size:12px; margin-top:4px">
            <span style="color:var(--chart-blue)">— ${buyLabel}</span> ·
            <span style="color:var(--chart-orange)">— ${rentLabel}</span> ·
            ${t(locale, 'rentbuy.netAdvantage')} <span title=${formatCurrency(gap, locale, settings.currency)}>${formatCompactCurrency(gap, locale, settings.currency)}</span>
        </div>
    </div>`;
}
