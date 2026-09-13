import { html } from '../vendor/preact-htm-signals.js';
import { formatCurrency, formatPercent } from '../utils.js';
import { t } from '../i18n.js';

export function LedgerTable({ rows, settings, columns }) {
    const locale = settings.locale;
    if (!rows || !rows.length) return html`<p class="muted">${t(locale, 'ledger.empty')}</p>`;
    return html`<div class="ledger-table-wrap"><table>
        <thead><tr>${columns.map(c=> html`<th scope="col">${c.label}</th>`)}</tr></thead>
        <tbody>
            ${rows.map(r=> html`<tr>
                ${columns.map(c=>{
                    const v = r[c.key];
                    if (v==null) return html`<td>-</td>`;
                    if (c.fmt==='currency') return html`<td class="num">${formatCurrency(v, settings.locale, settings.currency)}</td>`;
                    if (c.fmt==='percent') return html`<td class="num">${formatPercent(v, settings.locale)}</td>`;
                    return html`<td>${String(v)}</td>`;
                })}
            </tr>`)}
        </tbody>
    </table></div>`;
}

export function SummaryCards({ summary, settings }) {
    if (!summary) return html``;
    const entries = Object.entries(summary);
    return html`<div class="summary-cards">
        ${entries.map(([k,v])=> {
            const isPct = ['xirr','roi','apy','monthly_rate','dividend_yield'].includes(k);
            const isDate = k.includes('date');
            const display = v==null ? '-' : isDate ? String(v) : isPct ? formatPercent(v, settings.locale) : typeof v==='number' ? formatCurrency(v, settings.locale, settings.currency) : String(v);
            return html`<div class="card"><div class="smallcaps">${k}</div><div class="amount" style="font-size:15px">${display}</div></div>`;
        })}
    </div>`;
}
