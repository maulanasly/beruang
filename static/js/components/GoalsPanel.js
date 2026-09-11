import { html, useState } from '../vendor/preact-htm-signals.js';
import { loadGoals, saveGoals, GOALS_ASSETS } from '../store.js';
import { formatCurrency } from '../utils.js';

const LABELS = { 'mutual-funds': 'Mutual Funds', stocks: 'Stocks', 'term-deposits': 'Term Deposits' };

export function GoalsPanel({ settings, totalValue, monthlyAvg }) {
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
            <h2 style="margin:0">Goals & Targets</h2>
            <span style="flex:1"></span>
            ${editing
                ? html`<button class="btn-ghost btn-sm" onClick=${()=>setEditing(false)}>Cancel</button> <button class="btn-sm" onClick=${save}>Save</button>`
                : html`<button class="btn-ghost btn-sm" onClick=${startEdit}>Edit</button>`}
        </div>
        ${!editing && !goals.overall.target && !GOALS_ASSETS.some(a=>goals.assets[a].target)
            ? html`<p class="muted" style="font-size:13px">Set a target value to track your progress toward a goal.</p>`
            : html`<div>
                <div style="margin-top:8px">
                    <div class="smallcaps">Overall Portfolio Goal ${goals.overall.targetDate ? `· by ${goals.overall.targetDate}` : ''}</div>
                    ${goals.overall.target
                        ? html`<div class="amount" style="font-size:15px">${formatCurrency(totalValue, settings.locale, settings.currency)} / ${formatCurrency(goals.overall.target, settings.locale, settings.currency)} (${progress(totalValue, goals.overall.target).toFixed(0)}%)</div>
                            <div style="height:8px; border-radius:999px; background:#e2e8f0; overflow:hidden; margin-top:4px"><div style="height:100%; width:${progress(totalValue, goals.overall.target)}%; background:linear-gradient(90deg,#2563eb,#3b82f6)"></div></div>
                            ${overallPace != null
                                ? html`<p class="muted" style="font-size:12px">~${overallPace} months to goal at current pace</p>`
                                : goals.overall.target <= totalValue ? html`<p style="color:var(--success); font-weight:700; font-size:13px">Goal reached</p>` : ''}`
                        : html`<span class="muted" style="font-size:13px">No overall target</span>`}
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:8px; margin-top:8px">
                    ${GOALS_ASSETS.map(a => editing
                        ? html`<label>${LABELS[a]} target <input type="number" value=${form.assets[a].target} onInput=${e=>setForm({...form, assets:{...form.assets, [a]:{target:e.target.value}}})} /></label>`
                        : html`<div><div class="smallcaps">${LABELS[a]}</div><div style="font-weight:700">${goals.assets[a].target ? formatCurrency(goals.assets[a].target, settings.locale, settings.currency) : '—'}</div></div>`)}
                </div>
                ${editing && html`<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px">
                    <label>Overall target <input type="number" value=${form.overall.target} onInput=${e=>setForm({...form, overall:{...form.overall, target:e.target.value}})} /></label>
                    <label>Target date <input type="date" value=${form.overall.targetDate} onInput=${e=>setForm({...form, overall:{...form.overall, targetDate:e.target.value}})} /></label>
                </div>`}
            </div>`}
    </div>`;
}
