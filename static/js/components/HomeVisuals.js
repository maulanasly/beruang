import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';

// Zero-dependency SVG bars for actual deposit schedules. Homepage concepts
// use text links instead of illustrative charts that could read as results.

const PAD = 4;

/** Mini bar chart. `colors` optional per-bar; `titles` per-bar tooltips. */
export function MiniBars({ values, colors, titles, color = 'var(--chart-blue)', w = 132, h = 48 }) {
    const max = Math.max(...values, 1);
    const n = values.length;
    const gap = 6;
    const bw = (w - PAD * 2 - gap * (n - 1)) / n;
    return html`<svg class="mini" viewBox="0 0 ${w} ${h}" width=${w} height=${h} aria-hidden="true">
        ${values.map((v, i) => {
            const bh = (v / max) * (h - PAD * 2);
            return html`<rect x=${(PAD + i * (bw + gap)).toFixed(1)} y=${(h - PAD - bh).toFixed(1)}
                width=${bw.toFixed(1)} height=${bh.toFixed(1)} rx="2"
                fill=${(colors && colors[i]) || color} opacity="0.85"
                >${titles && titles[i] ? html`<title>${titles[i]}</title>` : ''}</rect>`;
        })}
    </svg>`;
}

const STATS = [
    { value: '9', labelKey: 'home.statCalcsLabel', icon: 'grid' },
    { value: '3', labelKey: 'home.statAssetsLabel', icon: 'layers' },
    { value: '0', labelKey: 'home.statSignupLabel', icon: 'lock' },
];

function StatIcon({ name }) {
    const a = { width: '18', height: '18', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' };
    if (name === 'grid') return html`<svg width=${a.width} height=${a.height} viewBox=${a.viewBox} fill=${a.fill} stroke=${a.stroke} stroke-width=${a['stroke-width']} stroke-linecap=${a['stroke-linecap']} stroke-linejoin=${a['stroke-linejoin']} aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;
    if (name === 'layers') return html`<svg width=${a.width} height=${a.height} viewBox=${a.viewBox} fill=${a.fill} stroke=${a.stroke} stroke-width=${a['stroke-width']} stroke-linecap=${a['stroke-linecap']} stroke-linejoin=${a['stroke-linejoin']} aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></svg>`;
    if (name === 'lock') return html`<svg width=${a.width} height=${a.height} viewBox=${a.viewBox} fill=${a.fill} stroke=${a.stroke} stroke-width=${a['stroke-width']} stroke-linecap=${a['stroke-linecap']} stroke-linejoin=${a['stroke-linejoin']} aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`;
    return html`<svg width=${a.width} height=${a.height} viewBox=${a.viewBox} fill=${a.fill} stroke=${a.stroke} stroke-width=${a['stroke-width']} stroke-linecap=${a['stroke-linecap']} stroke-linejoin=${a['stroke-linejoin']} aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>`;
}

export function StatStrip({ settings }) {
    const locale = settings.locale;
    return html`<section class="stat-strip" aria-label=${t(locale, 'home.statStripLabel')}>
        ${STATS.map(s => html`<div class="stat-tile">
            <span class="stat-tile__icon"><${StatIcon} name=${s.icon} /></span>
            ${s.value && html`<span class="stat-tile__value">${s.value}</span>`}
            <span class="stat-tile__label">${s.labelKey && t(locale, s.labelKey)}</span>
        </div>`)}
    </section>`;
}

// Concept explainers: the "aha" ideas, each linking into its calculator.
const CONCEPTS = [
    {
        path: '/kalkulator/reksa-dana',
        titleKey: 'home.conceptXirrTitle', descKey: 'home.conceptXirrDesc',
    },
    {
        path: '/kalkulator/bunga-flat',
        titleKey: 'home.conceptFlatTitle', descKey: 'home.conceptFlatDesc',
    },
    {
        path: '/kalkulator/dana-pensiun',
        titleKey: 'home.conceptCompoundTitle', descKey: 'home.conceptCompoundDesc',
    },
];

export function ConceptBand({ settings, go }) {
    const locale = settings.locale;
    return html`<section aria-label=${t(locale, 'home.conceptTitle')}>
        <h2 class="concept-band__heading">${t(locale, 'home.conceptTitle')}</h2>
        <div class="concept-band">
            ${CONCEPTS.map(c => html`<a class="concept-row" href=${c.path} onClick=${e => go(e, c.path)}>
                <h3 class="concept-row__title">${t(locale, c.titleKey)}</h3>
                <span class="muted concept-row__desc">${t(locale, c.descKey)}</span>
            </a>`)}
        </div>
    </section>`;
}
