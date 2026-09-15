import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { loadLedgers, saveLedgers, saveEntries, SAMPLE_TD } from '../store.js';
import { calculateReturns } from '../api.js';
import { t } from '../i18n.js';
import { readSharedState, ShareLink, normalizeLedgerEntries, calcSnapshot } from '../share.js';
import { LedgerTable, SummaryCards } from './AssetForm.js';
import { LedgerIo } from './LedgerIo.js';
import { MomentumKpi } from './MomentumKpi.js';
import { AssetChart } from './AssetChart.js';
import { MaturityPanel } from './MaturityPanel.js';
import { HowTo } from './HowTo.js';
import { Crumbs } from './Crumbs.js';
import { RelatedCalcs } from './RelatedCalcs.js';
import { InfoTip } from './InfoTip.js';

function addMonths(dateString, months) {
    if (!dateString) return '';
    const [year, month, day] = String(dateString).split('-').map(Number);
    const total = year * 12 + (month - 1) + Number(months);
    const y = Math.floor(total / 12), m = (total % 12) + 1;
    // Clamp to month-end (Jan 31 + 1mo → Feb 28/29, never Feb 31).
    const lastDay = new Date(y, m, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');
    return `${y}-${pad(m)}-${pad(Math.min(day, lastDay))}`;
}

export function TermDeposits({ settings }) {
    const [td, setTd] = useState(()=> loadLedgers()['term-deposits']);
    const [entries, setEntries] = useState(()=> loadLedgers()['term-deposits'].entries);
    const [apy, setApy] = useState(()=> loadLedgers()['term-deposits'].apy);
    const [result, setResult] = useState(()=> loadLedgers().results['term-deposits']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(()=> {
        const l=loadLedgers(); setEntries(l['term-deposits'].entries); setApy(l['term-deposits'].apy); setResult(l.results['term-deposits']);
        const shared = readSharedState();
        if (shared) onCalc(shared.entries, shared.apy);
    }, []);

    function upd(idx, f, v){
        const next = entries.map((e,i)=> i===idx ? {...e,[f]:v}:e);
        // Port of AssetCalculator.onTermDepositFieldInput: derive maturity
        // from start + term — but only into an EMPTY field, never over a
        // hand-entered date (clear the field to re-derive).
        const row = next[idx] || {};
        if (!row.maturity_date) {
            const base = f === 'date' ? v : row.date;
            if (base) next[idx] = { ...row, maturity_date: addMonths(base, Number(row.term_months) || 12) };
        }
        setEntries(next);
        saveEntries('term-deposits', next, Number(apy));
    }
    function setApySave(v){
        setApy(v);
        saveEntries('term-deposits', entries, Number(v));
    }
    function addRow(){
        const next = [...entries, { date:new Date().toISOString().slice(0,10), installment_amount:1000, current_value:1000, term_months:12, maturity_date:'' }];
        setEntries(next);
        saveEntries('term-deposits', next, Number(apy));
    }
    function rm(idx){
        const next = entries.filter((_,i)=>i!==idx);
        setEntries(next);
        saveEntries('term-deposits', next, Number(apy));
    }
    function loadSample(){
        const next = SAMPLE_TD.entries.map(e => ({ ...e }));
        setEntries(next);
        setApy(SAMPLE_TD.apy);
        saveEntries('term-deposits', next, SAMPLE_TD.apy);
    }
    // Persist imports immediately (navigating away must not lose them)
    // and invalidate the calculated snapshot so the dashboard flags edits.
    // JSON snapshots may carry apy alongside entries — honor it.
    function importRows(rows, apyOverride) {
        const rate = Number.isFinite(Number(apyOverride)) ? Number(apyOverride) : Number(apy);
        setEntries(rows);
        setApy(rate);
        saveEntries('term-deposits', rows, rate);
        const ledgers = loadLedgers();
        ledgers.results['term-deposits'] = null;
        saveLedgers(ledgers);
    }

    async function onCalc(rowsOverride, apyOverride){
        const rows = rowsOverride || entries;
        const rate = apyOverride ?? apy;
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
            const payload = normalizeLedgerEntries('term-deposits', rows, rate);
            const data = await calculateReturns('term-deposits', payload);
            data.calculatedAt = new Date().toISOString();
            data.calcSnapshot = calcSnapshot('term-deposits', rows, rate);
            setResult(data);
            const l=loadLedgers(); l['term-deposits']={apy:Number(rate), entries:rows}; l.results['term-deposits']=data; saveLedgers(l);
            if (rowsOverride) setEntries(rowsOverride);
            if (apyOverride !== undefined) setApy(apyOverride);
            requestAnimationFrame(() => document.querySelector('[data-results]')?.scrollIntoView());
        }catch(e){ setError(e.detail ? JSON.stringify(e.detail) : e.message); } finally{ setLoading(false); }
    }

    const locale = settings.locale;
    return html`<div>
        <${Crumbs} locale=${locale} currentKey="nav.termDeposits" />
        <div class="page-head"><h1>${t(locale, 'nav.termDeposits')}</h1><p class="muted">${t(locale, 'calc.tdSubtitle')} <${InfoTip} locale=${locale} tipKey="glossary.apy" /> <${InfoTip} locale=${locale} tipKey="glossary.depositMaturity" /></p></div>
        <${HowTo} locale=${locale} startOpen=${!result} steps=${[t(locale,'howto.td1'), t(locale,'howto.td2'), t(locale,'howto.td3')]} />
        <div class="card">
            <label>${t(locale, 'form.apy')} (${t(locale, 'calc.apyHint')}) <${InfoTip} locale=${locale} tipKey="glossary.apy" /> <input type="number" step="0.001" value=${apy} onInput=${e=>setApySave(e.target.value)} /></label>
            <p class="muted" style="font-size:12px; margin:6px 0 0">${t(locale, 'calc.apyAppliesAll')}</p>
        </div>
        <div class="card">
            ${entries.map((e,idx)=> html`<div class="entry-grid" style="--cols:5">
                <label>${t(locale, 'form.date')} <input type="date" value=${e.date} onInput=${ev=>upd(idx,'date',ev.target.value)} /></label>
                <label>${t(locale, 'form.installmentAmount')} <input type="number" value=${e.installment_amount} onInput=${ev=>upd(idx,'installment_amount',ev.target.value)} /></label>
                <label>${t(locale, 'form.currentValue')} <input type="number" value=${e.current_value} onInput=${ev=>upd(idx,'current_value',ev.target.value)} /></label>
                <label>${t(locale, 'form.termMonths')} <${InfoTip} locale=${locale} tipKey="glossary.termMonths" /> <input type="number" value=${e.term_months} onInput=${ev=>upd(idx,'term_months',ev.target.value)} /></label>
                <label>${t(locale, 'form.maturityDate')} <${InfoTip} locale=${locale} tipKey="glossary.maturityDate" /> <input type="date" value=${e.maturity_date||''} placeholder=${t(locale, 'form.maturityAuto')} onInput=${ev=>upd(idx,'maturity_date',ev.target.value)} /></label>
                <button class="btn-ghost btn-sm entry-remove" onClick=${()=>rm(idx)}>${t(locale, 'common.remove')}</button>
            </div>`)}
            <button class="btn-ghost" onClick=${addRow}>${t(locale, 'common.addRow')}</button>
            ${!entries.length && html`<button class="btn-ghost" style="margin-left:8px" onClick=${loadSample}>${t(locale, 'overview.loadDemo')}</button>`}
            <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap">
                <button onClick=${()=>onCalc()} disabled=${loading}>${loading ? t(locale, 'common.calculating') : t(locale, 'common.calculateReturns')}</button>
                <${ShareLink} route="term-deposits" state=${{ entries, apy: Number(apy) || 0 }} locale=${locale} />
            </div>
            ${error && html`<p style="color:var(--danger)" role="alert">${error}</p>`}
        </div>
        <${LedgerIo} asset="term-deposits" entries=${entries} locale=${locale} onImport=${importRows} />
        ${result && html`<div data-results class="results-anchor">
            <${MomentumKpi} ledger=${result.ledger} summary=${result.summary} asset="term-deposits" settings=${settings} />
            <${AssetChart} ledger=${result.ledger} asset="term-deposits" settings=${settings} />
            <${MaturityPanel} summary=${result.summary} ledger=${result.ledger} settings=${settings} />
            <${SummaryCards} summary=${result.summary} settings=${settings} />
            <${LedgerTable} rows=${result.ledger} settings=${settings} columns=${[
                {key:'date', label:t(locale, 'column.date')},
                {key:'installment_amount', label:t(locale, 'column.installment'), fmt:'currency'},
                {key:'current_value', label:t(locale, 'column.currentValue'), fmt:'currency'},
                {key:'maturity_date', label:t(locale, 'depositMaturity.maturityDate')},
                {key:'days_to_maturity', label:t(locale, 'depositMaturity.daysToMaturity')},
                {key:'maturity_status', label:t(locale, 'depositMaturity.status')},
                {key:'maturity_value', label:t(locale, 'depositMaturity.maturityValue'), fmt:'currency'},
                {key:'accrued_interest', label:t(locale, 'depositMaturity.accruedInterest'), fmt:'currency'},
            ]} />
        </div>`}
        <${RelatedCalcs} current="term-deposits" settings=${settings} />
    </div>`;
}
