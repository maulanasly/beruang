import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { rentBuyComparison } from '../api.js';
import { formatCurrency, formatCompactCurrency } from '../utils.js';
import { t } from '../i18n.js';
import { readSharedState, ShareLink } from '../share.js';
import { HowTo } from './HowTo.js';
import { Crumbs } from './Crumbs.js';
import { RelatedCalcs } from './RelatedCalcs.js';
import { InfoTip } from './InfoTip.js';
import { RentBuyChart } from './RentBuyChart.js';
import { NetWorthChart } from './NetWorthChart.js';

// Rate fields are entered as percent (7 = 7%) and converted to fractions
// for the wire. Legacy share links (fractions, no marker) are migrated.
const RATE_FIELDS = [
    'mortgage_rate_annual',
    'home_appreciation_annual', 'rent_growth_annual', 'other_growth_annual',
    'invest_return_annual', 'selling_cost_rate',
];

// API payload keys (14). Wealth-layer defaults match the backend, so
// payloads and share links saved before they existed keep working.
const API_FIELDS = [
    'house_price', 'down_payment', 'mortgage_rate_annual', 'tenor_years',
    'rent_per_month', 'other_buy_costs_per_month',
    'home_appreciation_annual', 'rent_growth_annual', 'other_growth_annual',
    'invest_return_annual', 'closing_costs', 'selling_cost_rate',
    'wait_years', 'gross_monthly_income',
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
    wait_years: 'rentbuy.waitYears',
    gross_monthly_income: 'rentbuy.income',
};

// Input groups, each a similar category. Down payment renders custom
// (amount/percent toggle) wherever its group maps it.
const GROUP_FINANCING = ['house_price', 'down_payment', 'mortgage_rate_annual', 'tenor_years', 'closing_costs', 'selling_cost_rate', 'gross_monthly_income'];
const GROUP_MONTHLY = ['rent_per_month', 'other_buy_costs_per_month', 'rent_growth_annual', 'other_growth_annual'];
const GROUP_MARKET = ['home_appreciation_annual', 'invest_return_annual', 'wait_years'];

const FORM_DEFAULTS = {
    house_price: 800000000, down_payment: 160000000,
    dp_mode: 'amount', dp_percent: 20,
    mortgage_rate_annual: 7, tenor_years: 20,
    rent_per_month: 3000000, other_buy_costs_per_month: 500000,
    home_appreciation_annual: 4, rent_growth_annual: 3,
    other_growth_annual: 3, invest_return_annual: 8,
    closing_costs: 0, selling_cost_rate: 5,
    wait_years: 0, gross_monthly_income: 0,
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

// Shared-state restore: new links carry percent rates with a marker;
// legacy links carry fractions and get ×100 on the rate fields.
function migrateShared(inputs) {
    const out = { ...FORM_DEFAULTS, ...inputs };
    if (out.rates_pct !== 1) {
        for (const key of RATE_FIELDS) {
            if (Number.isFinite(Number(out[key]))) out[key] = Number(out[key]) * 100;
        }
    }
    return out;
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
        const inputs = inputsOverride ? migrateShared(inputsOverride) : { ...form };
        setLoading(true); setError('');
        try {
            const payload = Object.fromEntries(
                API_FIELDS.map((key) => [
                    key,
                    key === 'down_payment'
                        ? dpEffective(inputs)
                        : RATE_FIELDS.includes(key) ? Number(inputs[key]) / 100 : Number(inputs[key]),
                ]),
            );
            if (inputs.dp_mode === 'percent' && !(Number(inputs.dp_percent) >= 0 && Number(inputs.dp_percent) <= 100)) {
                throw new Error(t(locale, 'error.validationFailed'));
            }
            if (RATE_FIELDS.some((key) => !(Number(inputs[key]) >= 0 && Number(inputs[key]) <= 100))) {
                throw new Error(t(locale, 'error.validationFailed'));
            }
            if (API_FIELDS.some((key) => !Number.isFinite(payload[key]) || payload[key] < 0)) {
                throw new Error(t(locale, 'error.validationFailed'));
            }
            const data = await rentBuyComparison(payload);
            data.calculatedAt = new Date().toISOString();
            data.waitYears = payload.wait_years;
            data.whyInputs = {
                g: payload.home_appreciation_annual,
                r: payload.mortgage_rate_annual,
                i: payload.invest_return_annual,
            };
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
            // Toggle lives on the label line and there is no extra hint
            // row, so this cell keeps the exact same height as every other
            // input cell and the grid stays symmetric.
            const seg = 'padding:2px 8px; font-size:11px; font-weight:600; line-height:1.4;';
            return html`<label>
                <span style="display:flex; align-items:center; justify-content:space-between; gap:6px">
                    <span>${t(locale, LABELS[key])}</span>
                    <span style="display:flex; flex:none">
                        ${[['amount', 'rentbuy.dpModeAmount'], ['percent', 'rentbuy.dpModePercent']].map(([mode, labelKey], i) => html`<button
                            type="button"
                            class=${form.dp_mode === mode ? 'btn-sm' : 'btn-ghost btn-sm'}
                            style=${seg + (i === 0 ? 'border-radius:999px 0 0 999px;' : 'border-radius:0 999px 999px 0; margin-left:-1px;')}
                            onClick=${() => setDpMode(mode)}>${t(locale, labelKey)}</button>`)}
                    </span>
                </span>
                ${pct
                    ? html`<select value=${form.dp_percent} onChange=${(e) => set('dp_percent', e.target.value)}>
                            ${pcts.map((v) => html`<option value=${v}>${v}%</option>`)}
                        </select>`
                    : html`<input type="number" min="0" value=${form.down_payment} onInput=${(e) => set('down_payment', e.target.value)} />`}
            </label>`;
        }
        return html`<label>${t(locale, LABELS[key])}
            <input type="number" min="0" max=${RATE_FIELDS.includes(key) ? '100' : undefined} step="any" value=${form[key]} onInput=${(e) => set(key, e.target.value)} />
        </label>`;
    }

    // Buy signals: ratios with classic bands plus the model-exact implied
    // thresholds (required appreciation, max invest return).
    function priceBand(value) {
        if (value == null) return null;
        if (value < 15) return { key: 'rentbuy.sigBandBuy', color: 'var(--success)' };
        if (value <= 20) return { key: 'rentbuy.sigBandGray', color: 'var(--chart-orange)' };
        return { key: 'rentbuy.sigBandRent', color: 'var(--danger)' };
    }

    function requiredLine() {
        const req = result.required_appreciation;
        if (req == null) return t(locale, 'rentbuy.sigRequiredNever');
        if (req <= 0) return t(locale, 'rentbuy.sigRequiredZero');
        return t(locale, 'rentbuy.sigRequired', { pct: (req * 100).toFixed(1) });
    }

    function maxInvestLine() {
        const mi = result.max_invest_return;
        if (mi == null) return t(locale, 'rentbuy.sigMaxInvestNone');
        if (mi >= 1) return t(locale, 'rentbuy.sigMaxInvestAll');
        return t(locale, 'rentbuy.sigMaxInvest', { pct: (mi * 100).toFixed(1) });
    }

    function affordBand(share) {
        if (share <= 0.30) return { key: 'rentbuy.sigAffordComfortable', color: 'var(--success)' };
        if (share <= 0.40) return { key: 'rentbuy.sigAffordStretched', color: 'var(--chart-orange)' };
        return { key: 'rentbuy.sigAffordDanger', color: 'var(--danger)' };
    }

    function signalsPanel() {
        const band = priceBand(result.price_to_rent);
        const rec = result.closing_recovery_years;
        const share = result.installment_share;
        const ab = share != null ? affordBand(share) : null;
        return html`<div class="card">
            <div class="smallcaps">${t(locale, 'rentbuy.sigTitle')}</div>
            <div style="display:grid; gap:8px; margin-top:8px; font-size:13px">
                <div style="display:flex; justify-content:space-between; gap:8px"><span>${t(locale, 'rentbuy.sigPriceToRent')}</span><span class="num">${result.price_to_rent == null ? '—' : `${result.price_to_rent.toFixed(1)}× · ${(100 / result.price_to_rent).toFixed(1)}% ${t(locale, 'rentbuy.sigYield')}`}
                    ${band && html`<span style=${`color:${band.color}; font-weight:700`}> · ${t(locale, band.key)}</span>`}</span></div>
                <div style="display:flex; justify-content:space-between; gap:8px"><span>${t(locale, 'rentbuy.sigPaymentToRent')}</span><span class="num">${result.payment_to_rent == null ? '—' : `${result.payment_to_rent.toFixed(2)}×`}</span></div>
                <div>${requiredLine()}</div>
                <div>${maxInvestLine()}</div>
                ${rec !== 0 && html`<div>${rec == null ? t(locale, 'rentbuy.sigClosingNever') : t(locale, 'rentbuy.sigClosing', { years: rec })}</div>`}
                ${result.wait_advantage_vs_buy_now != null && html`<div style=${`color:${result.wait_advantage_vs_buy_now >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:600`}>
                    ${t(locale, 'rentbuy.sigWait', { years: result.waitYears, amount: cc(result.wait_advantage_vs_buy_now) })}</div>`}
                ${ab && html`<div>
                    <div style="display:flex; justify-content:space-between; gap:8px"><span>${t(locale, 'rentbuy.sigAfford')}</span><span class="num" style=${`color:${ab.color}; font-weight:700`}>${(share * 100).toFixed(0)}% · ${t(locale, ab.key)}</span></div>
                    <div style="height:10px; border-radius:999px; background:var(--chart-track); overflow:hidden; margin-top:4px"><div style="height:100%; width:${Math.min(share * 100, 100).toFixed(1)}%; background:${ab.color}"></div></div>
                </div>`}
                <div class="muted" style="font-size:12px">${t(locale, 'rentbuy.method')}</div>
            </div>
        </div>`;
    }

    // One-line "why" behind the verdict, from the ordering of the three
    // rates that decide it (submitted values stashed on the result).
    function whyLine() {
        const w = result.whyInputs;
        if (!w) return null;
        const f = (x) => (x * 100).toFixed(1);
        const crossed = result.net_worth_break_even_year != null;
        if (!crossed) {
            if (w.i >= w.g && w.i >= w.r) return t(locale, 'rentbuy.whyInvestLeads', { i: f(w.i), g: f(w.g), r: f(w.r) });
            if (w.r >= w.g) return t(locale, 'rentbuy.whyMortgageDrags', { r: f(w.r), g: f(w.g) });
            return t(locale, 'rentbuy.whyFrictionWins', { g: f(w.g) });
        }
        if (w.g >= w.r && w.g >= w.i) return t(locale, 'rentbuy.whyApprecLeads', { g: f(w.g), r: f(w.r), i: f(w.i) });
        return t(locale, 'rentbuy.whyCashFlowWins');
    }

    function group(titleKey, keys) {
        return html`<div style="margin-top:12px">
            <div class="smallcaps">${t(locale, titleKey)}</div>
            <div class="entry-grid" style="--cols:3; margin-top:8px">
                ${keys.map(numberField)}
            </div>
        </div>`;
    }

    const v = verdict();
    const flip = flipHint();
    const why = result ? whyLine() : null;
    const adv = result ? result.net_advantage_buy_minus_rent : 0;
    // Compact card figures ("Rp1,67 M") with the exact value on hover, so
    // house-scale numbers never overflow their pill.
    const cc = (value) => formatCompactCurrency(value, locale, currency);
    const full = (value) => formatCurrency(value, locale, currency);

    return html`<div>
        <${Crumbs} locale=${locale} currentKey="nav.rentBuy" />
        <div class="page-head"><h1>${t(locale, 'nav.rentBuy')}</h1><p class="muted">${t(locale, 'rentbuy.subtitle')}</p></div>
        <${HowTo} locale=${locale} startOpen=${!result} steps=${[t(locale, 'howto.rentbuy1'), t(locale, 'howto.rentbuy2'), t(locale, 'howto.rentbuy3'), t(locale, 'howto.rentbuy4'), t(locale, 'howto.rentbuy5')]} />
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
                <${ShareLink} route="rent-buy" state=${{ inputs: { ...form, rates_pct: 1 } }} locale=${locale} />
            </div>
            ${error && html`<p style="color:var(--danger)" role="alert">${error}</p>`}
        </div>
        ${result && html`<div data-results class="results-anchor">
            ${v && html`<div class="card" style=${`border-left:4px solid ${v.tone}`}>
                <div class="amount" style=${`font-size:17px; color:${v.tone}`}>${v.text}</div>
                ${why && html`<div style="font-size:13px; margin-top:4px">${why}</div>`}
                ${v.sub && html`<div class="muted" style="font-size:13px; margin-top:4px">${v.sub}</div>`}
                ${flip && html`<div class="muted" style="font-size:13px; margin-top:4px">↗ ${flip}</div>`}
            </div>`}
            <${signalsPanel} />
            <div class="summary-cards">
                <div class="card"><div class="smallcaps">${t(locale, 'rentbuy.monthlyBuy')}</div><div class="amount" title=${full(result.monthly_buy)}>${cc(result.monthly_buy)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'rentbuy.monthlyRent')}</div><div class="amount" title=${full(result.monthly_rent)}>${cc(result.monthly_rent)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'rentbuy.saving')}</div><div class="amount" title=${full(result.monthly_saving)} style="color:${result.monthly_saving >= 0 ? 'var(--success)' : 'var(--danger)'}">${result.monthly_saving >= 0 ? '▲ ' : '▼ '}${cc(result.monthly_saving)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'rentbuy.upfront')}</div><div class="amount" title=${full(result.upfront_buy)} style="font-size:15px">${cc(result.upfront_buy)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'rentbuy.cashPayback')} <${InfoTip} locale=${locale} tipKey="glossary.roi" /></div><div class="amount" style="font-size:15px">${result.break_even_months == null ? t(locale, 'rentbuy.breakEvenNever') : result.break_even_months === 0 ? t(locale, 'rentbuy.verdictBuyNow') : t(locale, 'rentbuy.breakEvenMonths', { months: result.break_even_months })}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'rentbuy.wealthCrossover')}</div><div class="amount" style="font-size:15px">${result.net_worth_break_even_year == null ? t(locale, 'rentbuy.sensNever') : `Y${result.net_worth_break_even_year}`}</div></div>
            </div>
            <details>
                <summary style="cursor:pointer; font-size:13px">${t(locale, 'rentbuy.cashDetails')}</summary>
                <div style="margin-top:8px"><${RentBuyChart} schedule=${result.schedule} breakEvenMonths=${result.break_even_months} settings=${settings} /></div>
            </details>
            <div class="muted" style="font-size:12px; margin:4px 0 12px">${t(locale, 'rentbuy.nwCaption')}</div>
            <${NetWorthChart} schedule=${result.schedule} breakEvenYear=${result.net_worth_break_even_year} settings=${settings} />
            <div class="summary-cards">
                <div class="card"><div class="smallcaps">${t(locale, 'rentbuy.interestPaid')}</div><div class="amount" title=${full(result.total_interest_paid)} style="font-size:15px">${cc(result.total_interest_paid)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'rentbuy.buyerNw')}</div><div class="amount" title=${full(result.end_buyer_net_worth)} style="font-size:15px">${cc(result.end_buyer_net_worth)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'rentbuy.renterNw')}</div><div class="amount" title=${full(result.end_renter_net_worth)} style="font-size:15px">${cc(result.end_renter_net_worth)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'rentbuy.netAdvantage')}</div><div class="amount" title=${full(adv)} style="font-size:15px; color:${adv >= 0 ? 'var(--success)' : 'var(--danger)'}">${adv >= 0 ? '▲ ' : '▼ '}${cc(adv)}</div></div>
            </div>
            ${Array.isArray(result.sensitivity) && result.sensitivity.length > 0 && html`<div class="card">
                <div class="smallcaps">${t(locale, 'rentbuy.sensTitle')}</div>
                <div class="muted" style="font-size:12px; margin-top:4px">${t(locale, 'rentbuy.sensCaption')}</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px">
                    ${result.sensitivity.map((pt) => html`<span style="display:inline-block; padding:2px 10px; border-radius:999px; font-size:12px; background:var(--chart-track); white-space:nowrap">
                        ${(pt.appreciation * 100).toFixed(0)}% → ${pt.break_even_year == null ? t(locale, 'rentbuy.sensNever') : `Y${pt.break_even_year}`}
                    </span>`)}
                </div>
            </div>`}
        </div>`}
        <${RelatedCalcs} current="rent-buy" settings=${settings} />
    </div>`;
}
