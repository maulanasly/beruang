import { html, useState } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { formatCellValue } from '../utils.js';
import { InfoTip } from './InfoTip.js';

// Port of the legacy Vue DepositMaturityPanel: maturity tracker
// with rollover suggestions, driven by the term-deposit result.
export function MaturityPanel({ summary, ledger, settings, onRollover }) {
    const [open, setOpen] = useState(true);
    const locale = settings.locale;
    const currency = settings.currency;
    const fmt = (key, value) => formatCellValue(key, value, locale, currency);
    const rows = (Array.isArray(ledger) ? ledger : []).filter(r => r && typeof r === 'object' && r.maturity_status);
    const sum = summary || {};

    function statusLabel(status) {
        return status === 'matured' ? t(locale, 'depositMaturity.matured') : t(locale, 'depositMaturity.active');
    }
    function daysText(row) {
        const days = Number(row.days_to_maturity);
        if (row.maturity_status === 'matured') return t(locale, 'depositMaturity.maturedDaysAgo', { days: Math.abs(days) });
        if (days <= 0) return t(locale, 'depositMaturity.maturesToday');
        return t(locale, 'depositMaturity.daysLeft', { days });
    }
    function rolloverSuggestion(row) {
        const days = Number(row.days_to_maturity);
        if (row.maturity_status === 'matured') return t(locale, 'depositMaturity.rolloverMatured');
        if (days <= 30) return t(locale, 'depositMaturity.rolloverSoon', { value: fmt('value', row.maturity_value) });
        return t(locale, 'depositMaturity.holding');
    }

    const cards = [];
    if (sum.next_maturity_date) cards.push({ label: t(locale, 'depositMaturity.nextMaturity'), value: String(sum.next_maturity_date) });
    if (typeof sum.total_accrued_interest === 'number') cards.push({ label: t(locale, 'depositMaturity.totalAccruedInterest'), value: fmt('interest', sum.total_accrued_interest) });
    if (typeof sum.rollover_value === 'number') cards.push({ label: t(locale, 'depositMaturity.rolloverValue'), value: fmt('value', sum.rollover_value) });
    if (typeof sum.apy === 'number') cards.push({ label: t(locale, 'depositMaturity.rate'), value: fmt('apy', sum.apy) });

    return html`<section class="card">
        <div style="display:flex; align-items:center; gap:8px">
            <button class="btn-ghost btn-sm" onClick=${() => setOpen(!open)} aria-expanded=${open}>
                <span style=${open ? 'display:inline-block; transform:rotate(90deg)' : ''}>▸</span>
                ${' '}${t(locale, 'depositMaturity.title')}
            </button>
            <${InfoTip} locale=${locale} tipKey="glossary.depositMaturity" />
        </div>
        ${open && (rows.length === 0
            ? html`<p class="muted" style="font-size:13px">${t(locale, 'depositMaturity.noData')}</p>`
            : html`<div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:8px; margin:8px 0">
                    ${cards.map(c => html`<article class="card" style="margin:0; padding:8px 10px">
                        <p class="smallcaps" style="margin:0 0 4px">${c.label}</p>
                        <p style="margin:0; font-size:15px; font-weight:600">${c.value}</p>
                    </article>`)}
                </div>
                <div class="ledger-table-wrap"><table>
                    <thead><tr>
                        <th scope="col" class="num">${t(locale, 'column.date')}</th>
                        <th scope="col" class="num">${t(locale, 'depositMaturity.maturityDate')}</th>
                        <th scope="col" class="num">${t(locale, 'depositMaturity.daysToMaturity')}</th>
                        <th scope="col">${t(locale, 'depositMaturity.status')}</th>
                        <th scope="col" class="num">${t(locale, 'depositMaturity.maturityValue')}</th>
                        <th scope="col" class="num">${t(locale, 'depositMaturity.accruedInterest')}</th>
                        <th scope="col">${t(locale, 'depositMaturity.rollover')}</th>
                    </tr></thead>
                    <tbody>
                        ${rows.map(row => html`<tr>
                            <td class="num">${fmt('date', row.date)}</td>
                            <td class="num">${fmt('date', row.maturity_date)}</td>
                            <td class="num">${daysText(row)}</td>
                            <td><span style=${chipStyle(row.maturity_status)}>${statusLabel(row.maturity_status)}</span></td>
                            <td class="num">${fmt('value', row.maturity_value)}</td>
                            <td class="num">${fmt('interest', row.accrued_interest)}</td>
                            <td style="font-size:12px">${rolloverSuggestion(row)}
                                ${row.maturity_status === 'matured' && onRollover && html`<div style="margin-top:6px"><button class="btn-sm" onClick=${() => onRollover(row)} aria-label=${`${t(locale, 'depositMaturity.rolloverAction')} ${row.maturity_date || ''}`}>${t(locale, 'depositMaturity.rolloverAction')}</button></div>`}
                            </td>
                        </tr>`)}
                    </tbody>
                </table></div>
            </div>`)}
    </section>`;
}

function chipStyle(status) {
    const base = 'display:inline-block; padding:2px 8px; border-radius:999px; font-size:12px; ';
    return status === 'matured'
        ? base + 'background:var(--chip-danger-bg); color:var(--chip-danger-fg)'
        : base + 'background:var(--chip-success-bg); color:var(--chip-success-fg)';
}
