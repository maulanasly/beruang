import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { fetchDividendYields } from '../api.js';
import { formatCurrency, formatPercent } from '../utils.js';

export function DividendFocus({ settings, onApply }) {
    const locale = settings.locale;
    const [items, setItems] = useState([]);
    const [asOf, setAsOf] = useState(null);
    const [stale, setStale] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function load() {
        setLoading(true); setError('');
        try {
            const data = await fetchDividendYields(10);
            setItems(data.items || []); setAsOf(data.as_of || null);
            setStale(!!data.delayed);
        } catch (e) { setError(e.message); setItems([]); }
        finally { setLoading(false); }
    }
    useEffect(() => { load(); }, []);

    return html`<div class="card">
        <div style="display:flex; align-items:center; gap:8px">
            <h2 style="margin:0">${t(locale, 'dividendFocus.title')}</h2>
            <span style="flex:1"></span>
            <button class="btn-ghost btn-sm" onClick=${load} disabled=${loading}>${loading ? t(locale, 'dividendFocus.loading') : t(locale, 'dividendFocus.refresh')}</button>
        </div>
        ${asOf && html`<p class="muted" style="font-size:12px">${stale ? t(locale, 'market.delayedAsOf', { date: asOf }) : `As of ${asOf}`}</p>`}
        ${error && html`<p style="color:var(--danger); font-size:13px">${error}</p>`}
        ${!loading && !error && !items.length
            ? html`<p class="muted" style="font-size:13px">${t(locale, 'dividendFocus.empty')}</p>`
            : html`<div class="ledger-table-wrap"><table>
                <thead><tr><th scope="col">${t(locale, 'dividendFocus.rank')}</th><th scope="col">${t(locale, 'column.stockCode')}</th><th scope="col">${t(locale, 'dividendFocus.name')}</th><th scope="col" class="num">${t(locale, 'dividendFocus.price')}</th><th scope="col" class="num">${t(locale, 'column.dividendYield')}</th><th scope="col"><span class="visually-hidden">${t(locale, 'common.action')}</span></th></tr></thead>
                <tbody>
                    ${items.map((it, i) => html`<tr>
                        <td>${i + 1}</td>
                        <td style="font-family:monospace">${it.symbol}</td>
                        <td>${it.name}</td>
                        <td class="num">${formatCurrency(it.price, settings.locale, it.currency || settings.currency)}</td>
                        <td class="num">${formatPercent(it.dividend_yield, settings.locale)}</td>
                        <td>${onApply ? html`<button class="btn-ghost btn-sm" onClick=${() => onApply(it.symbol, (it.dividend_yield * 100).toFixed(2))}>${t(locale, 'dividendFocus.apply')}</button>` : ''}</td>
                    </tr>`)}
                </tbody>
            </table></div>`}
    </div>`;
}
