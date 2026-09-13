import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { formatCurrency } from '../utils.js';

// Zero-dependency SVG line chart: cumulative invested vs portfolio value.
// Mirrors monthly-logs Chart.js canvas pattern (no npm).
export function TrendChart({ labels, invested, values, settings }) {
    const locale = settings.locale;
    if (!labels || labels.length < 2) {
        return html`<div class="card"><div class="smallcaps">${t(locale, 'chart.title')}</div><p class="muted" style="font-size:13px">${t(locale, 'ui.trendEmpty')}</p></div>`;
    }
    const w = 640, h = 220, padL = 56, padR = 12, padT = 12, padB = 28;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const all = [...invested, ...values].filter(v => typeof v === 'number');
    const max = Math.max(...all, 1);
    const x = i => padL + (i / Math.max(labels.length - 1, 1)) * plotW;
    const y = v => padT + plotH - (Math.max(v, 0) / max) * plotH;
    const line = arr => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const ticks = 4;
    const yTicks = Array.from({ length: ticks + 1 }, (_, i) => Math.round((max * i) / ticks));

    const svgLabel = `${t(locale, 'chart.title')}: ${t(locale, 'chart.seriesInvested')} vs ${t(locale, 'chart.seriesValue')}`;
    return html`<div class="card">
        <div class="smallcaps">${t(locale, 'chart.title')}</div>
        <svg viewBox="0 0 ${w} ${h}" width="100%" height="220" role="img" aria-label=${svgLabel} style="background:var(--surface);border:1px solid var(--hairline);border-radius:10px; margin-top:8px">
            <title>${svgLabel}</title>
            ${yTicks.map(v => html`<g>
                <line x1=${padL} y1=${y(v)} x2=${w - padR} y2=${y(v)} style="stroke:var(--chart-grid)" stroke-width="1" stroke-dasharray="3 4" />
                <text x=${padL - 6} y=${y(v) + 3} font-size="9" text-anchor="end" style="fill:var(--chart-tick)" font-family="monospace">${v >= 1000 ? `${Math.round(v / 1000)}k` : v}</text>
            </g>`)}
            <path d=${line(invested)} fill="none" style="stroke:var(--chart-blue)" stroke-width="2" />
            <path d=${line(values)} fill="none" style="stroke:var(--chart-orange)" stroke-width="2" />
            ${labels.map((l, i) => i % Math.ceil(labels.length / 6) === 0
                ? html`<text x=${x(i)} y=${h - 8} font-size="9" text-anchor="middle" style="fill:var(--chart-tick)">${String(l).slice(2)}</text>`
                : '')}
        </svg>
        <div class="muted" style="font-size:12px; margin-top:4px">
            <span style="color:var(--chart-blue)">— ${t(locale, 'chart.seriesInvested')}</span> ·
            <span style="color:var(--chart-orange)">— ${t(locale, 'chart.seriesValue')}</span> ·
            ${t(locale, 'ui.latest')} ${formatCurrency(values[values.length - 1], settings.locale, settings.currency)}
        </div>
    </div>`;
}
