import { html } from '../vendor/preact-htm-signals.js';
import { formatPercent } from '../utils.js';

const LABELS = { 'mutual-funds': 'Mutual Funds', stocks: 'Stocks', 'term-deposits': 'Term Deposits' };

function cell(v, settings) {
    if (v == null) return html`<td class="num muted">—</td>`;
    const cls = v > 0 ? 'mom-positive' : v < 0 ? 'mom-negative' : '';
    return html`<td class="num ${cls}">${formatPercent(v, settings.locale)}</td>`;
}

export function MonthlyReturnsTable({ monthly, settings }) {
    if (!monthly || monthly.months.length < 2) {
        return html`<div class="card"><div class="smallcaps">Monthly Returns</div>
            <p class="muted" style="font-size:13px">Add entries across at least two months to see month-over-month returns.</p></div>`;
    }
    return html`<div class="card">
        <div class="smallcaps">Monthly Returns</div>
        <p class="muted" style="font-size:12px">Cash-flow adjusted month-over-month change per asset class and portfolio.</p>
        <div class="ledger-table-wrap"><table>
            <thead><tr><th>Month</th><th>Mutual Funds</th><th>Stocks</th><th>Term Deposits</th><th>Portfolio</th></tr></thead>
            <tbody>
                ${monthly.months.map((m, i) => html`<tr>
                    <td>${m}</td>
                    ${cell(monthly.byAsset['mutual-funds'][i], settings)}
                    ${cell(monthly.byAsset.stocks[i], settings)}
                    ${cell(monthly.byAsset['term-deposits'][i], settings)}
                    ${cell(monthly.portfolio[i], settings)}
                </tr>`)}
            </tbody>
        </table></div>
    </div>`;
}
