import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { formatCurrency } from '../utils.js';

// Zero-dependency SVG chart (legacy Vue LineChart parity):
// per-asset invested-vs-value (term deposits: expected vs value).
// Reuses the TrendChart.js SVG pattern (no npm).
export function AssetChart({ ledger, asset, settings }) {
    const rows = Array.isArray(ledger) ? ledger : [];
    const locale = settings.locale;
    if (!rows.length) return html``;

    const labels = rows.map(r => String(r.date));
    let investedLabel = t(locale, 'chart.seriesInvested');
    let invested;
    if (asset === 'stocks') {
        let running = 0;
        invested = rows.map(r => {
            running += (Number(r.installment_amount) || 0) + (Number(r.new_share_purchases) || 0);
            return running;
        });
    } else if (asset === 'term-deposits') {
        investedLabel = t(locale, 'chart.seriesExpected');
        invested = rows.map(r => Number(r.expected_month_end_value) || 0);
    } else {
        let running = 0;
        invested = rows.map(r => {
            running += Number(r.installment_amount) || 0;
            return running;
        });
    }
    const values = rows.map(r => Number(r.current_value) || 0);
    const valueLabel = t(locale, 'chart.seriesValue');

    if (labels.length < 2) {
        return html`<div class="card"><div class="smallcaps">${t(locale, 'chart.title')}</div><p class="muted" style="font-size:13px">${t(locale, 'ledger.empty')}</p></div>`;
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

    const svgLabel = `${t(locale, 'chart.title')}: ${investedLabel} vs ${valueLabel}`;
    return html`<div class="card">
        <div class="smallcaps">${t(locale, 'chart.title')}</div>
        <svg viewBox="0 0 ${w} ${h}" width="100%" height="220" role="img" aria-label=${svgLabel} style="background:var(--surface);border:1px solid var(--hairline);border-radius:10px; margin-top:8px">
            <title>${svgLabel}</title>
            ${yTicks.map(v => html`<g>
                <line x1=${padL} y1=${y(v)} x2=${w - padR} y2=${y(v)} stroke="#e7e0d3" stroke-width="1" stroke-dasharray="3 4" />
                <text x=${padL - 6} y=${y(v) + 3} font-size="9" text-anchor="end" fill="#777067" font-family="monospace">${v >= 1000 ? `${Math.round(v / 1000)}k` : v}</text>
            </g>`)}
            <path d=${line(invested)} fill="none" stroke="#2563eb" stroke-width="2" />
            <path d=${line(values)} fill="none" stroke="#f25f3a" stroke-width="2" />
            ${labels.map((l, i) => i % Math.ceil(labels.length / 6) === 0
                ? html`<text x=${x(i)} y=${h - 8} font-size="9" text-anchor="middle" fill="#777067">${String(l).slice(2)}</text>`
                : '')}
        </svg>
        <div class="muted" style="font-size:12px; margin-top:4px">
            <span style="color:#2563eb">— ${investedLabel}</span> ·
            <span style="color:#f25f3a">— ${valueLabel}</span> ·
            ${t(locale, 'ui.latest')} ${formatCurrency(values[values.length - 1], locale, settings.currency)}
        </div>
    </div>`;
}
