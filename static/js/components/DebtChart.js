import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';

// Zero-dependency SVG payoff chart: total remaining balance per month
// under avalanche vs snowball. Series can differ in length; the shorter
// is padded with zeros (debt-free). Same SVG pattern as FlatLoanChart.js.
export function DebtChart({ avalanche, snowball, settings }) {
    const locale = settings.locale;
    const a = Array.isArray(avalanche) ? avalanche.map(Number) : [];
    const s = Array.isArray(snowball) ? snowball.map(Number) : [];
    if (a.length < 2 && s.length < 2) return html``;
    const n = Math.max(a.length, s.length);
    const pad = arr => [...arr, ...Array(Math.max(n - arr.length, 0)).fill(0)];
    const av = pad(a.length ? a : [0]);
    const sn = pad(s.length ? s : [0]);
    const avLabel = t(locale, 'debt.avalanche');
    const snLabel = t(locale, 'debt.snowball');

    const w = 640, h = 220, padL = 56, padR = 12, padT = 12, padB = 28;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const max = Math.max(...av, ...sn, 1);
    const x = i => padL + (i / Math.max(n - 1, 1)) * plotW;
    const y = v => padT + plotH - (Math.max(v, 0) / max) * plotH;
    const line = arr => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const ticks = 4;
    const yTicks = Array.from({ length: ticks + 1 }, (_, i) => Math.round((max * i) / ticks));
    const fmtTick = v => v >= 1000000 ? `${Math.round(v / 1000000)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`;

    const svgLabel = `${t(locale, 'debt.chartTitle')}: ${avLabel} vs ${snLabel}`;
    return html`<div class="card">
        <div class="smallcaps">${t(locale, 'debt.chartTitle')}</div>
        <svg viewBox="0 0 ${w} ${h}" width="100%" height="220" role="img" aria-label=${svgLabel} style="background:var(--surface);border:1px solid var(--hairline);border-radius:10px; margin-top:8px">
            <title>${svgLabel}</title>
            ${yTicks.map(v => html`<g>
                <line x1=${padL} y1=${y(v)} x2=${w - padR} y2=${y(v)} style="stroke:var(--chart-grid)" stroke-width="1" stroke-dasharray="3 4" />
                <text x=${padL - 6} y=${y(v) + 3} font-size="9" text-anchor="end" style="fill:var(--chart-tick)" font-family="monospace">${fmtTick(v)}</text>
            </g>`)}
            <path d=${line(av)} fill="none" style="stroke:var(--chart-blue)" stroke-width="2" />
            <path d=${line(sn)} fill="none" style="stroke:var(--chart-orange)" stroke-width="2" />
            ${Array.from({ length: n }, (_, i) => i).filter(i => i % Math.ceil(n / 6) === 0)
                .map(i => html`<text x=${x(i)} y=${h - 8} font-size="9" text-anchor="middle" style="fill:var(--chart-tick)">M${i}</text>`)}
        </svg>
        <div class="muted" style="font-size:12px; margin-top:4px">
            <span style="color:var(--chart-blue)">— ${avLabel}</span> ·
            <span style="color:var(--chart-orange)">— ${snLabel}</span>
        </div>
    </div>`;
}
