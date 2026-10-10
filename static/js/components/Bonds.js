import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { bondComparison } from '../api.js';
import { formatCurrency, formatCompactCurrency, formatPercent } from '../utils.js';
import { t } from '../i18n.js';
import { readSharedState, ShareLink } from '../share.js';
import { HowTo } from './HowTo.js';
import { Crumbs } from './Crumbs.js';
import { RelatedCalcs } from './RelatedCalcs.js';
import { BondChart } from './BondChart.js';
import { ResultStatus } from './ResultStatus.js';

const FIELDS = [
    ['nominal', 'bonds.nominal'],
    ['coupon_annual', 'bonds.coupon'],
    ['tenor_months', 'bonds.tenor'],
    ['price_pct', 'bonds.price'],
    ['tax_rate', 'bonds.tax'],
];

// Percent on screen, fractions on the wire (same convention as flat-loan).
const RATE_FIELDS = ['coupon_annual', 'tax_rate'];
// Screen-side caps mirroring the backend bounds (coupon 0-30, tax 0-100).
const RATE_MAX = { coupon_annual: '30', tax_rate: '100' };

const DEFAULTS = {
    nominal: 10000000, coupon_annual: 6.9,
    tenor_months: 36, price_pct: 100, tax_rate: 10,
};

export function Bonds({ settings }) {
    const locale = settings.locale;
    const currency = settings.currency;
    const [form, setForm] = useState({ ...DEFAULTS });
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [calculatedInputs, setCalculatedInputs] = useState(null);

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
            if (!(Number(inputs.coupon_annual) >= 0 && Number(inputs.coupon_annual) <= 30)) {
                throw new Error(t(locale, 'error.validationFailed'));
            }
            if (!(Number(inputs.tax_rate) >= 0 && Number(inputs.tax_rate) <= 100)) {
                throw new Error(t(locale, 'error.validationFailed'));
            }
            if (FIELDS.some(([key]) => !Number.isFinite(payload[key]) || payload[key] < 0)) {
                throw new Error(t(locale, 'error.validationFailed'));
            }
            const data = await bondComparison(payload);
            data.calculatedAt = new Date().toISOString();
            setResult(data);
            setCalculatedInputs(JSON.stringify(inputs));
            if (inputsOverride) setForm({ ...inputs });
            requestAnimationFrame(() => { document.querySelector('[data-results]')?.scrollIntoView(); document.getElementById('results-heading')?.focus({ preventScroll: true }); });
        } catch (e) { setError(e.detail ? JSON.stringify(e.detail) : e.message); }
        finally { setLoading(false); }
    }

    const cc = (value) => formatCompactCurrency(value, locale, currency);
    const full = (value) => formatCurrency(value, locale, currency);
    const stale = !!result && calculatedInputs !== JSON.stringify(form);
    const gain = result ? result.capital_gain : 0;

    return html`<div>
        <${Crumbs} locale=${locale} currentKey="nav.bonds" />
        <div class="page-head"><h1>${t(locale, 'nav.bonds')}</h1><p class="muted">${t(locale, 'bonds.subtitle')}</p></div>
        <${HowTo} locale=${locale} startOpen=${!result} steps=${[t(locale, 'howto.bond1'), t(locale, 'howto.bond2'), t(locale, 'howto.bond3')]} />
        <div class="card">
            <div class="entry-grid" style="--cols:3">
                ${FIELDS.map(([key, labelKey]) => html`<label>${t(locale, labelKey)}
                    <input type="number" min="0" max=${RATE_FIELDS.includes(key) ? RATE_MAX[key] : undefined} step="any" value=${form[key]} onInput=${e => set(key, e.target.value)} />
                </label>`)}
            </div>
            <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap">
                <button onClick=${() => onCompare()} disabled=${loading}>${loading ? t(locale, 'bonds.comparing') : t(locale, 'bonds.compare')}</button>
                <${ShareLink} route="bonds" state=${{ inputs: { ...form, rates_pct: 1 } }} locale=${locale} />
            </div>
            <${ResultStatus} locale=${locale} stale=${stale} />
            ${error && html`<p style="color:var(--danger)" role="alert">${error}</p>`}
        </div>
        ${result && html`<div data-results class="results-anchor" aria-labelledby="results-heading">
            <h2 id="results-heading" class="results-heading" tabindex="-1">${t(locale, 'results.title')}</h2>
            <${ResultStatus} locale=${locale} stale=${stale} />
            <div class="card" style="border-left:4px solid var(--success)">
                <div class="amount" style="font-size:17px; color:var(--success)">${t(locale, 'bonds.verdict', { monthly: full(result.monthly_coupon_net), ytm: (result.ytm_net_annual * 100).toFixed(2) })}</div>
                <div class="muted" style="font-size:13px; margin-top:4px">${t(locale, 'bonds.method')}</div>
            </div>
            <div class="summary-cards">
                <div class="card"><div class="smallcaps">${t(locale, 'bonds.couponNet')}</div><div class="amount" title=${full(result.monthly_coupon_net)}>${cc(result.monthly_coupon_net)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'bonds.totalCoupons')}</div><div class="amount" title=${full(result.total_coupon_net)} style="font-size:15px">${cc(result.total_coupon_net)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'bonds.capitalGain')}</div><div class="amount" title=${full(gain)} style="font-size:15px; color:${gain >= 0 ? 'var(--success)' : 'var(--danger)'}">${gain >= 0 ? '▲ ' : '▼ '}${cc(gain)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'bonds.ytmNet')}</div><div class="amount" style="font-size:15px">${formatPercent(result.ytm_net_annual, locale)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'bonds.ytmGross')}</div><div class="amount" style="font-size:15px">${formatPercent(result.ytm_gross_annual, locale)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'bonds.totalReceived')}</div><div class="amount" title=${full(result.total_net_received)} style="font-size:15px">${cc(result.total_net_received)}</div></div>
            </div>
            <${BondChart} schedule=${result.schedule} totalReceived=${result.total_net_received} settings=${settings} />
        </div>`}
        <${RelatedCalcs} current="bonds" settings=${settings} />
    </div>`;
}
