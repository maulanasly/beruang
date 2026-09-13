import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { fetchDividendYields } from '../api.js';
import { formatCurrency, formatPercent } from '../utils.js';

export function DividendFocus({ settings, onApply }) {
    const [items, setItems] = useState([]);
    const [asOf, setAsOf] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function load() {
        setLoading(true); setError('');
        try {
            const data = await fetchDividendYields(10);
            setItems(data.items || []); setAsOf(data.as_of || null);
        } catch (e) { setError(e.message); setItems([]); }
        finally { setLoading(false); }
    }
    useEffect(() => { load(); }, []);

    return html`<div class="card">
        <div style="display:flex; align-items:center; gap:8px">
            <h2 style="margin:0">Dividend Focus</h2>
            <span style="flex:1"></span>
            <button class="btn-ghost btn-sm" onClick=${load} disabled=${loading}>${loading ? 'Loading…' : 'Refresh'}</button>
        </div>
        ${asOf && html`<p class="muted" style="font-size:12px">As of ${asOf}</p>`}
        ${error && html`<p style="color:var(--danger); font-size:13px">${error}</p>`}
        ${!loading && !error && !items.length
            ? html`<p class="muted" style="font-size:13px">No dividend yield data available for the Kompas 100 Starter universe.</p>`
            : html`<div class="ledger-table-wrap"><table>
                <thead><tr><th>#</th><th>Symbol</th><th>Name</th><th class="num">Price</th><th class="num">Yield</th><th></th></tr></thead>
                <tbody>
                    ${items.map((it, i) => html`<tr>
                        <td>${i + 1}</td>
                        <td style="font-family:monospace">${it.symbol}</td>
                        <td>${it.name}</td>
                        <td class="num">${formatCurrency(it.price, settings.locale, it.currency || settings.currency)}</td>
                        <td class="num">${formatPercent(it.dividend_yield, settings.locale)}</td>
                        <td>${onApply ? html`<button class="btn-ghost btn-sm" onClick=${() => onApply(it.symbol, (it.dividend_yield * 100).toFixed(2))}>Apply to Row</button>` : ''}</td>
                    </tr>`)}
                </tbody>
            </table></div>`}
    </div>`;
}
