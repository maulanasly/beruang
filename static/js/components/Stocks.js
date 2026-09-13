import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { loadLedgers, saveLedgers } from '../store.js';
import { calculateReturns, fetchQuote, searchIdx, fetchKompas100 } from '../api.js';
import { formatCurrency, formatPercent, displaySymbol } from '../utils.js';
import { LedgerTable, SummaryCards } from './AssetForm.js';
import { DividendFocus } from './DividendFocus.js';
import { PriceHistory } from './PriceHistory.js';
import { LedgerIo } from './LedgerIo.js';
import { MomentumKpi } from './MomentumKpi.js';
import { AssetChart } from './AssetChart.js';
import { InfoTip } from './InfoTip.js';
import { t } from '../i18n.js';

let searchTimer = null;

export function Stocks({ settings }) {
    const locale = settings.locale;
    const show = (sym) => displaySymbol(sym, settings.market);
    const [entries, setEntries] = useState(()=> loadLedgers().stocks);
    const [result, setResult] = useState(()=> loadLedgers().results.stocks);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [quoteSym, setQuoteSym] = useState('BBCA.JK');
    const [lastQuote, setLastQuote] = useState(null);
    const [quoteLoading, setQuoteLoading] = useState(false);
    const [quoteStatus, setQuoteStatus] = useState('');
    const [targetRow, setTargetRow] = useState(null); // null = last row
    const [suggestions, setSuggestions] = useState([]);
    const [showSugg, setShowSugg] = useState(false);
    const [searching, setSearching] = useState(false);
    const [universe, setUniverse] = useState([]);
    const [universeLoading, setUniverseLoading] = useState(false);
    const [universeError, setUniverseError] = useState('');
    const [syncing, setSyncing] = useState(false);
    const [syncMsg, setSyncMsg] = useState('');

    useEffect(()=> {
        const l=loadLedgers(); setEntries(l.stocks); setResult(l.results.stocks);
        loadUniverse();
        return () => clearTimeout(searchTimer);
    }, []);

    async function loadUniverse() {
        setUniverseLoading(true); setUniverseError('');
        try {
            const r = await fetchKompas100();
            setUniverse(r.items || []);
        } catch (e) { setUniverseError(e.message); }
        finally { setUniverseLoading(false); }
    }

    function onSymbolInput(value) {
        setQuoteSym(value);
        setShowSugg(true);
        clearTimeout(searchTimer);
        if (!value.trim()) { setSuggestions([]); setSearching(false); return; }
        setSearching(true);
        searchTimer = setTimeout(async () => {
            try {
                const r = await searchIdx(value);
                setSuggestions(r.items || []);
            } catch { setSuggestions([]); }
            finally { setSearching(false); }
        }, 300);
    }

    function pickSuggestion(item) {
        setQuoteSym(item.symbol);
        setSuggestions([]);
        setShowSugg(false);
    }

    function targetIndex() {
        if (targetRow == null || targetRow >= entries.length) return entries.length - 1;
        return targetRow;
    }

    async function doQuote() {
        if (!quoteSym.trim()) { setQuoteStatus(t(locale, 'market.chooseStockCode')); return; }
        setQuoteLoading(true); setQuoteStatus('');
        try {
            const q = await fetchQuote(quoteSym.trim());
            setLastQuote(q);
        } catch (e) { setQuoteStatus(e.message); }
        finally { setQuoteLoading(false); }
    }

    // Port of AssetCalculator.applyQuoteToRow: fetch latest quote and write
    // price + symbol + yield into the target ledger row.
    async function applyLatest() {
        if (!quoteSym.trim()) { setQuoteStatus(t(locale, 'market.chooseStockCode')); return; }
        const idx = entries.length ? targetIndex() : -1;
        if (idx < 0) { setQuoteStatus(t(locale, 'market.syncNoSymbols')); return; }
        setQuoteLoading(true); setQuoteStatus('');
        try {
            const q = await fetchQuote(quoteSym.trim());
            setLastQuote(q);
            setEntries(entries.map((e, i) => i === idx ? {
                ...e,
                symbol: q.symbol,
                current_value: String(q.price),
                dividend_yield: q.dividend_yield != null ? (q.dividend_yield * 100).toFixed(2) : e.dividend_yield,
            } : e));
            setQuoteStatus(t(locale, 'market.updatedRow', { row: idx + 1, symbol: q.symbol, currency: q.currency }));
        } catch (e) { setQuoteStatus(e.message); }
        finally { setQuoteLoading(false); }
    }

    function upd(idx, field, val){ setEntries(entries.map((e,i)=> i===idx ? {...e,[field]:val}:e)); }
    function addRow(){ setEntries([...entries, { symbol:'BBCA.JK', date:new Date().toISOString().slice(0,10), installment_amount:700, new_share_purchases:200, dividends:0, dividend_yield:null, current_value:1000 }]); }
    function rm(idx){ setEntries(entries.filter((_,i)=>i!==idx)); }

    async function onCalc(){
        setLoading(true); setError('');
        if (!entries.length) {
            setLoading(false);
            setError(t(locale, 'error.atLeastOneRow'));
            return;
        }
        if (entries.some((e) => !e.date)) {
            setLoading(false);
            setError(t(locale, 'error.everyRowDate'));
            return;
        }
        try{
            const payload = { entries: entries.map(e=>({ date:e.date, installment_amount:Number(e.installment_amount)||0, new_share_purchases:Number(e.new_share_purchases)||0, dividends:Number(e.dividends)||0, current_value:Number(e.current_value)||0, dividend_yield:e.dividend_yield?Number(e.dividend_yield)/100:null })) };
            const data = await calculateReturns('stocks', payload);
            setResult(data);
            const l=loadLedgers(); l.stocks=entries; l.results.stocks=data; saveLedgers(l);
        }catch(e){ setError(e.detail ? JSON.stringify(e.detail) : e.message); } finally{ setLoading(false); }
    }
    async function syncAll(){
        const symbols = [...new Set(entries.map(e=>e.symbol).filter(Boolean))];
        if(!symbols.length){ setSyncMsg(t(locale, 'market.syncNoSymbols')); return; }
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
        setSyncMsg(t(locale, 'market.syncSummary', { updated, failed }));
    }

    const symbols = [...new Set(entries.map(e => e.symbol).filter(s => typeof s === 'string' && s))];
    const resultSymbolLabel = symbols.length === 0 ? ''
        : symbols.length === 1 ? show(symbols[0])
        : t(locale, 'stock.codesCount', { count: symbols.length });

    return html`<div>
        <div class="page-head"><h1>${t(locale, 'nav.stocks')}</h1><p class="muted">MoM + ROI + XIRR · optional dividend yield (%). <${InfoTip} locale=${locale} tipKey="glossary.dividendYield" /></p></div>
        <div class="card">
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
                <strong style="font-size:14px">${t(locale, 'market.liveIdxPrice')}</strong>
                <span style="flex:1"></span>
                <button class="btn-ghost btn-sm" onClick=${loadUniverse} disabled=${universeLoading}>${universeLoading ? t(locale, 'market.refreshing') : t(locale, 'market.refresh')}</button>
            </div>
            <p class="muted" style="font-size:12px">${t(locale, 'market.helperNote')}</p>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; align-items:end">
                <div style="position:relative">
                    <label>${t(locale, 'form.stockCode')}
                        <input value=${quoteSym}
                            onInput=${e=>onSymbolInput(e.target.value)}
                            onFocus=${()=>setShowSugg(true)}
                            onBlur=${()=>setTimeout(()=>setShowSugg(false), 120)}
                            placeholder=${t(locale, 'market.searchPlaceholder')}
                            autocomplete="off" style="width:100%" />
                    </label>
                    ${showSugg && suggestions.length > 0 && html`<ul style="position:absolute; z-index:10; left:0; right:0; margin:2px 0 0; padding:0; list-style:none; background:var(--surface, #fff); border:1px solid var(--hairline, #ddd); border-radius:8px; max-height:180px; overflow:auto">
                        ${suggestions.map(s => html`<li style="padding:6px 10px; cursor:pointer; font-size:13px" onMouseDown=${e=>{e.preventDefault(); pickSuggestion(s);}}>
                            <span style="font-family:monospace; font-weight:600">${show(s.symbol)}</span>
                            <span class="muted"> ${s.name}</span>
                        </li>`)}
                    </ul>`}
                    ${searching && html`<p class="muted" style="font-size:12px; margin:2px 0 0">${t(locale, 'market.searching')}</p>`}
                </div>
                <label>${t(locale, 'market.targetLedgerRow')}
                    <select value=${targetIndex()} onChange=${e=>setTargetRow(Number(e.target.value))} style="width:100%">
                        ${entries.map((e, i) => html`<option value=${i}>${t(locale, 'market.row')} ${i + 1}${e.date ? ` (${e.date})` : ''}</option>`)}
                    </select>
                </label>
            </div>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px">
                <button class="btn-ghost btn-sm" onClick=${doQuote} disabled=${quoteLoading || !quoteSym.trim()}>${quoteLoading ? t(locale, 'market.fetchingQuote') : 'Fetch Quote'}</button>
                <button class="btn-ghost btn-sm" onClick=${applyLatest} disabled=${quoteLoading || !quoteSym.trim()}>${t(locale, 'market.applyLatestPrice')}</button>
                <button class="btn-ghost btn-sm" onClick=${syncAll} disabled=${syncing}>${syncing ? t(locale, 'market.syncingPrices') : t(locale, 'market.syncAllPrices')}</button>
                ${lastQuote && html`<span class="muted" style="font-size:13px">${t(locale, 'market.lastFetched')}: <strong>${formatCurrency(lastQuote.price, locale, lastQuote.currency)}</strong> ${show(lastQuote.symbol)}${typeof lastQuote.dividend_yield === 'number' ? ` · ${t(locale, 'market.dividendYield')} ${formatPercent(lastQuote.dividend_yield, locale)}` : ''}</span>`}
            </div>
            ${universeError && html`<p style="color:var(--danger); font-size:13px">${universeError}</p>`}
            ${quoteStatus && html`<p class="muted" style="font-size:13px">${quoteStatus}</p>`}
            ${syncMsg && html`<p class="muted" style="font-size:13px">${syncMsg}</p>`}
            ${universe.length>0 && html`<label style="display:block; margin-top:8px">${t(locale, 'market.pickTicker')}
                <select onChange=${e=>{ if(e.target.value) { setQuoteSym(e.target.value); setShowSugg(false); } }} style="width:100%">
                    <option value="">${t(locale, 'market.pickTicker')}</option>
                    ${universe.map(s=> html`<option value=${s.symbol}>${show(s.symbol)} — ${s.name}</option>`)}
                </select>
            </label>`}
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
                ${lastQuote && html`<button class="btn-ghost btn-sm" onClick=${()=>upd(idx,'current_value', String(lastQuote.price))}>Apply ${lastQuote.price}</button>`}
            </div>`)}
            <button class="btn-ghost" onClick=${addRow}>${t(locale, 'common.addRow')}</button>
            <div style="margin-top:12px"><button onClick=${onCalc} disabled=${loading}>${loading ? t(locale, 'common.calculating') : t(locale, 'common.calculateReturns')}</button></div>
            ${error && html`<p style="color:var(--danger)">${error}</p>`}
        </div>
        <${LedgerIo} asset="stocks" entries=${entries} locale=${locale} onImport=${(rows) => setEntries(rows)} />
        ${result && html`<div>
            <${MomentumKpi} ledger=${result.ledger} summary=${result.summary} asset="stocks" settings=${settings} />
            <${AssetChart} ledger=${result.ledger} asset="stocks" settings=${settings} />
            <div class="card"><div class="smallcaps">${t(locale, 'common.summary')}${resultSymbolLabel ? html`<span class="muted"> · ${resultSymbolLabel}</span>` : ''}</div></div>
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
            const idx = targetIndex();
            if (idx >= 0) setEntries(entries.map((e, i) => i === idx ? { ...e, symbol, dividend_yield: yieldPct } : e));
            setQuoteSym(symbol);
        }} />
        <${PriceHistory} symbol=${quoteSym} />
    </div>`;
}
