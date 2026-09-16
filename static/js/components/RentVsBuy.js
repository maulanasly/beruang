import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { rentBuyComparison } from '../api.js';
import { formatCurrency } from '../utils.js';
import { t } from '../i18n.js';
import { readSharedState, ShareLink } from '../share.js';
import { HowTo } from './HowTo.js';
import { Crumbs } from './Crumbs.js';
import { RelatedCalcs } from './RelatedCalcs.js';
import { InfoTip } from './InfoTip.js';
import { RentBuyChart } from './RentBuyChart.js';
import { NetWorthChart } from './NetWorthChart.js';

// API payload keys (12). Wealth-layer defaults match the backend, so
// payloads and share links saved before they existed keep working.
const API_FIELDS = [
    'house_price', 'down_payment', 'mortgage_rate_annual', 'tenor_years',
    'rent_per_month', 'other_buy_costs_per_month',
    'home_appreciation_annual', 'rent_growth_annual', 'other_growth_annual',
    'invest_return_annual', 'closing_costs', 'selling_cost_rate',
];

const LABELS = {
    house_price: 'rentbuy.housePrice',
    down_payment: 'rentbuy.downPayment',
    mortgage_rate_annual: 'rentbuy.mortgageRate',
    tenor_years: 'rentbuy.tenorYears',
    rent_per_month: 'rentbuy.rentPerMonth',
    other_buy_costs_per_month: 'rentbuy.otherBuyCosts',
    home_appreciation_annual: 'rentbuy.appreciation',
    rent_growth_annual: 'rentbuy.rentGrowth',
    other_growth_annual: 'rentbuy.otherGrowth',
    invest_return_annual: 'rentbuy.investReturn',
    closing_costs: 'rentbuy.closingCosts',
    selling_cost_rate: 'rentbuy.sellingRate',
};

// Input groups, each a similar category. Down payment renders custom
// (amount/percent toggle) wherever its group maps it.
const GROUP_FINANCING = ['house_price', 'down_payment', 'mortgage_rate_annual', 'tenor_years', 'closing_costs', 'selling_cost_rate'];
const GROUP_MONTHLY = ['rent_per_month', 'other_buy_costs_per_month', 'rent_growth_annual', 'other_growth_annual'];
const GROUP_MARKET = ['home_appreciation_annual', 'invest_return_annual'];

const FORM_DEFAULTS = {
    house_price: 800000000, down_payment: 160000000,
    dp_mode: 'amount', dp_percent: 20,
    mortgage_rate_annual: 0.07, tenor_years: 20,
    rent_per_month: 3000000, other_buy_costs_per_month: 500000,
    home_appreciation_annual: 0.04, rent_growth_annual: 0.03,
    other_growth_annual: 0.03, invest_return_annual: 0.08,
    closing_costs: 0, selling_cost_rate: 0.05,
};

// Percent-mode presets. A custom value arriving via a share link is kept
// as an extra option so the round trip stays exact.
const DP_PRESETS = [20, 30, 40, 50, 70];

// Effective down-payment rupiah for either entry mode.
function dpEffective(f) {
    if (f.dp_mode === 'percent') {
        return Number(f.house_price) * Number(f.dp_percent) / 100;
    }
    return Number(f.down_payment);
}

export function RentVsBuy({ settings }) {
    const locale = settings.locale;
    const currency = settings.currency;
    const [form, setForm] = useState({ ...FORM_DEFAULTS });
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const shared = readSharedState();
        if (shared && shared.inputs) onCompare(shared.inputs);
    }, []);

    function set(key, value) {
        setForm({ ...form, [key]: value });
    }

    // Switching modes preserves the effective rupiah value, so nothing
    // is lost when the user flips between amount and percent.
    function setDpMode(mode) {
        if (mode === form.dp_mode) return;
        if (mode === 'percent') {
            const price = Number(form.house_price);
            const pct = price > 0 ? (Number(form.down_payment) / price) * 100 : FORM_DEFAULTS.dp_percent;
            setForm({ ...form, dp_mode: mode, dp_percent: Math.round(pct * 100) / 100 });
        } else {
            setForm({ ...form, dp_mode: mode, down_payment: Math.round(dpEffective(form)) });
        }
    }

    async function onCompare(inputsOverride) {
        // Old share links may lack newer keys; fall back to defaults
        // instead of sending NaN.
        const inputs = { ...FORM_DEFAULTS, ...(inputsOverride || form) };
        setLoading(true); setError('');
        try {
            const payload = Object.fromEntries(
                API_FIELDS.map((key) => [key, key === 'down_payment' ? dpEffective(inputs) : Number(inputs[key])]),
            );
            if (inputs.dp_mode === 'percent' && !(Number(inputs.dp_percent) >= 0 && Number(inputs.dp_percent) <= 100)) {
                throw new Error(t(locale, 'error.validationFailed'));
            }
            if (API_FIELDS.some((key) => !Number.isFinite(payload[key]) || payload[key] < 0)) {
                throw new Error(t(locale, 'error.validationFailed'));
            }
            const data = await rentBuyComparison(payload);
            data.calculatedAt = new Date().toISOString();
            setResult(data);
            if (inputsOverride) setForm({ ...inputs });
            requestAnimationFrame(() => document.querySelector('[data-results]')?.scrollIntoView());
        } catch (e) { setError(e.detail ? JSON.stringify(e.detail) : e.message); }
        finally { setLoading(false); }
    }

    function verdict() {
        if (!result) return null;
        // Headline: net-worth crossover. Cash payback is the fallback when
        // wealth never crosses (or the sub-line when it does).
        if (result.net_worth_break_even_year != null) {
            return {
                tone: 'var(--success)',
                text: t(locale, 'rentbuy.verdictNwAfter', { year: result.net_worth_break_even_year }),
                sub: `${t(locale, 'rentbuy.netAdvantage')} ${formatCurrency(result.net_advantage_buy_minus_rent, locale, currency)}`,
            };
        }
        if (result.break_even_months == null) {
            const years = result.schedule.length - 1;
            const gap = result.end_renter_net_worth - result.end_buyer_net_worth;
            return {
                tone: 'var(--danger)',
                text: t(locale, 'rentbuy.verdictNwNever', { amount: formatCurrency(gap, locale, currency), years }),
                sub: `${t(locale, 'rentbuy.cashDiff')} ${formatCurrency(result.total_buy - result.total_rent, locale, currency)}`,
            };
        }
        if (result.break_even_months === 0) {
            return { tone: 'var(--success)', text: t(locale, 'rentbuy.verdictBuyNow'), sub: '' };
        }
        const years = Math.floor(result.break_even_months / 12);
        const months = result.break_even_months % 12;
        return {
            tone: 'var(--success)',
            text: t(locale, 'rentbuy.verdictBuyAfter', { years, months }),
            sub: `${t(locale, 'rentbuy.totalBuy')} ${formatCurrency(result.total_buy, locale, currency)} · ${t(locale, 'rentbuy.totalRent')} ${formatCurrency(result.total_rent, locale, currency)}`,
        };
    }

    // The finding: when wealth never crosses at the input appreciation,
    // name the nearest appreciation that flips the verdict (from the
    // sensitivity strip). E.g. "at 5%, buying pulls ahead in year 4".
    function flipHint() {
        if (!result || result.net_worth_break_even_year != null) return null;
        const cands = (result.sensitivity || [])
            .filter((p) => p.break_even_year != null)
            .sort((a, b) => a.appreciation - b.appreciation);
        if (!cands.length) return null;
        return t(locale, 'rentbuy.flipHint', {
            pct: (cands[0].appreciation * 100).toFixed(0),
            year: cands[0].break_even_year,
        });
    }

    function numberField(key) {
        if (key === 'down_payment') {
            const pct = form.dp_mode === 'percent';
            const cur = Number(form.dp_percent);
            const pcts = DP_PRESETS.includes(cur)
                ? DP_PRESETS
                : [...DP_PRESETS, cur].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
            // Both modes show a one-line muted equivalent, so flipping
            // never changes the cell height and the grid stays aligned.
            const price = Number(form.house_price);
            const equiv = pct
                ? `= ${formatCurrency(dpEffective(form) || 0, locale, currency)}`
                : (price > 0 && Number.isFinite(Number(form.down_payment))
                    ? `= ${(Math.round((Number(form.down_payment) / price) * 1000) / 10)}%`
                    : '= —');
            const seg = 'flex:1; padding:4px 10px; font-size:12px; font-weight:600;';
            return html`<label>${t(locale, LABELS[key])}
                <div style="display:flex; margin-bottom:4px">
                    ${[['amount', 'rentbuy.dpModeAmount'], ['percent', 'rentbuy.dpModePercent']].map(([mode, labelKey], i) => html`<button
                        type="button"
                        class=${form.dp_mode === mode ? 'btn-sm' : 'btn-ghost btn-sm'}
                        style=${seg + (i === 0 ? 'border-radius:999px 0 0 999px;' : 'border-radius:0 999px 999px 0; margin-left:-1px;')}
                        onClick=${() => setDpMode(mode)}>${t(locale, labelKey)}</button>`)}
                </div>
                ${pct
                    ? html`<select value=${form.dp_percent} onChange=${(e) => set('dp_percent', e.target.value)}>
                            ${pcts.map((v) => html`<option value=${v}>${v}%</option>`)}
                        </select>`
                    : html`<input type="number" min="0" value=${form.down_payment} onInput=${(e) => set('down_payment', e.target.value)} />`}
                <span class="muted" style="font-size:12px">${equiv}</span>
            </label>`;
        }
        return html`<label>${t(locale, LABELS[key])}
            <input type="number" min="0" step="any" value=${form[key]} onInput=${(e) => set(key, e.target.value)} />
        </label>`;
    }

    function group(titleKey, keys) {
        return html`<div style="margin-top:12px">
            <div class="smallcaps">${t(locale, titleKey)}</div>
            <div class="entry-grid" style="--cols:3; margin-top:8px">
                ${keys.map(numberField)}
            </div>
        </div>`;
    }

    const maxBar = result ? Math.max(result.monthly_buy, result.monthly_rent, 1) : 1;
    const v = verdict();
    const flip = flipHint();
    const adv = result ? result.net_advantage_buy_minus_rent : 0;

    return html`<div>
        <${Crumbs} locale=${locale} currentKey="nav.rentBuy" />
        <div class="page-head"><h1>${t(locale, 'nav.rentBuy')}</h1><p class="muted">${t(locale, 'rentbuy.subtitle')}</p></div>
        <${HowTo} locale=${locale} startOpen=${!result} steps=${[t(locale, 'howto.rentbuy1'), t(locale, 'howto.rentbuy2'), t(locale, 'howto.rentbuy3'), t(locale, 'howto.rentbuy4')]} />
        <div class="card">
            ${group('rentbuy.groupFinancing', GROUP_FINANCING)}
            ${group('rentbuy.groupMonthly', GROUP_MONTHLY)}
            <details style="margin-top:12px">
                <summary style="cursor:pointer; font-size:13px">${t(locale, 'rentbuy.groupMarket')}</summary>
                <div class="entry-grid" style="--cols:3; margin-top:8px">
                    ${GROUP_MARKET.map(numberField)}
                </div>
            </details>
            <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap">
                <button onClick=${() => onCompare()} disabled=${loading}>${loading ? t(locale, 'rentbuy.comparing') : t(locale, 'rentbuy.compare')}</button>
                <${ShareLink} route="rent-buy" state=${{ inputs: form }} locale=${locale} />
            </div>
            ${error && html`<p style="color:var(--danger)" role="alert">${error}</p>`}
        </div>
        ${result && html`<div data-results class="results-anchor">
            ${v && html`<div class="card" style=${`border-left:4px solid ${v.tone}`}>
                <div class="amount" style=${`font-size:17px; color:${v.tone}`}>${v.text}</div>
                ${v.sub && html`<div class="muted" style="font-size:13px; margin-top:4px">${v.sub}</div>`}
                ${flip && html`<div class="muted" style="font-size:13px; margin-top:4px">↗ ${flip}</div>`}
            </div>`}
            <div class="summary-cards">
                <div class="card"><div class="smallcaps">${t(locale, 'rentbuy.monthlyBuy')}</div><div class="amount">${formatCurrency(result.monthly_buy, locale, currency)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'rentbuy.monthlyRent')}</div><div class="amount">${formatCurrency(result.monthly_rent, locale, currency)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'rentbuy.saving')}</div><div class="amount" style="color:${result.monthly_saving >= 0 ? 'var(--success)' : 'var(--danger)'}">${result.monthly_saving >= 0 ? '▲ ' : '▼ '}${formatCurrency(result.monthly_saving, locale, currency)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'rentbuy.upfront')}</div><div class="amount" style="font-size:15px">${formatCurrency(result.upfront_buy, locale, currency)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'rentbuy.breakEven')} <${InfoTip} locale=${locale} tipKey="glossary.roi" /></div><div class="amount" style="font-size:15px">${result.break_even_months == null ? t(locale, 'rentbuy.breakEvenNever') : result.break_even_months === 0 ? t(locale, 'rentbuy.verdictBuyNow') : t(locale, 'rentbuy.breakEvenMonths', { months: result.break_even_months })}</div></div>
            </div>
            <${RentBuyChart} schedule=${result.schedule} breakEvenMonths=${result.break_even_months} settings=${settings} />
            <${NetWorthChart} schedule=${result.schedule} breakEvenYear=${result.net_worth_break_even_year} settings=${settings} />
            <div class="summary-cards">
                <div class="card"><div class="smallcaps">${t(locale, 'rentbuy.interestPaid')}</div><div class="amount" style="font-size:15px">${formatCurrency(result.total_interest_paid, locale, currency)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'rentbuy.buyerNw')}</div><div class="amount" style="font-size:15px">${formatCurrency(result.end_buyer_net_worth, locale, currency)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'rentbuy.renterNw')}</div><div class="amount" style="font-size:15px">${formatCurrency(result.end_renter_net_worth, locale, currency)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'rentbuy.netAdvantage')}</div><div class="amount" style="font-size:15px; color:${adv >= 0 ? 'var(--success)' : 'var(--danger)'}">${adv >= 0 ? '▲ ' : '▼ '}${formatCurrency(adv, locale, currency)}</div></div>
            </div>
            ${Array.isArray(result.sensitivity) && result.sensitivity.length > 0 && html`<div class="card">
                <div class="smallcaps">${t(locale, 'rentbuy.sensTitle')}</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px">
                    ${result.sensitivity.map((pt) => html`<span style="display:inline-block; padding:2px 10px; border-radius:999px; font-size:12px; background:var(--chart-track); white-space:nowrap">
                        ${(pt.appreciation * 100).toFixed(0)}% → ${pt.break_even_year == null ? t(locale, 'rentbuy.sensNever') : `Y${pt.break_even_year}`}
                    </span>`)}
                </div>
            </div>`}
            <div class="card">
                <div style="display:grid; gap:8px">
                    ${[[t(locale, 'rentbuy.monthlyBuy'), result.monthly_buy, 'var(--chart-blue)'], [t(locale, 'rentbuy.monthlyRent'), result.monthly_rent, 'var(--chart-orange)']].map(([label, value, color]) => html`<div>
                        <div style="display:flex; justify-content:space-between; font-size:13px"><span>${label}</span><span class="num">${formatCurrency(value, locale, currency)}</span></div>
                        <div style="height:10px; border-radius:999px; background:var(--chart-track); overflow:hidden"><div style="height:100%; width:${(100 * value / maxBar).toFixed(1)}%; background:${color}"></div></div>
                    </div>`)}
                </div>
            </div>
        </div>`}
        <${RelatedCalcs} current="rent-buy" settings=${settings} />
    </div>`;
}
