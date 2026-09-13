import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { formatCellValue } from '../utils.js';
import { chainLink, annualize } from '../finance.js';
import { InfoTip } from './InfoTip.js';

// Port of the legacy Vue LatestMomentumKpi: "This Month Update"
// strip built from the latest result-ledger row + summary.
export function MomentumKpi({ ledger, summary, asset, settings }) {
    const rows = Array.isArray(ledger) ? ledger : [];
    const latest = rows.length ? rows[rows.length - 1] : null;
    if (!latest) return html``;
    const locale = settings.locale;
    const currency = settings.currency;
    const fmt = (key, value) => formatCellValue(key, value, locale, currency);

    const returns = rows.map((row) => {
        if (asset === 'term-deposits') {
            const start = Number(row.month_start_value) || 0;
            const interest = Number(row.prorated_interest) || 0;
            return start > 0 ? interest / start : null;
        }
        return typeof row.mom_return === 'number' ? row.mom_return : null;
    });
    const twr = annualize(chainLink(returns), rows[0]?.date, rows[rows.length - 1]?.date);
    const sum = summary || {};
    const dateLabel = t(locale, 'kpi.latestEntryDate');

    let cards;
    if (asset === 'term-deposits') {
        cards = [
            { label: dateLabel, value: fmt('date', latest.date) },
            { label: t(locale, 'kpi.latestProratedInterest'), value: fmt('prorated_interest', latest.prorated_interest), hint: 'glossary.prorated' },
            { label: t(locale, 'kpi.currentApy'), value: fmt('apy', sum.apy), hint: 'glossary.apy' },
            { label: t(locale, 'kpi.latestTwr'), value: fmt('xirr', twr), hint: 'glossary.twr' },
        ];
    } else if (asset === 'stocks') {
        cards = [
            { label: dateLabel, value: fmt('date', latest.date) },
            { label: t(locale, 'kpi.latestMom'), value: fmt('mom_return', latest.mom_return), hint: 'glossary.moM' },
            { label: t(locale, 'kpi.latestRoi'), value: fmt('roi', sum.roi), hint: 'glossary.roi' },
            { label: t(locale, 'kpi.latestXirr'), value: fmt('xirr', sum.xirr), hint: 'glossary.xirr' },
            { label: t(locale, 'kpi.latestAnnualDividend'), value: fmt('estimated_annual_dividend', sum.estimated_annual_dividend), hint: 'glossary.dividendYield' },
            { label: t(locale, 'kpi.latestTwr'), value: fmt('xirr', twr), hint: 'glossary.twr' },
        ];
    } else {
        cards = [
            { label: dateLabel, value: fmt('date', latest.date) },
            { label: t(locale, 'kpi.latestMom'), value: fmt('mom_return', latest.mom_return), hint: 'glossary.moM' },
            { label: t(locale, 'kpi.latestXirr'), value: fmt('xirr', sum.xirr), hint: 'glossary.xirr' },
            { label: t(locale, 'kpi.latestTwr'), value: fmt('xirr', twr), hint: 'glossary.twr' },
        ];
    }

    return html`<section class="card">
        <p class="muted" style="font-size:12px; margin:0 0 8px">${t(locale, 'kpi.thisMonthUpdate')}</p>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:8px">
            ${cards.map(c => html`<article class="card" style="margin:0; padding:8px 10px">
                <p class="smallcaps" style="margin:0 0 4px">${c.label} ${c.hint ? html`<${InfoTip} locale=${locale} tipKey=${c.hint} />` : ''}</p>
                <p style="margin:0; font-size:16px; font-weight:600">${c.value}</p>
            </article>`)}
        </div>
    </section>`;
}
