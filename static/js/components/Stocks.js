import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { loadLedgers, saveLedgers } from '../store.js';
import { calculateReturns, fetchQuote, searchIdx, fetchKompas100 } from '../api.js';
import { LedgerTable, SummaryCards } from './AssetForm.js';
import { DividendFocus } from './DividendFocus.js';
import { PriceHistory } from './PriceHistory.js';
import { LedgerIo } from './LedgerIo.js';
import { InfoTip } from './InfoTip.js';
import { t } from '../i18n.js';

export function Stocks({ settings }) {
    const [entries, setEntries] = useState(()=> loadLedgers().stocks);
    const [result, setResult] = useState(()=> loadLedgers().results.stocks);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [quoteSym, setQuoteSym] = useState('BBCA.JK');
    const [quote, setQuote] = useState(null);
    const [searchQ, setSearchQ] = useState('');
    const [searchRes, setSearchRes] = useState([]);
    const [universe, setUniverse] = useState([]);
    const [syncing, setSyncing] = useState(false);
    const [syncMsg, setSyncMsg] = useState('');

    useEffect(()=> {
        const l=loadLedgers(); setEntries(l.stocks); setResult(l.results.stocks);
        fetchKompas100().then(r=>setUniverse(r.items||[])).catch(()=>{});
    }, []);

    function upd(idx, field, val){ setEntries(entries.map((e,i)=> i===idx ? {...e,[field]:val}:e)); }
    function addRow(){ setEntries([...entries, { symbol:'BBCA.JK', date:new Date().toISOString().slice(0,10), installment_amount:700, new_share_purchases:200, dividends:0, dividend_yield:null, current_value:1000 }]); }
    function rm(idx){ setEntries(entries.filter((_,i)=>i!==idx)); }

    async function onCalc(){
        setLoading(true); setError('');
        try{
            const payload = { entries: entries.map(e=>({ date:e.date, installment_amount:Number(e.installment_amount)||0, new_share_purchases:Number(e.new_share_purchases)||0, dividends:Number(e.dividends)||0, current_value:Number(e.current_value)||0, dividend_yield:e.dividend_yield?Number(e.dividend_yield)/100:null })) };
            const data = await calculateReturns('stocks', payload);
            setResult(data);
            const l=loadLedgers(); l.stocks=entries; l.results.stocks=data; saveLedgers(l);
        }catch(e){ setError(e.detail ? JSON.stringify(e.detail) : e.message); } finally{ setLoading(false); }
    }
    async function doQuote(){
        try{ const q=await fetchQuote(quoteSym); setQuote(q); }catch(e){ setError(e.message); }
    }
    async function doSearch(){
        if(!searchQ.trim()) return;
        try{ const r=await searchIdx(searchQ); setSearchRes(r.items||[]); }catch(e){ setError(e.message); }
    }
    async function syncAll(){
        const symbols = [...new Set(entries.map(e=>e.symbol).filter(Boolean))];
        if(!symbols.length){ setSyncMsg('Add a stock code to at least one row before syncing.'); return; }
        setSyncing(true); setSyncMsg('');
        let updated = 0, failed = 0;
        const next = [...entries];
        for(const sym of symbols){
            try{
                const q = await fetchQuote(sym);
                next.forEach((e,i)=>{ if(e.symbol===sym) next[i] = {...e, current_value: String(q.price), dividend_yield: q.dividend_yield!=null ? (q.dividend_yield*100).toFixed(2) : e.dividend_yield}; });
                updated++;
            }catch{ failed++; }
        }
        setEntries(next);
        setSyncing(false);
        setSyncMsg(`Updated prices for ${updated} stock(s), ${failed} failed.`);
    }

    const locale = settings.locale;
    return html`<div>
        <div class="page-head"><h1>${t(locale, 'nav.stocks')}</h1><p class="muted">MoM + ROI + XIRR · optional dividend yield (%). <${InfoTip} locale=${locale} tipKey="glossary.dividendYield" /></p></div>
        <div class="card" style="display:flex; gap:8px; flex-wrap:wrap; align-items:end">
            <label>Quote <input value=${quoteSym} onInput=${e=>setQuoteSym(e.target.value)} placeholder="BBCA.JK" style="width:140px" /></label>
            <button class="btn-ghost" onClick=${doQuote}>Fetch Quote</button>
            ${quote && html`<span class="muted" style="font-size:13px">${quote.symbol} ${quote.price} ${quote.currency} ${quote.dividend_yield!=null ? `yield ${(quote.dividend_yield*100).toFixed(2)}%`:''}</span>`}
            <label>Search IDX <input value=${searchQ} onInput=${e=>setSearchQ(e.target.value)} placeholder="bank" style="width:140px" /></label>
            <button class="btn-ghost" onClick=${doSearch}>Search</button>
            <button class="btn-ghost" onClick=${syncAll} disabled=${syncing}>${syncing?'Syncing…':'Sync All Prices'}</button>
            ${syncMsg && html`<span class="muted" style="font-size:13px">${syncMsg}</span>`}
            ${universe.length>0 && html`<label style="width:100%">Kompas 100 Starter <select onChange=${e=>{ if(e.target.value) setQuoteSym(e.target.value); }}>
                <option value="">Select a ticker</option>
                ${universe.map(s=> html`<option value=${s.symbol}>${s.symbol} — ${s.name}</option>`)}
            </select></label>`}
            ${searchRes.length>0 && html`<div style="width:100%">${searchRes.map(s=> html`<span style="margin-right:8px"><a href="#" onClick=${e=>{e.preventDefault(); setQuoteSym(s.symbol);}}>${s.symbol}</a> ${s.name}</span>`)}</div>`}
        </div>
        <div class="card">
            ${entries.map((e,idx)=> html`<div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr 1fr 1fr auto; gap:8px; margin-bottom:8px; align-items:end">
                <label>Symbol <input value=${e.symbol||''} onInput=${ev=>upd(idx,'symbol',ev.target.value)} placeholder="BBCA.JK" /></label>
                <label>Date <input type="date" value=${e.date} onInput=${ev=>upd(idx,'date',ev.target.value)} /></label>
                <label>Installment <input type="number" value=${e.installment_amount} onInput=${ev=>upd(idx,'installment_amount',ev.target.value)} /></label>
                <label>New Purchases <input type="number" value=${e.new_share_purchases} onInput=${ev=>upd(idx,'new_share_purchases',ev.target.value)} /></label>
                <label>Dividends <input type="number" value=${e.dividends} onInput=${ev=>upd(idx,'dividends',ev.target.value)} /></label>
                <label>Yield % <input type="number" step="0.01" value=${e.dividend_yield??''} onInput=${ev=>upd(idx,'dividend_yield',ev.target.value?ev.target.value:null)} /></label>
                <button class="btn-ghost btn-sm" onClick=${()=>rm(idx)}>Remove</button>
            </div>
            <div style="display:grid; grid-template-columns:1fr auto; gap:8px; margin-bottom:8px">
                <label>Current Value <input type="number" value=${e.current_value} onInput=${ev=>upd(idx,'current_value',ev.target.value)} /></label>
                ${quote && html`<button class="btn-ghost btn-sm" onClick=${()=>upd(idx,'current_value', String(quote.price))}>Apply ${quote.price}</button>`}
            </div>`)}
            <button class="btn-ghost" onClick=${addRow}>${t(locale, 'common.addRow')}</button>
            <div style="margin-top:12px"><button onClick=${onCalc} disabled=${loading}>${loading ? t(locale, 'common.calculating') : t(locale, 'common.calculateReturns')}</button></div>
            ${error && html`<p style="color:var(--danger)">${error}</p>`}
        </div>
        <${LedgerIo} asset="stocks" entries=${entries} locale=${locale} onImport=${(rows) => setEntries(rows)} />
        ${result && html`<div>
            <${SummaryCards} summary=${result.summary} settings=${settings} />
            <${LedgerTable} rows=${result.ledger} settings=${settings} columns=${[
                {key:'date', label:'Date'},
                {key:'installment_amount', label:'Installment', fmt:'currency'},
                {key:'new_share_purchases', label:'New Purchases', fmt:'currency'},
                {key:'dividends', label:'Dividends', fmt:'currency'},
                {key:'dividend_yield', label:'Yield', fmt:'percent'},
                {key:'estimated_dividend', label:'Est Div', fmt:'currency'},
                {key:'current_value', label:'Value', fmt:'currency'},
                {key:'mom_return', label:'MoM', fmt:'percent'},
            ]} />
        </div>`}
        <${DividendFocus} settings=${settings} onApply=${(symbol, yieldPct) => {
            setQuoteSym(symbol);
            if (entries.length) {
                const idx = entries.length - 1;
                setEntries(entries.map((e, i) => i === idx ? { ...e, symbol, dividend_yield: yieldPct } : e));
            }
        }} />
        <${PriceHistory} symbol=${quoteSym} />
    </div>`;
}
