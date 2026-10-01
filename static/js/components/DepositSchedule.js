import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { formatCurrency, formatPercent } from '../utils.js';
import { MiniBars } from './HomeVisuals.js';
import { buildDepositSchedule, applyTax, schedulesToCsv, downloadScheduleCsv } from '../depositInterest.js';

// Per-deposit monthly interest schedule: monthly-interest bars + a
// month-by-month table (gross and net of tax). Derived in the frontend
// from the oracle-provided primitives (monthly_rate, installment, term).

function DepositScheduleRow({ row, monthlyRate, taxRate, settings, n }) {
    const locale = settings.locale;
    const currency = settings.currency;
    const schedule = buildDepositSchedule({
        installment: row.installment_amount,
        monthlyRate,
        termMonths: row.term_months,
        startDate: row.date,
    });
    const values = schedule.map(s => s.interest);
    const totalGross = schedule.length ? schedule[schedule.length - 1].cumulative : 0;
    const totalNet = applyTax(totalGross, taxRate);
    return html`<details class="deposit-schedule">
        <summary>
            <span>${t(locale, 'depositSchedule.deposit', { n })} · ${row.date} → ${row.maturity_date || ''}</span>
            <span class="muted">${t(locale, 'depositSchedule.total', { value: formatCurrency(totalGross, locale, currency) })} · ${t(locale, 'depositSchedule.net')} ${formatCurrency(totalNet, locale, currency)}</span>
        </summary>
        <${MiniBars} values=${values} color="var(--chart-orange)" w=${360} h=${96} />
        <div class="smallcaps" style="font-size:10px">${t(locale, 'depositSchedule.chartLabel')}</div>
        <div class="ledger-table-wrap"><table>
            <thead><tr>
                <th scope="col">${t(locale, 'depositSchedule.month')}</th>
                <th scope="col">${t(locale, 'column.date')}</th>
                <th scope="col" class="num">${t(locale, 'depositSchedule.opening')}</th>
                <th scope="col" class="num">${t(locale, 'depositSchedule.interest')}</th>
                <th scope="col" class="num">${t(locale, 'depositSchedule.net')}</th>
                <th scope="col" class="num">${t(locale, 'depositSchedule.closing')}</th>
                <th scope="col" class="num">${t(locale, 'depositSchedule.cumulative')}</th>
                <th scope="col" class="num">${t(locale, 'depositSchedule.netCumulative')}</th>
            </tr></thead>
            <tbody>
                ${schedule.map(s => html`<tr>
                    <td class="num">${s.i}</td>
                    <td class="num">${s.date}</td>
                    <td class="num">${formatCurrency(s.opening, locale, currency)}</td>
                    <td class="num">${formatCurrency(s.interest, locale, currency)}</td>
                    <td class="num">${formatCurrency(applyTax(s.interest, taxRate), locale, currency)}</td>
                    <td class="num">${formatCurrency(s.closing, locale, currency)}</td>
                    <td class="num">${formatCurrency(s.cumulative, locale, currency)}</td>
                    <td class="num">${formatCurrency(applyTax(s.cumulative, taxRate), locale, currency)}</td>
                </tr>`)}
            </tbody>
        </table></div>
    </details>`;
}

export function DepositSchedule({ ledger, monthlyRate, taxRate, settings }) {
    const locale = settings.locale;
    const rows = (Array.isArray(ledger) ? ledger : []).filter(r => r && typeof r === 'object' && r.maturity_status);
    if (!rows.length) return html``;
    const exportCsv = () => downloadScheduleCsv('term-deposit-schedule.csv', schedulesToCsv(rows, monthlyRate, taxRate));
    return html`<section class="card">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; justify-content:space-between">
            <div class="smallcaps">${t(locale, 'depositSchedule.title')}</div>
            <div style="display:flex; align-items:center; gap:10px">
                <span class="muted" style="font-size:12px">${t(locale, 'settings.taxRate')} ${formatPercent(taxRate, locale)}</span>
                <button class="btn-ghost btn-sm" onClick=${exportCsv}>${t(locale, 'io.exportCsv')}</button>
            </div>
        </div>
        ${rows.map((row, idx) => html`<${DepositScheduleRow} row=${row} monthlyRate=${monthlyRate} taxRate=${taxRate} settings=${settings} n=${idx + 1} />`)}
    </section>`;
}
