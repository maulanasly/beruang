import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { evComparison } from '../api.js';
import { formatCurrency } from '../utils.js';
import { t } from '../i18n.js';
import { readSharedState, ShareLink } from '../share.js';
import { HowTo } from './HowTo.js';
import { Crumbs } from './Crumbs.js';
import { RelatedCalcs } from './RelatedCalcs.js';
import { InfoTip } from './InfoTip.js';

const FIELDS = [
    ['price_ice', 'ev.priceIce'],
    ['price_ev', 'ev.priceEv'],
    ['km_per_month', 'ev.kmMonth'],
    ['fuel_price_per_liter', 'ev.fuelPrice'],
    ['fuel_km_per_liter', 'ev.fuelEff'],
    ['electricity_price_per_kwh', 'ev.elecPrice'],
    ['ev_kwh_per_100km', 'ev.evUse'],
    ['service_ice_per_month', 'ev.serviceIce'],
    ['service_ev_per_month', 'ev.serviceEv'],
];

const DEFAULTS = {
    price_ice: 250000000, price_ev: 300000000, km_per_month: 1500,
    fuel_price_per_liter: 10000, fuel_km_per_liter: 12,
    electricity_price_per_kwh: 1444, ev_kwh_per_100km: 15,
    service_ice_per_month: 500000, service_ev_per_month: 200000,
};

export function Ev({ settings }) {
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
        const inputs = inputsOverride || form;
        setLoading(true); setError('');
        try {
            const payload = Object.fromEntries(
                FIELDS.map(([key]) => [key, Number(inputs[key])]),
            );
            if (FIELDS.some(([key]) => !Number.isFinite(payload[key]) || payload[key] < 0)) {
                throw new Error(t(locale, 'error.validationFailed'));
            }
            const data = await evComparison(payload);
            data.calculatedAt = new Date().toISOString();
            setResult(data);
            if (inputsOverride) setForm({ ...DEFAULTS, ...inputsOverride });
            requestAnimationFrame(() => document.querySelector('[data-results]')?.scrollIntoView());
        } catch (e) { setError(e.detail ? JSON.stringify(e.detail) : e.message); }
        finally { setLoading(false); }
    }

    function breakEvenText() {
        if (!result) return null;
        if (result.break_even_months == null) return t(locale, 'ev.breakEvenNever');
        if (result.break_even_months === 0) return t(locale, 'ev.breakEvenNow');
        return t(locale, 'ev.breakEvenMonths', { months: result.break_even_months });
    }

    const maxBar = result ? Math.max(result.monthly_ice, result.monthly_ev, 1) : 1;

    return html`<div>
        <${Crumbs} locale=${locale} currentKey="nav.ev" />
        <div class="page-head"><h1>${t(locale, 'nav.ev')}</h1><p class="muted">${t(locale, 'ev.subtitle')}</p></div>
        <${HowTo} locale=${locale} startOpen=${!result} steps=${[t(locale,'howto.ev1'), t(locale,'howto.ev2'), t(locale,'howto.ev3')]} />
        <div class="card">
            <div class="entry-grid" style="--cols:3">
                ${FIELDS.map(([key, labelKey]) => html`<label>${t(locale, labelKey)}
                    <input type="number" min="0" value=${form[key]} onInput=${e=>set(key, e.target.value)} />
                </label>`)}
            </div>
            <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap">
                <button onClick=${()=>onCompare()} disabled=${loading}>${loading ? t(locale, 'ev.comparing') : t(locale, 'ev.compare')}</button>
                <${ShareLink} route="ev" state=${{ inputs: form }} locale=${locale} />
            </div>
            ${error && html`<p style="color:var(--danger)" role="alert">${error}</p>`}
        </div>
        ${result && html`<div data-results class="results-anchor">
            <div class="summary-cards">
                <div class="card"><div class="smallcaps">${t(locale, 'ev.monthlyIce')}</div><div class="amount">${formatCurrency(result.monthly_ice, locale, currency)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'ev.monthlyEv')}</div><div class="amount">${formatCurrency(result.monthly_ev, locale, currency)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'ev.saving')}</div><div class="amount" style="color:${result.monthly_saving >= 0 ? 'var(--success)' : 'var(--danger)'}">${result.monthly_saving >= 0 ? '▲ ' : '▼ '}${formatCurrency(result.monthly_saving, locale, currency)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'ev.upfront')}</div><div class="amount" style="font-size:15px">${formatCurrency(result.upfront_delta, locale, currency)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'ev.breakEven')} <${InfoTip} locale=${locale} tipKey="glossary.roi" /></div><div class="amount" style="font-size:15px">${breakEvenText()}</div></div>
            </div>
            <div class="card">
                <div style="display:grid; gap:8px">
                    ${[[t(locale, 'ev.monthlyIce'), result.monthly_ice, '#f25f3a'], [t(locale, 'ev.monthlyEv'), result.monthly_ev, '#10b981']].map(([label, value, color]) => html`<div>
                        <div style="display:flex; justify-content:space-between; font-size:13px"><span>${label}</span><span class="num">${formatCurrency(value, locale, currency)}</span></div>
                        <div style="height:10px; border-radius:999px; background:#eee7d8; overflow:hidden"><div style="height:100%; width:${(100 * value / maxBar).toFixed(1)}%; background:${color}"></div></div>
                    </div>`)}
                </div>
            </div>
        </div>`}
        <${RelatedCalcs} current="ev" settings=${settings} />
    </div>`;
}
