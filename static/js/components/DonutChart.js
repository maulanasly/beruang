import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { formatCurrency } from '../utils.js';

// Zero-dependency SVG port of the legacy Vue PortfolioDonut
// (Chart.js Doughnut → stroked-circle segments; no npm).
export function DonutChart({ series, settings }) {
    const items = (Array.isArray(series) ? series : []).filter(s => s && s.value > 0);
    if (!items.length) return html``;
    const locale = settings.locale;
    const total = items.reduce((s, it) => s + it.value, 0);
    const r = 70, c = 2 * Math.PI * r;
    let acc = 0;
    const segs = items.map(it => {
        const frac = total > 0 ? it.value / total : 0;
        const seg = { ...it, frac, offset: acc };
        acc += frac;
        return seg;
    });

    return html`<div class="card">
        <div class="smallcaps">${t(locale, 'overview.proportion')}</div>
        <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap; margin-top:8px">
            <svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label=${t(locale, 'overview.proportion')}>
                <circle cx="90" cy="90" r=${r} fill="none" stroke="#eee7d8" stroke-width="28" />
                ${segs.map(s => html`<circle cx="90" cy="90" r=${r} fill="none"
                    stroke=${s.color} stroke-width="28"
                    stroke-dasharray=${`${(s.frac * c).toFixed(2)} ${c.toFixed(2)}`}
                    stroke-dashoffset=${(-s.offset * c).toFixed(2)}
                    transform="rotate(-90 90 90)" />`)}
                <text x="90" y="86" font-size="15" text-anchor="middle" font-weight="bold" fill="var(--ink, #333)">${formatCurrency(total, locale, settings.currency)}</text>
                <text x="90" y="104" font-size="10" text-anchor="middle" fill="#777067">${t(locale, 'overview.totalValue')}</text>
            </svg>
            <div style="display:flex; flex-direction:column; gap:6px; font-size:13px">
                ${segs.map(s => html`<div style="display:flex; align-items:center; gap:8px">
                    <span style="display:inline-block; width:12px; height:12px; border-radius:3px; background:${s.color}"></span>
                    <span>${s.label}</span>
                    <span class="muted">${formatCurrency(s.value, locale, settings.currency)} (${(s.frac * 100).toFixed(1)}%)</span>
                </div>`)}
            </div>
        </div>
    </div>`;
}
