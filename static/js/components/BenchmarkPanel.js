import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { fetchIndexHistory } from '../api.js';
import { buildComparison } from '../finance.js';

const PERIOD_KEYS = { '1mo': 'benchmark.period1mo', '3mo': 'benchmark.period3mo', '6mo': 'benchmark.period6mo', '1y': 'benchmark.period1y', '5y': 'benchmark.period5y' };
const PERIODS = ['1mo', '3mo', '6mo', '1y', '5y'];

export function BenchmarkPanel({ labels, values, settings }) {
    const locale = settings?.locale || 'en-US';
    useEffect(() => { if (labels && labels.length >= 2) load(); }, []);
    const INDEXES = [
        { value: '^JKSE', label: t(locale, 'benchmark.idxComposite') },
        { value: '^JKLQ45', label: t(locale, 'benchmark.lq45') },
    ];
    const [symbol, setSymbol] = useState('^JKSE');
    const [period, setPeriod] = useState('1y');
    const [comp, setComp] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function load() {
        if (!labels || labels.length < 2) { setError(t(locale, 'benchmark.tooFewPoints')); return; }
        setLoading(true); setError('');
        try {
            const data = await fetchIndexHistory(symbol, period);
            const c = buildComparison(labels, values, data.points || []);
            if (!c) setError(t(locale, 'benchmark.noOverlap'));
            setComp(c);
        } catch (e) { setError(t(locale, 'benchmark.fetchFailed')); setComp(null); }
        finally { setLoading(false); }
    }

    const w = 640, h = 220, padL = 44, padR = 12, padT = 12, padB = 28;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    let chart = '';
    if (comp) {
        const all = [...comp.portfolio, ...comp.index];
        const min = Math.min(...all), max = Math.max(...all);
        const x = i => padL + (i / Math.max(comp.labels.length - 1, 1)) * plotW;
        const y = v => padT + (1 - (v - min) / Math.max(max - min, 1e-9)) * plotH;
        const line = arr => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
        chart = html`<svg viewBox="0 0 ${w} ${h}" width="100%" height="220" style="background:var(--surface);border:1px solid var(--hairline);border-radius:10px; margin-top:8px">
            <path d=${line(comp.portfolio)} fill="none" stroke="#2563eb" stroke-width="2" />
            <path d=${line(comp.index)} fill="none" stroke="#8b5cf6" stroke-width="2" stroke-dasharray="5 3" />
            ${comp.labels.map((l, i) => i % Math.ceil(comp.labels.length / 6) === 0
                ? html`<text x=${x(i)} y=${h - 8} font-size="9" text-anchor="middle" fill="#777067">${String(l).slice(2)}</text>` : '')}
        </svg>
        <div class="muted" style="font-size:12px; margin-top:4px">
            <span style="color:#2563eb">— ${t(locale, 'benchmark.portfolioSeries')}</span> · <span style="color:#8b5cf6">— ${t(locale, 'benchmark.indexSeries')}</span>
        </div>`;
    }

    return html`<div class="card">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">
            <h2 style="margin:0">${t(locale, 'benchmark.title')}</h2>
            <span style="flex:1"></span>
            <label class="muted" style="font-size:12px">${t(locale, 'benchmark.indexSelect')}
                <select value=${symbol} onChange=${e => setSymbol(e.target.value)} style="width:auto">
                    ${INDEXES.map(o => html`<option value=${o.value}>${o.label}</option>`)}
                </select>
            </label>
            <select value=${period} onChange=${e => setPeriod(e.target.value)} style="width:auto" aria-label=${t(locale, 'benchmark.indexSelect')}>
                ${PERIODS.map(p => html`<option value=${p}>${t(locale, PERIOD_KEYS[p])}</option>`)}
            </select>
            <button class="btn-ghost btn-sm" onClick=${load} disabled=${loading}>${loading ? t(locale, 'benchmark.loading') : t(locale, 'ui.compare')}</button>
        </div>
        ${error && html`<p style="color:var(--danger); font-size:13px">${error}</p>`}
        ${chart}
    </div>`;
}
