import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { retireComparison } from '../api.js';
import { formatCurrency, formatCompactCurrency } from '../utils.js';
import { t } from '../i18n.js';
import { readSharedState, ShareLink } from '../share.js';
import { HowTo } from './HowTo.js';
import { Crumbs } from './Crumbs.js';
import { RelatedCalcs } from './RelatedCalcs.js';
import { RetireChart } from './RetireChart.js';

const FIELDS = [
    ['years_to_retire', 'retire.yearsToRetire'],
    ['monthly_need_today', 'retire.monthlyNeed'],
    ['inflation_annual', 'retire.inflation'],
    ['invest_return_annual', 'retire.investReturn'],
    ['current_savings', 'retire.currentSavings'],
    ['withdrawal_rate', 'retire.withdrawalRate'],
    ['current_monthly_invest', 'retire.currentMonthly'],
];

// Percent on screen, fractions on the wire (same convention as rent-buy).
const RATE_FIELDS = ['inflation_annual', 'invest_return_annual', 'withdrawal_rate'];

const DEFAULTS = {
    years_to_retire: 20, monthly_need_today: 10000000,
    inflation_annual: 4, invest_return_annual: 8,
    current_savings: 100000000, withdrawal_rate: 4,
    current_monthly_invest: 2000000,
};

export function Retire({ settings }) {
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
            if (RATE_FIELDS.some((key) => !(Number(inputs[key]) >= 0 && Number(inputs[key]) <= 100))) {
                throw new Error(t(locale, 'error.validationFailed'));
            }
            if (FIELDS.some(([key]) => !Number.isFinite(payload[key]) || payload[key] < 0)) {
                throw new Error(t(locale, 'error.validationFailed'));
            }
            const data = await retireComparison(payload);
            data.calculatedAt = new Date().toISOString();
            setResult(data);
            if (inputsOverride) setForm({ ...inputs });
            requestAnimationFrame(() => document.querySelector('[data-results]')?.scrollIntoView());
        } catch (e) { setError(e.detail ? JSON.stringify(e.detail) : e.message); }
        finally { setLoading(false); }
    }

    function verdict() {
        if (!result) return null;
        if (result.required_monthly <= 0) {
            return { tone: 'var(--success)', text: t(locale, 'retire.verdictFunded'), sub: t(locale, 'retire.method') };
        }
        return {
            tone: 'var(--chart-orange)',
            text: t(locale, 'retire.verdictInvest', { amount: formatCompactCurrency(result.required_monthly, locale, currency) }),
            sub: result.shortfall > 0
                ? t(locale, 'retire.verdictGap', { amount: formatCompactCurrency(result.shortfall, locale, currency) })
                : t(locale, 'retire.method'),
        };
    }

    const cc = (value) => formatCompactCurrency(value, locale, currency);
    const full = (value) => formatCurrency(value, locale, currency);
    const v = verdict();
    const ratio = result ? Math.min(result.funded_ratio, 1) : 0;

    return html`<div>
        <${Crumbs} locale=${locale} currentKey="nav.retire" />
        <div class="page-head"><h1>${t(locale, 'nav.retire')}</h1><p class="muted">${t(locale, 'retire.subtitle')}</p></div>
        <${HowTo} locale=${locale} startOpen=${!result} steps=${[t(locale, 'howto.retire1'), t(locale, 'howto.retire2'), t(locale, 'howto.retire3')]} />
        <div class="card">
            <div class="entry-grid" style="--cols:3">
                ${FIELDS.map(([key, labelKey]) => html`<label>${t(locale, labelKey)}
                    <input type="number" min="0" max=${RATE_FIELDS.includes(key) ? '100' : undefined} step="any" value=${form[key]} onInput=${e => set(key, e.target.value)} />
                </label>`)}
            </div>
            <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap">
                <button onClick=${() => onCompare()} disabled=${loading}>${loading ? t(locale, 'retire.comparing') : t(locale, 'retire.compare')}</button>
                <${ShareLink} route="retire" state=${{ inputs: { ...form, rates_pct: 1 } }} locale=${locale} />
            </div>
            ${error && html`<p style="color:var(--danger)" role="alert">${error}</p>`}
        </div>
        ${result && html`<div data-results class="results-anchor">
            ${v && html`<div class="card" style=${`border-left:4px solid ${v.tone}`}>
                <div class="amount" style=${`font-size:17px; color:${v.tone}`}>${v.text}</div>
                <div class="muted" style="font-size:13px; margin-top:4px">${v.sub}</div>
            </div>`}
            <div class="summary-cards">
                <div class="card"><div class="smallcaps">${t(locale, 'retire.targetFund')}</div><div class="amount" title=${full(result.target_fund)} style="font-size:15px">${cc(result.target_fund)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'retire.requiredMonthly')}</div><div class="amount" title=${full(result.required_monthly)} style="font-size:15px">${cc(result.required_monthly)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'retire.needAtRetirement')}</div><div class="amount" title=${full(result.need_at_retirement_monthly)} style="font-size:15px">${cc(result.need_at_retirement_monthly)}</div></div>
                <div class="card"><div class="smallcaps">${t(locale, 'retire.onTrack')}</div><div class="amount" style="font-size:15px; color:${result.funded_ratio >= 1 ? 'var(--success)' : 'var(--chart-orange)'}">${(result.funded_ratio * 100).toFixed(0)}%</div></div>
            </div>
            <${RetireChart} schedule=${result.schedule} targetFund=${result.target_fund} settings=${settings} />
            <div class="card">
                <div class="smallcaps">${t(locale, 'retire.sensTitle')}</div>
                <div class="muted" style="font-size:12px; margin-top:4px">${t(locale, 'retire.sensCaption')}</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px">
                    ${result.sensitivity.map((pt) => html`<span style="display:inline-block; padding:2px 10px; border-radius:999px; font-size:12px; background:var(--chart-track); white-space:nowrap" title=${full(pt.required_monthly)}>
                        ${(pt.invest_return * 100).toFixed(0)}% → ${cc(pt.required_monthly)}${t(locale, 'retire.perMonth')}
                    </span>`)}
                </div>
            </div>
            <div class="card">
                <div style="display:flex; justify-content:space-between; font-size:13px"><span>${t(locale, 'retire.onTrack')}</span><span class="num">${(ratio * 100).toFixed(0)}%</span></div>
                <div style="height:10px; border-radius:999px; background:var(--chart-track); overflow:hidden; margin-top:4px"><div style="height:100%; width:${(ratio * 100).toFixed(1)}%; background:${result.funded_ratio >= 1 ? 'var(--success)' : 'var(--chart-blue)'}"></div></div>
            </div>
        </div>`}
        <${RelatedCalcs} current="retire" settings=${settings} />
    </div>`;
}
