import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { loadLedgers, saveLedgers } from '../store.js';
import { calculateReturns } from '../api.js';
import { t } from '../i18n.js';
import { LedgerTable, SummaryCards } from './AssetForm.js';
import { LedgerIo } from './LedgerIo.js';
import { InfoTip } from './InfoTip.js';

export function TermDeposits({ settings }) {
    const [td, setTd] = useState(()=> loadLedgers()['term-deposits']);
    const [entries, setEntries] = useState(()=> loadLedgers()['term-deposits'].entries);
    const [apy, setApy] = useState(()=> loadLedgers()['term-deposits'].apy);
    const [result, setResult] = useState(()=> loadLedgers().results['term-deposits']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(()=> { const l=loadLedgers(); setEntries(l['term-deposits'].entries); setApy(l['term-deposits'].apy); setResult(l.results['term-deposits']); }, []);

    function upd(idx, f, v){ setEntries(entries.map((e,i)=> i===idx ? {...e,[f]:v}:e)); }
    function addRow(){ setEntries([...entries, { date:new Date().toISOString().slice(0,10), installment_amount:1000, current_value:1000, term_months:12, maturity_date:'' }]); }
    function rm(idx){ setEntries(entries.filter((_,i)=>i!==idx)); }

    async function onCalc(){
        setLoading(true); setError('');
        try{
            const payload = { apy: Number(apy), entries: entries.map(e=>({ date:e.date, installment_amount:Number(e.installment_amount)||0, current_value:Number(e.current_value)||0, term_months:Number(e.term_months)||12, maturity_date:e.maturity_date||null })) };
            const data = await calculateReturns('term-deposits', payload);
            setResult(data);
            const l=loadLedgers(); l['term-deposits']={apy:Number(apy), entries}; l.results['term-deposits']=data; saveLedgers(l);
        }catch(e){ setError(e.detail ? JSON.stringify(e.detail) : e.message); } finally{ setLoading(false); }
    }

    const locale = settings.locale;
    return html`<div>
        <div class="page-head"><h1>${t(locale, 'nav.termDeposits')}</h1><p class="muted">APY prorated interest · maturity & rollover tracker. <${InfoTip} locale=${locale} tipKey="glossary.apy" /> <${InfoTip} locale=${locale} tipKey="glossary.depositMaturity" /></p></div>
        <div class="card">
            <label>APY (e.g. 0.06 = 6%) <input type="number" step="0.001" value=${apy} onInput=${e=>setApy(e.target.value)} /></label>
        </div>
        <div class="card">
            ${entries.map((e,idx)=> html`<div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr 1fr auto; gap:8px; margin-bottom:8px; align-items:end">
                <label>Date <input type="date" value=${e.date} onInput=${ev=>upd(idx,'date',ev.target.value)} /></label>
                <label>Installment <input type="number" value=${e.installment_amount} onInput=${ev=>upd(idx,'installment_amount',ev.target.value)} /></label>
                <label>Current Value <input type="number" value=${e.current_value} onInput=${ev=>upd(idx,'current_value',ev.target.value)} /></label>
                <label>Term (mo) <input type="number" value=${e.term_months} onInput=${ev=>upd(idx,'term_months',ev.target.value)} /></label>
                <label>Maturity <input type="date" value=${e.maturity_date||''} onInput=${ev=>upd(idx,'maturity_date',ev.target.value)} /></label>
                <button class="btn-ghost btn-sm" onClick=${()=>rm(idx)}>Remove</button>
            </div>`)}
            <button class="btn-ghost" onClick=${addRow}>${t(locale, 'common.addRow')}</button>
            <div style="margin-top:12px"><button onClick=${onCalc} disabled=${loading}>${loading ? t(locale, 'common.calculating') : t(locale, 'common.calculateReturns')}</button></div>
            ${error && html`<p style="color:var(--danger)">${error}</p>`}
        </div>
        <${LedgerIo} asset="term-deposits" entries=${entries} locale=${locale} onImport=${(rows) => setEntries(rows)} />
        ${result && html`<div>
            <${SummaryCards} summary=${result.summary} settings=${settings} />
            <${LedgerTable} rows=${result.ledger} settings=${settings} columns=${[
                {key:'date', label:'Date'},
                {key:'installment_amount', label:'Installment', fmt:'currency'},
                {key:'current_value', label:'Value', fmt:'currency'},
                {key:'maturity_date', label:'Maturity'},
                {key:'days_to_maturity', label:'Days to Mat'},
                {key:'maturity_status', label:'Status'},
                {key:'maturity_value', label:'Maturity Value', fmt:'currency'},
                {key:'accrued_interest', label:'Accrued', fmt:'currency'},
            ]} />
        </div>`}
    </div>`;
}
