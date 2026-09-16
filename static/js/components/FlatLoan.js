import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { flatLoanComparison } from '../api.js';
import { formatCurrency, formatCompactCurrency, formatPercent } from '../utils.js';
import { t } from '../i18n.js';
import { readSharedState, ShareLink } from '../share.js';
import { HowTo } from './HowTo.js';
import { Crumbs } from './Crumbs.js';
import { RelatedCalcs } from './RelatedCalcs.js';
import { FlatLoanChart } from './FlatLoanChart.js';

const FIELDS = [
    ['price', 'flatloan.price'],
    ['down_payment', 'flatloan.downPayment'],
    ['flat_rate_annual', 'flatloan.flatRate'],
    ['tenor_months', 'flatloan.tenorMonths'],
    ['upfront_fees', 'flatloan.upfrontFees'],
];

// Percent on screen, fractions on the wire (same convention as rent-buy).
const RATE_FIELDS = ['flat_rate_annual'];

const DEFAULTS = {
    price: 150000000, down_payment: 30000000,
    flat_rate_annual: 5, tenor_months: 35, upfront_fees: 1500000,
};

export function FlatLoan({ settings }) {
    const locale = settings.locale;
    const currency = settings.currency;
    const [form, setForm] = useState({ ...DEFAULTS });
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

    async function onCompare(inputsOverride) {
        const inputs = { ...DEFAULTS, ...(inputsOverride || form) };
        setLoading(true); setError('');
        try {
            const payload = Object.fromEntries(
                FIELDS.map(([key]) => [
                    key,
                    RATE_FIELDS.includes(key) ? Number(inputs[key]) / 100 : Number(inputs[key]),
                ]),
            );
            if (!(Number(inputs.flat_rate_annual) >= 0 && Number(inputs.flat_rate_annual) <= 100)) {
                throw new Error(t(locale, 'error.validationFailed'));
            }
            if (FIELDS.some(([key]) => !Number.isFinite(payload[key]) || payload[key] < 0)) {
                throw new Error(t(locale, 'error.validationFailed'));
            }
            const data = await flatLoanComparison(payload);
            data.calculatedAt = new Date().toISOString();
            data.flatPct = Number(inputs.flat_rate_annual);
            setResult(data);
            if (inputsOverride) setForm({ ...inputs });
            requestAnimationFrame(() => document.querySelector('[data-results]')?.scrollIntoView());
        } catch (e) { setError(e.detail ? JSON.stringify(e.detail) : e.message); }
        finally { setLoading(false); }
    }

    const cc = (value) => formatCompactCurrency(value, locale, currency);
    const full = (value) => formatCurrency(value, locale, currency);

    return html`<div>
        <${Crumbs} locale=${locale} currentKey="nav.flatLoan" />
        <div class="page-head"><h1>${t(locale, 'nav.flatLoan')}</h1><p class="muted">${t(locale, 'flatloan.subtitle')}</p></div>
        <${HowTo} locale=${locale} startOpen=${!result} steps=${[t(locale, 'howto.flat1'), t(locale, 'howto.flat2'), t(locale, 'howto.flat3')]} />
        <div class="card">
            <div class="entry-grid" style="--cols:3">
                ${FIELDS.map(([key, labelKey]) => html`<label>${t(locale, labelKey)}
                    <input type="number" min="0" max=${RATE_FIELDS.includes(key) ? '100' : undefined} step="any" value=${form[key]} onInput=${e => set(key, e.target.value)} />
                </label>`)}
            </div>
            <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap">
                <button onClick=${() => onCompare()} disabled=${loading}>${loading ? t(locale, 'flatloan.comparing') : t(locale, 'flatloan.compare')}</button>
                <${ShareLink} route="flat-loan" state=${{ inputs: { ...form, rates_pct: 1 } }} locale=${locale} />
            </div>
            ${error && html`<p style="color:var(--danger)" role="alert">${error}</p>`}
        </div>
        ${result && html`<div data-results class="results-anchor">
            <div class="card" style="border-left:4px solid var(--danger)">
                <div class="amount" style="font-size:17px; color:var(--danger)">${t(locale, 'flatloan.verdict', { flat: result.flatPct, eff: (result.effective_annual_nominal * 100).toFixed(1) })}</div>
                <div class="muted" style="font-size:13px; margin-top:4px">${t(locale, 'flatloan.method')}</div>
            </div>
            <div class="summary-cards">
                <div class="card"><div class="smallcaps">${t(locale, 'flatloan.installment')}</div><div class="amount" title=${full(result.monthly_installment)}>${cc(result.monthly_installment)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'flatloan.totalInterest')}</div><div class="amount" title=${full(result.total_interest)}>${cc(result.total_interest)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'flatloan.totalPayable')}</div><div class="amount" title=${full(result.total_payable)}>${cc(result.total_payable)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'flatloan.nominalAnnual')}</div><div class="amount" style="font-size:15px">${formatPercent(result.effective_annual_nominal, locale)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'flatloan.aprAnnual')}</div><div class="amount" style="font-size:15px">${formatPercent(result.effective_annual_rate, locale)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'flatloan.multiple')}</div><div class="amount" style="font-size:15px">${result.true_cost_multiple.toFixed(3)}×</div></div>
            </div>
            <${FlatLoanChart} schedule=${result.schedule} totalPayable=${result.total_payable} settings=${settings} />
        </div>`}
        <${RelatedCalcs} current="flat-loan" settings=${settings} />
    </div>`;
}
