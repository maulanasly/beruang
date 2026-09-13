import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { loadLedgers, saveLedgers, saveEntries, SAMPLE_MF } from '../store.js';
import { calculateReturns } from '../api.js';
import { t } from '../i18n.js';
import { readSharedState, ShareLink, normalizeLedgerEntries, calcSnapshot } from '../share.js';
import { LedgerTable, SummaryCards } from './AssetForm.js';
import { LedgerIo } from './LedgerIo.js';
import { MomentumKpi } from './MomentumKpi.js';
import { AssetChart } from './AssetChart.js';
import { HowTo } from './HowTo.js';
import { Crumbs } from './Crumbs.js';
import { RelatedCalcs } from './RelatedCalcs.js';
import { InfoTip } from './InfoTip.js';

export function MutualFunds({ settings }) {
    const [entries, setEntries] = useState(()=> loadLedgers()['mutual-funds']);
    const [result, setResult] = useState(()=> loadLedgers().results['mutual-funds']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(()=> {
        const l=loadLedgers(); setEntries(l['mutual-funds']); setResult(l.results['mutual-funds']);
        const shared = readSharedState();
        if (shared) onCalc(shared.entries);
    }, []);

    function updateRow(idx, field, value) {
        const next = entries.map((e,i)=> i===idx ? {...e, [field]: value} : e);
        setEntries(next);
        saveEntries('mutual-funds', next);
    }
    function addRow(){
        const next = [...entries, { date:new Date().toISOString().slice(0,10), installment_amount:1000, current_value:1000 }];
        setEntries(next);
        saveEntries('mutual-funds', next);
    }
    function removeRow(idx){
        const next = entries.filter((_,i)=>i!==idx);
        setEntries(next);
        saveEntries('mutual-funds', next);
    }
    function loadSample(){
        const next = SAMPLE_MF.map(e => ({ ...e }));
        setEntries(next);
        saveEntries('mutual-funds', next);
    }
    // Persist imports immediately (navigating away must not lose them)
    // and invalidate the calculated snapshot so the dashboard flags edits.
    function importRows(rows) {
        setEntries(rows);
        saveEntries('mutual-funds', rows);
        const ledgers = loadLedgers();
        ledgers.results['mutual-funds'] = null;
        saveLedgers(ledgers);
    }

    async function onCalc(rowsOverride){
        const rows = rowsOverride || entries;
        setLoading(true); setError('');
        if (!rows.length) {
            setLoading(false);
            setError(t(settings.locale, 'error.atLeastOneRow'));
            return;
        }
        if (rows.some((e) => !e.date)) {
            setLoading(false);
            setError(t(settings.locale, 'error.everyRowDate'));
            return;
        }
        try{
            const payload = { entries: normalizeLedgerEntries('mutual-funds', rows) };
            const data = await calculateReturns('mutual-funds', payload);
            data.calculatedAt = new Date().toISOString();
            data.calcSnapshot = calcSnapshot('mutual-funds', rows);
            setResult(data);
            const ledgers = loadLedgers(); ledgers['mutual-funds']=rows; ledgers.results['mutual-funds']=data; saveLedgers(ledgers);
            if (rowsOverride) setEntries(rowsOverride);
            requestAnimationFrame(() => document.querySelector('[data-results]')?.scrollIntoView());
        }catch(e){ setError(e.detail ? JSON.stringify(e.detail) : e.message); }
        finally{ setLoading(false); }
    }

    const locale = settings.locale;
    return html`<div>
        <${Crumbs} locale=${locale} currentKey="nav.mutualFunds" />
        <div class="page-head"><h1>${t(locale, 'nav.mutualFunds')}</h1><p class="muted">${t(locale, 'calc.mfSubtitle')} <${InfoTip} locale=${locale} tipKey="glossary.moM" /> <${InfoTip} locale=${locale} tipKey="glossary.xirr" /></p></div>
        <${HowTo} locale=${locale} startOpen=${!result} steps=${[t(locale,'howto.mf1'), t(locale,'howto.mf2'), t(locale,'howto.mf3')]} />
        <div class="card">
            ${entries.map((e,idx)=> html`<div class="entry-grid" style="--cols:3">
                <label>${t(locale, 'form.date')} <input type="date" value=${e.date} onInput=${ev=>updateRow(idx,'date',ev.target.value)} /></label>
                <label>${t(locale, 'form.installmentAmount')} <input type="number" value=${e.installment_amount} onInput=${ev=>updateRow(idx,'installment_amount',ev.target.value)} /></label>
                <label>${t(locale, 'form.currentValue')} <input type="number" value=${e.current_value} onInput=${ev=>updateRow(idx,'current_value',ev.target.value)} /></label>
                <button class="btn-ghost btn-sm" onClick=${()=>removeRow(idx)}>${t(locale, 'common.remove')}</button>
            </div>`)}
            <button class="btn-ghost" onClick=${addRow}>${t(locale, 'common.addRow')}</button>
            ${!entries.length && html`<button class="btn-ghost" style="margin-left:8px" onClick=${loadSample}>${t(locale, 'overview.loadDemo')}</button>`}
            <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap">
                <button onClick=${()=>onCalc()} disabled=${loading}>${loading ? t(locale, 'common.calculating') : t(locale, 'common.calculateReturns')}</button>
                <${ShareLink} route="mutual-funds" state=${{ entries }} locale=${locale} />
            </div>
            ${error && html`<p style="color:var(--danger)" role="alert">${error}</p>`}
        </div>
        <${LedgerIo} asset="mutual-funds" entries=${entries} locale=${locale} onImport=${importRows} />
        ${result && html`<div data-results class="results-anchor">
            <${MomentumKpi} ledger=${result.ledger} summary=${result.summary} asset="mutual-funds" settings=${settings} />
            <${AssetChart} ledger=${result.ledger} asset="mutual-funds" settings=${settings} />
            <${SummaryCards} summary=${result.summary} settings=${settings} />
            <${LedgerTable} rows=${result.ledger} settings=${settings} columns=${[
                {key:'date', label:t(locale, 'column.date')},
                {key:'installment_amount', label:t(locale, 'column.installment'), fmt:'currency'},
                {key:'current_value', label:t(locale, 'column.currentValue'), fmt:'currency'},
                {key:'month_start_value', label:t(locale, 'column.startValue'), fmt:'currency'},
                {key:'mom_return', label:t(locale, 'column.momReturn'), fmt:'percent'},
            ]} />
        </div>`}
        <${RelatedCalcs} current="mutual-funds" settings=${settings} />
    </div>`;
}
