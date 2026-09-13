import { html, useState } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { navigate } from '../router.js';
import { loadGoals, saveGoals, GOALS_ASSETS } from '../store.js';
import { formatCurrency } from '../utils.js';

const CALC_PATHS = {
    'mutual-funds': '/kalkulator/reksa-dana',
    stocks: '/kalkulator/saham',
    'term-deposits': '/kalkulator/deposito',
};

export function GoalsPanel({ settings, totalValue, monthlyAvg }) {
    const locale = settings.locale;
    const go = (e, to) => { e.preventDefault(); navigate(to); };
    const LABELS = { 'mutual-funds': t(locale, 'nav.mutualFunds'), stocks: t(locale, 'nav.stocks'), 'term-deposits': t(locale, 'nav.termDeposits') };
    const [goals, setGoals] = useState(loadGoals());
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState(goals);

    function startEdit() { setForm(JSON.parse(JSON.stringify(goals))); setEditing(true); }
    function save() {
        const clean = {
            overall: { target: Math.max(0, Number(form.overall?.target) || 0), targetDate: String(form.overall?.targetDate || '') },
            assets: Object.fromEntries(GOALS_ASSETS.map(a => [a, { target: Math.max(0, Number(form.assets?.[a]?.target) || 0) }])),
        };
        setGoals(clean); saveGoals(clean); setEditing(false);
    }

    function progress(value, target) {
        if (!target || target <= 0) return 0;
        return Math.min(100, (value / target) * 100);
    }
    function paceMonths(value, target) {
        if (!target || target <= value || !monthlyAvg || monthlyAvg <= 0) return null;
        return Math.ceil((target - value) / monthlyAvg);
    }

    const overallPace = paceMonths(totalValue, goals.overall.target);

    return html`<div class="card">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">
            <h2 style="margin:0">${t(locale, 'goals.title')}</h2>
            <span style="flex:1"></span>
            ${editing
                ? html`<button class="btn-ghost btn-sm" onClick=${()=>setEditing(false)}>${t(locale, 'goals.cancel')}</button> <button class="btn-sm" onClick=${save}>${t(locale, 'goals.save')}</button>`
                : html`<button class="btn-ghost btn-sm" onClick=${startEdit}>${t(locale, 'goals.edit')}</button>`}
        </div>
        ${!editing && !goals.overall.target && !GOALS_ASSETS.some(a=>goals.assets[a].target)
            ? html`<p class="muted" style="font-size:13px">${t(locale, 'goals.noGoals')}</p>
                <p style="font-size:13px; display:flex; gap:8px; flex-wrap:wrap">
                    ${GOALS_ASSETS.map(a => html`<a href=${CALC_PATHS[a]} onClick=${e=>go(e,CALC_PATHS[a])}>${LABELS[a]} →</a>`)}
                </p>`
            : html`<div>
                <div style="margin-top:8px">
                    <div class="smallcaps">${t(locale, 'goals.overall')} ${goals.overall.targetDate ? `· ${goals.overall.targetDate}` : ''}</div>
                    ${goals.overall.target
                        ? html`<div class="amount" style="font-size:15px">${formatCurrency(totalValue, settings.locale, settings.currency)} / ${formatCurrency(goals.overall.target, settings.locale, settings.currency)} (${progress(totalValue, goals.overall.target).toFixed(0)}%)</div>
                            <div style="height:8px; border-radius:999px; background:var(--goals-track); overflow:hidden; margin-top:4px"><div style="height:100%; width:${progress(totalValue, goals.overall.target)}%; background:var(--goals-grad)"></div></div>
                            ${overallPace != null
                                ? html`<p class="muted" style="font-size:12px">${t(locale, 'goals.paceMonths', { months: overallPace })}</p>`
                                : goals.overall.target <= totalValue ? html`<p style="color:var(--success); font-weight:700; font-size:13px">▲ ${t(locale, 'goals.reached')}</p>` : ''}`
                        : html`<span class="muted" style="font-size:13px">${t(locale, 'ui.noTarget')}</span>`}
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:8px; margin-top:8px">
                    ${GOALS_ASSETS.map(a => editing
                        ? html`<label>${LABELS[a]} ${t(locale, 'ui.target')} <input type="number" value=${form.assets[a].target} onInput=${e=>setForm({...form, assets:{...form.assets, [a]:{target:e.target.value}}})} /></label>`
                        : html`<div><div class="smallcaps"><a href=${CALC_PATHS[a]} onClick=${e=>go(e,CALC_PATHS[a])}>${LABELS[a]}</a></div><div style="font-weight:700">${goals.assets[a].target ? formatCurrency(goals.assets[a].target, settings.locale, settings.currency) : '—'}</div></div>`)}
                </div>
                ${editing && html`<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px">
                    <label>${t(locale, 'ui.targetValue')} <input type="number" value=${form.overall.target} onInput=${e=>setForm({...form, overall:{...form.overall, target:e.target.value}})} /></label>
                    <label>${t(locale, 'goals.targetDate')} <input type="date" value=${form.overall.targetDate} onInput=${e=>setForm({...form, overall:{...form.overall, targetDate:e.target.value}})} /></label>
                </div>`}
            </div>`}
    </div>`;
}
