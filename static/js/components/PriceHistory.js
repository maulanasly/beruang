import { html, useState } from '../vendor/preact-htm-signals.js';
import { fetchPriceHistory } from '../api.js';
import { formatPercent } from '../utils.js';

const PERIODS = ['1mo', '3mo', '6mo', '1y', '5y'];

export function PriceHistory({ symbol }) {
    const [period, setPeriod] = useState('1y');
    const [points, setPoints] = useState([]);
    const [name, setName] = useState('');
    const [yield_, setYield] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [loaded, setLoaded] = useState(false);

    async function load() {
        const sym = String(symbol || '').trim().toUpperCase();
        if (sym.length < 3) return;
        setLoading(true); setError('');
        try {
            const data = await fetchPriceHistory(sym, period);
            setPoints(data.points || []); setName(data.name || sym);
            setYield(data.dividend_yield ?? null); setLoaded(true);
        } catch (e) { setError(e.message); setPoints([]); setLoaded(false); }
        finally { setLoading(false); }
    }

    const closes = points.map(p => p.close).filter(v => typeof v === 'number');
    const min = closes.length ? Math.min(...closes) : 0;
    const max = closes.length ? Math.max(...closes) : 1;
    const w = 560, h = 140, pad = 8;
    const x = i => pad + (i / Math.max(closes.length - 1, 1)) * (w - pad * 2);
    const y = v => pad + (1 - (v - min) / Math.max(max - min, 1e-9)) * (h - pad * 2);
    const d = closes.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

    return html`<div class="card">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">
            <h2 style="margin:0">Price History</h2>
            ${yield_ != null && html`<span class="muted" style="font-size:12px; border:1px solid var(--hairline); border-radius:999px; padding:2px 8px">yield ${formatPercent(yield_, 'en-US')}</span>`}
            <span style="flex:1"></span>
            <select value=${period} onChange=${e => setPeriod(e.target.value)} style="width:auto">
                ${PERIODS.map(p => html`<option value=${p}>${p}</option>`)}
            </select>
            <button class="btn-ghost btn-sm" onClick=${load} disabled=${loading}>${loading ? 'Loading…' : 'Load'}</button>
        </div>
        ${error && html`<p style="color:var(--danger); font-size:13px">${error}</p>`}
        ${loaded && !closes.length && html`<p class="muted" style="font-size:13px">No historical price data available for this symbol.</p>`}
        ${closes.length > 1 && html`<div>
            <p class="muted" style="font-size:12px">${name} · ${closes.length} closes</p>
            <svg viewBox="0 0 ${w} ${h}" width="100%" height="140" style="background:var(--surface);border:1px solid var(--hairline);border-radius:10px">
                <path d=${d} fill="none" stroke="#2563eb" stroke-width="1.5" />
            </svg>
        </div>`}
    </div>`;
}
