import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { formatPercent } from '../utils.js';

function cell(v, settings) {
    if (v == null) return html`<td class="num muted">—</td>`;
    const cls = v > 0 ? 'mom-positive' : v < 0 ? 'mom-negative' : '';
    return html`<td class="num ${cls}">${formatPercent(v, settings.locale)}</td>`;
}

export function MonthlyReturnsTable({ monthly, settings }) {
    const locale = settings.locale;
    const LABELS = { 'mutual-funds': t(locale, 'nav.mutualFunds'), stocks: t(locale, 'nav.stocks'), 'term-deposits': t(locale, 'nav.termDeposits') };
    if (!monthly || monthly.months.length < 2) {
        return html`<div class="card"><div class="smallcaps">${t(locale, 'monthlyReturns.title')}</div>
            <p class="muted" style="font-size:13px">${t(locale, 'monthlyReturns.insufficient')}</p></div>`;
    }
    return html`<div class="card">
        <div class="smallcaps">${t(locale, 'monthlyReturns.title')}</div>
        <p class="muted" style="font-size:12px">${t(locale, 'monthlyReturns.subtitle')}</p>
        <div class="ledger-table-wrap"><table>
            <thead><tr><th scope="col">${t(locale, 'monthlyReturns.month')}</th><th scope="col">${LABELS['mutual-funds']}</th><th scope="col">${LABELS.stocks}</th><th scope="col">${LABELS['term-deposits']}</th><th scope="col">${t(locale, 'monthlyReturns.portfolio')}</th></tr></thead>
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
