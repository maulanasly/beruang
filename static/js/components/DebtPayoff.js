import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { debtPayoffComparison } from '../api.js';
import { formatCurrency, formatCompactCurrency } from '../utils.js';
import { t } from '../i18n.js';
import { readSharedState, ShareLink } from '../share.js';
import { HowTo } from './HowTo.js';
import { Crumbs } from './Crumbs.js';
import { RelatedCalcs } from './RelatedCalcs.js';
import { DebtChart } from './DebtChart.js';

const BLANK_DEBT = { name: '', balance: '', annual_rate: '', rate_kind: 'effective', tenor_months: '', min_payment: '' };

const DEFAULT_DEBTS = [
    { name: 'Paylater', balance: 12000000, annual_rate: 36, rate_kind: 'effective', tenor_months: 12, min_payment: 1000000 },
    { name: 'Motor', balance: 20000000, annual_rate: 8, rate_kind: 'flat', tenor_months: 24, min_payment: 0 },
];

const DEFAULT_EXTRA = 1000000;

export function DebtPayoff({ settings }) {
    const locale = settings.locale;
    const currency = settings.currency;
    const [debts, setDebts] = useState(DEFAULT_DEBTS.map(d => ({ ...d })));
    const [extra, setExtra] = useState(DEFAULT_EXTRA);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const shared = readSharedState();
        if (shared && shared.inputs) onCompare(shared.inputs);
    }, []);

    function setDebt(i, key, value) {
        setDebts(debts.map((d, j) => (j === i ? { ...d, [key]: value } : d)));
    }

    function addDebt() {
        if (debts.length < 12) setDebts([...debts, { ...BLANK_DEBT }]);
    }

    function removeDebt(i) {
        if (debts.length > 1) setDebts(debts.filter((_, j) => j !== i));
    }

    async function onCompare(inputsOverride) {
        const ds = inputsOverride?.debts || debts;
        const ex = inputsOverride?.extra_payment ?? extra;
        setLoading(true); setError('');
        try {
            if (!Array.isArray(ds) || !ds.length || ds.length > 12) {
                throw new Error(t(locale, 'error.validationFailed'));
            }
            const payloadDebts = ds.map(d => ({
                name: String(d.name || '').trim(),
                balance: Number(d.balance),
                annual_rate: Number(d.annual_rate) / 100,
                rate_kind: d.rate_kind === 'flat' ? 'flat' : 'effective',
                tenor_months: Number(d.tenor_months) || 0,
                min_payment: Number(d.min_payment) || 0,
            }));
            const payload = { debts: payloadDebts, extra_payment: Number(ex) || 0 };
            if (payloadDebts.some(d => !d.name || !Number.isFinite(d.balance) || d.balance <= 0
                || !Number.isFinite(d.annual_rate) || d.annual_rate < 0 || d.annual_rate > 1
                || !Number.isFinite(payload.extra_payment) || payload.extra_payment < 0)) {
                throw new Error(t(locale, 'error.validationFailed'));
            }
            const data = await debtPayoffComparison(payload);
            data.calculatedAt = new Date().toISOString();
            setResult(data);
            if (inputsOverride) {
                setDebts(ds.map(d => ({ ...BLANK_DEBT, ...d })));
                setExtra(ex);
            }
            requestAnimationFrame(() => document.querySelector('[data-results]')?.scrollIntoView());
        } catch (e) { setError(e.detail ? JSON.stringify(e.detail) : e.message); }
        finally { setLoading(false); }
    }

    function verdict() {
        if (!result) return null;
        const saved = result.interest_saved_avalanche;
        const months = result.months_saved_avalanche;
        if (saved <= 0 && months <= 0) {
            return { tone: 'var(--chart-orange)', text: t(locale, 'debt.verdictTie'), sub: t(locale, 'debt.method') };
        }
        return {
            tone: 'var(--success)',
            text: t(locale, 'debt.verdictSave', { amount: formatCompactCurrency(saved, locale, currency), months }),
            sub: t(locale, 'debt.method'),
        };
    }

    const cc = (value) => formatCompactCurrency(value, locale, currency);
    const full = (value) => formatCurrency(value, locale, currency);
    const v = verdict();

    function planCards(plan, color) {
        return html`<div class="card">
            <div class="smallcaps" style=${`color:${color}`}>${t(locale, plan.strategy === 'avalanche' ? 'debt.avalanche' : 'debt.snowball')}</div>
            <div class="amount" style="font-size:15px">${t(locale, 'debt.monthsFree', { months: plan.total_months })}</div>
            <div class="muted" style="font-size:13px; margin-top:4px">${t(locale, 'debt.planInterest')} <span class="num" title=${full(plan.total_interest)}>${cc(plan.total_interest)}</span> · ${t(locale, 'debt.firstWin', { month: plan.first_win_month })}</div>
            <div style="display:grid; gap:4px; margin-top:8px; font-size:13px">
                ${plan.debts.map(d => html`<div style="display:flex; justify-content:space-between; gap:8px"><span>${d.name}</span><span class="num">M${d.payoff_month} · <span title=${full(d.interest_paid)}>${cc(d.interest_paid)}</span></span></div>`)}
            </div>
        </div>`;
    }

    return html`<div>
        <${Crumbs} locale=${locale} currentKey="nav.debtPayoff" />
        <div class="page-head"><h1>${t(locale, 'nav.debtPayoff')}</h1><p class="muted">${t(locale, 'debt.subtitle')}</p></div>
        <${HowTo} locale=${locale} startOpen=${!result} steps=${[t(locale, 'howto.debt1'), t(locale, 'howto.debt2'), t(locale, 'howto.debt3')]} />
        <div class="card">
            ${debts.map((d, i) => html`<div class="deposit-row">
                <div class="deposit-row__head">
                    <strong style="font-size:13px">${t(locale, 'debt.debtN', { n: i + 1 })}</strong>
                    ${debts.length > 1 && html`<button type="button" class="btn-ghost btn-sm" onClick=${() => removeDebt(i)}>${t(locale, 'common.remove')}</button>`}
                </div>
                <div class="entry-grid" style="--cols:3">
                    <label>${t(locale, 'debt.debtName')}
                        <input type="text" maxlength="64" value=${d.name} onInput=${e => setDebt(i, 'name', e.target.value)} placeholder=${t(locale, 'debt.debtNamePh')} />
                    </label>
                    <label>${t(locale, 'debt.balance')}
                        <input type="number" min="0" value=${d.balance} onInput=${e => setDebt(i, 'balance', e.target.value)} />
                    </label>
                    <label>${t(locale, 'debt.annualRate')}
                        <input type="number" min="0" max="100" step="any" value=${d.annual_rate} onInput=${e => setDebt(i, 'annual_rate', e.target.value)} />
                    </label>
                    <label>${t(locale, 'debt.rateKind')}
                        <select value=${d.rate_kind} onChange=${e => setDebt(i, 'rate_kind', e.target.value)}>
                            <option value="effective">${t(locale, 'debt.kindEffective')}</option>
                            <option value="flat">${t(locale, 'debt.kindFlat')}</option>
                        </select>
                    </label>
                    ${d.rate_kind === 'flat'
                        ? html`<label>${t(locale, 'debt.tenorMonths')}
                            <input type="number" min="1" max="360" value=${d.tenor_months} onInput=${e => setDebt(i, 'tenor_months', e.target.value)} />
                        </label>`
                        : html`<label>${t(locale, 'debt.minPayment')}
                            <input type="number" min="0" value=${d.min_payment} onInput=${e => setDebt(i, 'min_payment', e.target.value)} />
                        </label>`}
                </div>
            </div>`)}
            <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap">
                ${debts.length < 12 && html`<button type="button" class="btn-ghost btn-sm" onClick=${addDebt}>${t(locale, 'common.addRow')}</button>`}
            </div>
            <div class="entry-grid" style="--cols:3; margin-top:8px">
                <label>${t(locale, 'debt.extraPayment')}
                    <input type="number" min="0" value=${extra} onInput=${e => setExtra(e.target.value)} />
                </label>
            </div>
            <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap">
                <button onClick=${() => onCompare()} disabled=${loading}>${loading ? t(locale, 'debt.comparing') : t(locale, 'debt.compare')}</button>
                <${ShareLink} route="debt-payoff" state=${{ inputs: { debts, extra_payment: extra, rates_pct: 1 } }} locale=${locale} />
            </div>
            ${error && html`<p style="color:var(--danger)" role="alert">${error}</p>`}
        </div>
        ${result && html`<div data-results class="results-anchor">
            ${v && html`<div class="card" style=${`border-left:4px solid ${v.tone}`}>
                <div class="amount" style=${`font-size:17px; color:${v.tone}`}>${v.text}</div>
                <div class="muted" style="font-size:13px; margin-top:4px">${v.sub}</div>
            </div>`}
            <div class="summary-cards">
                ${planCards(result.avalanche, 'var(--chart-blue)')}
                ${planCards(result.snowball, 'var(--chart-orange)')}
            </div>
            <${DebtChart} avalanche=${result.avalanche.schedule} snowball=${result.snowball.schedule} settings=${settings} />
        </div>`}
        <${RelatedCalcs} current="debt-payoff" settings=${settings} />
    </div>`;
}
