import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';

// Zero-dependency, presentational SVG infographics for the homepage.
// Everything here is a *static illustration*: no API calls, no data
// fetching, so the landing always renders and stays fast/offline-safe.
// Live-data charts live in the per-calculator components instead.

const PAD = 4;

/** Multi-series mini line chart. `series`: [{ points, color, dashed, dots }]. */
export function MiniLines({ series, w = 132, h = 48, label, filledFirst = false }) {
    const all = series.flatMap(s => s.points);
    const max = Math.max(...all);
    const min = Math.min(...all);
    const range = (max - min) || 1;
    const y = v => h - PAD - ((v - min) / range) * (h - PAD * 2);
    const paths = series.map(s => {
        const xs = i => PAD + (i / Math.max(s.points.length - 1, 1)) * (w - PAD * 2);
        const d = s.points.map((v, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
        return { s, xs, d };
    });
    const first = paths[0];
    const area = first ? `${first.d} L${first.xs(first.s.points.length - 1).toFixed(1)},${h - PAD} L${first.xs(0).toFixed(1)},${h - PAD} Z` : '';
    return html`<svg class="mini" viewBox="0 0 ${w} ${h}" width=${w} height=${h}
        role=${label ? 'img' : 'presentation'} aria-label=${label || null} aria-hidden=${label ? null : 'true'}>
        ${filledFirst && first && html`<path d=${area} fill=${first.s.color} opacity="0.12" />`}
        ${paths.map(p => html`<path class="draw" d=${p.d} fill="none" stroke=${p.s.color}
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            stroke-dasharray=${p.s.dashed ? '4 3' : null} />`)}
        ${series.flatMap(p => (p.dots || []).map(i => html`<circle cx=${paths[series.indexOf(p)].xs(i).toFixed(1)} cy=${y(p.points[i]).toFixed(1)} r="2.5" fill=${p.color} />`))}
    </svg>`;
}

/** Mini bar chart. `colors` optional per-bar; otherwise one colour. */
export function MiniBars({ values, colors, color = 'var(--chart-blue)', w = 132, h = 48 }) {
    const max = Math.max(...values, 1);
    const n = values.length;
    const gap = 6;
    const bw = (w - PAD * 2 - gap * (n - 1)) / n;
    return html`<svg class="mini" viewBox="0 0 ${w} ${h}" width=${w} height=${h} aria-hidden="true">
        ${values.map((v, i) => {
            const bh = (v / max) * (h - PAD * 2);
            return html`<rect x=${(PAD + i * (bw + gap)).toFixed(1)} y=${(h - PAD - bh).toFixed(1)}
                width=${bw.toFixed(1)} height=${bh.toFixed(1)} rx="2"
                fill=${(colors && colors[i]) || color} opacity="0.85" />`;
        })}
    </svg>`;
}

/** Ring gauge with a centred value (static illustration of a rate). */
export function MiniGauge({ pct = 0.226, text, label, size = 96, color = 'var(--accent)' }) {
    const r = (size - 14) / 2;
    const c = 2 * Math.PI * r;
    const cx = size / 2;
    const cy = size / 2;
    const frac = Math.max(0, Math.min(1, pct));
    return html`<svg class="mini-gauge" viewBox="0 0 ${size} ${size}" width=${size} height=${size}
        role=${label ? 'img' : 'presentation'} aria-label=${label || null} aria-hidden=${label ? null : 'true'}>
        <circle cx=${cx} cy=${cy} r=${r} fill="none" style="stroke:var(--chart-track)" stroke-width="8" />
        <circle cx=${cx} cy=${cy} r=${r} fill="none" stroke=${color} stroke-width="8" stroke-linecap="round"
            stroke-dasharray=${`${(frac * c).toFixed(1)} ${c.toFixed(1)}`}
            transform=${`rotate(-90 ${cx} ${cy})`} />
        <text x=${cx} y=${cy + 5} text-anchor="middle" font-size="17" font-weight="700" style="fill:currentColor">${text}</text>
    </svg>`;
}

// Per-calculator thumbnail: a tiny shape hinting at what the tool outputs.
const THUMBS = {
    'mutual-funds': () => html`<${MiniLines} filledFirst=${true} series=${[{ points: [4, 6, 9, 13, 18, 24, 31, 40], color: 'var(--chart-blue)' }]} />`,
    stocks: () => html`<${MiniLines} filledFirst=${true} series=${[{ points: [3, 5, 6, 10, 13, 17, 22, 28], color: 'var(--chart-green)', dots: [3, 6] }]} />`,
    'term-deposits': () => html`<${MiniBars} values=${[6, 10, 14, 18, 23, 28]} color="var(--chart-orange)" />`,
    ev: () => html`<${MiniBars} values=${[10, 4.5]} colors=${['var(--chart-orange)', 'var(--chart-blue)']} />`,
    'rent-buy': () => html`<${MiniLines} series=${[
        { points: [2, 3, 4, 5, 6, 7, 8], color: 'var(--chart-orange)' },
        { points: [10, 8.5, 7, 5.5, 4, 2.5, 1], color: 'var(--chart-blue)' },
    ]} />`,
    'flat-loan': () => html`<${MiniBars} values=${[5, 9.4]} colors=${['var(--muted)', 'var(--accent)']} />`,
    'debt-payoff': () => html`<${MiniLines} series=${[
        { points: [10, 9, 7.5, 5.5, 3.5, 1.5], color: 'var(--chart-blue)' },
        { points: [10, 9.4, 8.4, 6.6, 4.2, 1.8], color: 'var(--chart-orange)' },
    ]} />`,
    retire: () => html`<${MiniLines} series=${[
        { points: [1, 2.2, 3.8, 6, 9, 13, 18], color: 'var(--chart-blue)' },
        { points: [18, 18, 18, 18, 18, 18, 18], color: 'var(--chart-tick)', dashed: true },
    ]} />`,
};

export function CalcThumb({ kind }) {
    const render = THUMBS[kind];
    return html`<div class="calc-thumb" aria-hidden="true">${render ? render() : ''}</div>`;
}

// Masthead composite: three asset streams converging on one return figure.
export function ProductDiagram({ settings }) {
    const locale = settings.locale;
    const assets = [
        { name: t(locale, 'nav.mutualFunds'), color: '#7aa5ff', points: [4, 6, 9, 13, 18, 24, 31, 40] },
        { name: t(locale, 'nav.stocks'), color: '#34d399', points: [3, 5, 6, 10, 13, 17, 22, 28] },
        { name: t(locale, 'nav.termDeposits'), color: '#ffb27a', points: [2, 4, 6, 8, 10, 12, 14, 16] },
    ];
    return html`<div class="product-diagram" role="group" aria-label=${t(locale, 'home.mastheadDiagramLabel')}>
        <div class="product-diagram__assets">
            ${assets.map(a => html`<div class="asset-row">
                <span class="asset-row__dot" style=${`background:${a.color}`} aria-hidden="true"></span>
                <span class="asset-row__name">${a.name}</span>
                <${MiniLines} series=${[{ points: a.points, color: a.color }]} w=${92} h=${28} />
            </div>`)}
        </div>
        <div class="product-diagram__arrow" aria-hidden="true">↓</div>
        <div class="product-diagram__result">
            <${MiniGauge} pct=${0.226} text="22.6%" color="var(--accent)" label=${t(locale, 'home.mastheadResultLabel')} />
            <div class="result-metrics" aria-hidden="true">
                ${['XIRR', 'ROI', 'APY'].map(m => html`<span class="metric-pill">${m}</span>`)}
            </div>
        </div>
    </div>`;
}

const STATS = [
    { value: '8', labelKey: 'home.statCalcsLabel', icon: 'grid' },
    { value: '3', labelKey: 'home.statAssetsLabel', icon: 'layers' },
    { value: '0', labelKey: 'home.statSignupLabel', icon: 'lock' },
    { value: '100%', labelKey: 'home.statDeviceLabel', icon: 'device' },
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
        ${STATS.map((s, i) => html`<div class="stat-tile" style=${`animation-delay:${i * 70}ms`}>
            <span class="stat-tile__icon"><${StatIcon} name=${s.icon} /></span>
            <span class="stat-tile__value">${s.value}</span>
            <span class="stat-tile__label">${s.labelKey && t(locale, s.labelKey)}</span>
        </div>`)}
    </section>`;
}

/** Strip the leading "N. " so the badge number and title don't duplicate. */
const stripNum = s => String(s).replace(/^\s*\d+\.\s*/, '');

export function FlowSteps({ settings }) {
    const locale = settings.locale;
    const steps = [1, 2, 3, 4].map(n => ({
        n,
        title: stripNum(t(locale, `home.step${n}Title`)),
        desc: t(locale, `home.step${n}Desc`),
    }));
    return html`<section class="flow" aria-label=${t(locale, 'home.flowTitle')}>
        <h2 class="flow__title">${t(locale, 'home.flowTitle')}</h2>
        <ol class="flow-steps">
            ${steps.map(s => html`<li class="flow-step">
                <span class="flow-step__badge" aria-hidden="true">${s.n}</span>
                <span class="flow-step__body">
                    <strong>${s.title}</strong>
                    <span class="muted">${s.desc}</span>
                </span>
            </li>`)}
        </ol>
    </section>`;
}

// Concept explainers: the "aha" ideas, each linking into its calculator.
const CONCEPTS = [
    {
        path: '/kalkulator/reksa-dana',
        titleKey: 'home.conceptXirrTitle', descKey: 'home.conceptXirrDesc',
        visual: () => html`<${MiniLines} filledFirst=${true} series=${[{ points: [8, 3, 9, 5, 12, 7, 16, 20], color: 'var(--chart-blue)' }]} />`,
    },
    {
        path: '/kalkulator/bunga-flat',
        titleKey: 'home.conceptFlatTitle', descKey: 'home.conceptFlatDesc',
        visual: () => html`<${MiniBars} values=${[5, 9.4]} colors=${['var(--muted)', 'var(--accent)']} />`,
    },
    {
        path: '/kalkulator/dana-pensiun',
        titleKey: 'home.conceptCompoundTitle', descKey: 'home.conceptCompoundDesc',
        visual: () => html`<${MiniLines} filledFirst=${true} series=${[{ points: [1, 1.5, 2.4, 3.8, 6, 9.5, 15], color: 'var(--chart-purple)' }]} />`,
    },
];

export function ConceptBand({ settings, go }) {
    const locale = settings.locale;
    return html`<section aria-label=${t(locale, 'home.conceptTitle')}>
        <p class="smallcaps" style="margin:14px 0 8px">${t(locale, 'home.conceptTitle')}</p>
        <div class="concept-band">
            ${CONCEPTS.map(c => html`<a class="card concept-card" href=${c.path} onClick=${e => go(e, c.path)}>
                <${CalcThumbWrapper} visual=${c.visual} />
                <span class="concept-card__title">${t(locale, c.titleKey)}</span>
                <span class="muted concept-card__desc">${t(locale, c.descKey)}</span>
                <span class="concept-card__link">${t(locale, 'home.cardOpenBlank')} →</span>
            </a>`)}
        </div>
    </section>`;
}

function CalcThumbWrapper({ visual }) {
    return html`<div class="calc-thumb calc-thumb--wide" aria-hidden="true">${visual()}</div>`;
}
