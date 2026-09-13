import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { loadLedgers, saveLedgers } from '../store.js';
import { calculateReturns } from '../api.js';
import { t } from '../i18n.js';
import { LedgerTable, SummaryCards } from './AssetForm.js';
import { LedgerIo } from './LedgerIo.js';
import { MomentumKpi } from './MomentumKpi.js';
import { AssetChart } from './AssetChart.js';
import { InfoTip } from './InfoTip.js';

export function MutualFunds({ settings }) {
    const [entries, setEntries] = useState(()=> loadLedgers()['mutual-funds']);
    const [result, setResult] = useState(()=> loadLedgers().results['mutual-funds']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(()=> { const l=loadLedgers(); setEntries(l['mutual-funds']); setResult(l.results['mutual-funds']); }, []);

    function updateRow(idx, field, value) {
        const next = entries.map((e,i)=> i===idx ? {...e, [field]: value} : e);
        setEntries(next);
    }
    function addRow(){ setEntries([...entries, { date: new Date().toISOString().slice(0,10), installment_amount: 1000, current_value: 1000 }]); }
    function removeRow(idx){ setEntries(entries.filter((_,i)=>i!==idx)); }

    async function onCalc(){
        setLoading(true); setError('');
        if (!entries.length) {
            setLoading(false);
            setError(t(settings.locale, 'error.atLeastOneRow'));
            return;
        }
        if (entries.some((e) => !e.date)) {
            setLoading(false);
            setError(t(settings.locale, 'error.everyRowDate'));
            return;
        }
        try{
            const payload = { entries: entries.map(e=>({ date:e.date, installment_amount: Number(e.installment_amount)||0, current_value: Number(e.current_value)||0 })) };
            const data = await calculateReturns('mutual-funds', payload);
            setResult(data);
            const ledgers = loadLedgers(); ledgers['mutual-funds']=entries; ledgers.results['mutual-funds']=data; saveLedgers(ledgers);
        }catch(e){ setError(e.detail ? JSON.stringify(e.detail) : e.message); }
        finally{ setLoading(false); }
    }

    const locale = settings.locale;
    return html`<div>
        <div class="page-head"><h1>${t(locale, 'nav.mutualFunds')}</h1><p class="muted">Cash-flow adjusted MoM · XIRR via exact dates. <${InfoTip} locale=${locale} tipKey="glossary.moM" /> <${InfoTip} locale=${locale} tipKey="glossary.xirr" /></p></div>
        <div class="card">
            ${entries.map((e,idx)=> html`<div style="display:grid; grid-template-columns:1fr 1fr 1fr auto; gap:8px; margin-bottom:8px; align-items:end">
                <label>Date <input type="date" value=${e.date} onInput=${ev=>updateRow(idx,'date',ev.target.value)} /></label>
                <label>Installment <input type="number" value=${e.installment_amount} onInput=${ev=>updateRow(idx,'installment_amount',ev.target.value)} /></label>
                <label>Current Value <input type="number" value=${e.current_value} onInput=${ev=>updateRow(idx,'current_value',ev.target.value)} /></label>
                <button class="btn-ghost btn-sm" onClick=${()=>removeRow(idx)}>Remove</button>
            </div>`)}
            <button class="btn-ghost" onClick=${addRow}>${t(locale, 'common.addRow')}</button>
            <div style="margin-top:12px"><button onClick=${onCalc} disabled=${loading}>${loading ? t(locale, 'common.calculating') : t(locale, 'common.calculateReturns')}</button></div>
            ${error && html`<p style="color:var(--danger)">${error}</p>`}
        </div>
        <${LedgerIo} asset="mutual-funds" entries=${entries} locale=${locale} onImport=${(rows) => setEntries(rows)} />
        ${result && html`<div>
            <${MomentumKpi} ledger=${result.ledger} summary=${result.summary} asset="mutual-funds" settings=${settings} />
            <${AssetChart} ledger=${result.ledger} asset="mutual-funds" settings=${settings} />
            <${SummaryCards} summary=${result.summary} settings=${settings} />
            <${LedgerTable} rows=${result.ledger} settings=${settings} columns=${[
                {key:'date', label:'Date'},
                {key:'installment_amount', label:'Installment', fmt:'currency'},
                {key:'current_value', label:'Current Value', fmt:'currency'},
                {key:'month_start_value', label:'Start Value', fmt:'currency'},
                {key:'mom_return', label:'MoM Return', fmt:'percent'},
            ]} />
        </div>`}
    </div>`;
}
