import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { loadLedgers, saveLedgers, saveEntries, SAMPLE_STOCKS } from '../store.js';
import { calculateReturns, fetchQuote, searchIdx } from '../api.js';
import { formatCurrency, formatPercent, displaySymbol } from '../utils.js';
import { LedgerTable, SummaryCards } from './AssetForm.js';
import { DividendFocus } from './DividendFocus.js';
import { PriceHistory } from './PriceHistory.js';
import { LedgerIo } from './LedgerIo.js';
import { MomentumKpi } from './MomentumKpi.js';
import { AssetChart } from './AssetChart.js';
import { HowTo } from './HowTo.js';
import { Crumbs } from './Crumbs.js';
import { RelatedCalcs } from './RelatedCalcs.js';
import { InfoTip } from './InfoTip.js';
import { t } from '../i18n.js';
import { readSharedState, ShareLink, normalizeLedgerEntries, calcSnapshot } from '../share.js';

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
    // Progressive disclosure: market tools stay open until the first
    // calculation, then collapse; the user owns the toggle afterwards.
    const [toolsOpen, setToolsOpen] = useState(() => !loadLedgers().results.stocks);
    const [syncing, setSyncing] = useState(false);
    const [syncMsg, setSyncMsg] = useState('');

    useEffect(()=> {
        const l=loadLedgers(); setEntries(l.stocks); setResult(l.results.stocks);
        const shared = readSharedState();
        if (shared) onCalc(shared.entries);
        return () => clearTimeout(searchTimer);
    }, []);

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
            const next = entries.map((e, i) => i === idx ? {
                ...e,
                symbol: q.symbol,
                current_value: String(q.price),
                dividend_yield: q.dividend_yield != null ? (q.dividend_yield * 100).toFixed(2) : e.dividend_yield,
            } : e);
            setEntries(next);
            saveEntries('stocks', next);
            setQuoteStatus(t(locale, 'market.updatedRow', { row: idx + 1, symbol: q.symbol, currency: q.currency }));
        } catch (e) { setQuoteStatus(e.message); }
        finally { setQuoteLoading(false); }
    }

    function upd(idx, field, val){
        const next = entries.map((e,i)=> i===idx ? {...e,[field]:val}:e);
        setEntries(next);
        saveEntries('stocks', next);
    }
    function addRow(){
        const next = [...entries, { symbol:'BBCA.JK', date:new Date().toISOString().slice(0,10), installment_amount:700, new_share_purchases:200, dividends:0, dividend_yield:null, current_value:1000 }];
        setEntries(next);
        saveEntries('stocks', next);
    }
    function rm(idx){
        const next = entries.filter((_,i)=>i!==idx);
        setEntries(next);
        saveEntries('stocks', next);
    }
    function loadSample(){
        const next = SAMPLE_STOCKS.map(e => ({ ...e }));
        setEntries(next);
        saveEntries('stocks', next);
    }
    // Persist imports immediately (navigating away must not lose them)
    // and invalidate the calculated snapshot so the dashboard flags edits.
    function importRows(rows) {
        setEntries(rows);
        saveEntries('stocks', rows);
        const ledgers = loadLedgers();
        ledgers.results.stocks = null;
        saveLedgers(ledgers);
    }
    function applyDividendFocus(symbol, yieldPct) {
        const idx = targetIndex();
        if (idx >= 0) {
            const next = entries.map((e, i) => i === idx ? { ...e, symbol, dividend_yield: yieldPct } : e);
            setEntries(next);
            saveEntries('stocks', next);
        }
        setQuoteSym(symbol);
    }

    async function onCalc(rowsOverride){
        const rows = rowsOverride || entries;
        setLoading(true); setError('');
        if (!rows.length) {
            setLoading(false);
            setError(t(locale, 'error.atLeastOneRow'));
            return;
        }
        if (rows.some((e) => !e.date)) {
            setLoading(false);
            setError(t(locale, 'error.everyRowDate'));
            return;
        }
        try{
            const payload = { entries: normalizeLedgerEntries('stocks', rows) };
            const data = await calculateReturns('stocks', payload);
            data.calculatedAt = new Date().toISOString();
            data.calcSnapshot = calcSnapshot('stocks', rows);
            setResult(data);
            const l=loadLedgers(); l.stocks=rows; l.results.stocks=data; saveLedgers(l);
            if (rowsOverride) setEntries(rowsOverride);
            requestAnimationFrame(() => document.querySelector('[data-results]')?.scrollIntoView());
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
        saveEntries('stocks', next);
        setSyncing(false);
        setSyncMsg(t(locale, 'market.syncSummary', { updated, failed }));
    }

    const symbols = [...new Set(entries.map(e => e.symbol).filter(s => typeof s === 'string' && s))];
    const resultSymbolLabel = symbols.length === 0 ? ''
        : symbols.length === 1 ? show(symbols[0])
        : t(locale, 'stock.codesCount', { count: symbols.length });

    return html`<div>
        <${Crumbs} locale=${locale} currentKey="nav.stocks" />
        <div class="page-head"><h1>${t(locale, 'nav.stocks')}</h1><p class="muted">${t(locale, 'calc.stSubtitle')} <${InfoTip} locale=${locale} tipKey="glossary.dividendYield" /></p></div>
        <${HowTo} locale=${locale} startOpen=${!result} steps=${[t(locale,'howto.st1'), t(locale,'howto.st2'), t(locale,'howto.st3')]} />
        <details class="card market-tools" open=${toolsOpen || null} onToggle=${e => setToolsOpen(e.target.open)}>
            <summary>${t(locale, 'market.liveIdxPrice')}</summary>
            <p class="muted" style="font-size:12px">${t(locale, 'market.helperNote')}</p>
            <div class="entry-grid" style="--cols:2">
                <div style="position:relative">
                    <label>${t(locale, 'form.stockCode')}
                        <input value=${quoteSym}
                            onInput=${e=>onSymbolInput(e.target.value)}
                            onFocus=${()=>setShowSugg(true)}
                            onBlur=${()=>setTimeout(()=>setShowSugg(false), 120)}
                            placeholder=${t(locale, 'market.searchPlaceholder')}
                            autocomplete="off" style="width:100%" />
                    </label>
                    ${showSugg && suggestions.length > 0 && html`<ul class="suggest-list">
                        ${suggestions.map(s => html`<li onMouseDown=${e=>{e.preventDefault(); pickSuggestion(s);}}>
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
                <button class="btn-ghost btn-sm" onClick=${doQuote} disabled=${quoteLoading || !quoteSym.trim()}>${quoteLoading ? t(locale, 'market.fetchingQuote') : t(locale, 'ui.fetchQuote')}</button>
                <button class="btn-ghost btn-sm" onClick=${applyLatest} disabled=${quoteLoading || !quoteSym.trim()}>${t(locale, 'market.applyLatestPrice')}</button>
                <button class="btn-ghost btn-sm" onClick=${syncAll} disabled=${syncing}>${syncing ? t(locale, 'market.syncingPrices') : t(locale, 'market.syncAllPrices')}</button>
                ${lastQuote && html`<span class="muted" style="font-size:13px">${t(locale, 'market.lastFetched')}: <strong>${formatCurrency(lastQuote.price, locale, lastQuote.currency)}</strong> ${show(lastQuote.symbol)}${typeof lastQuote.dividend_yield === 'number' ? ` · ${t(locale, 'market.dividendYield')} ${formatPercent(lastQuote.dividend_yield, locale)}` : ''}</span>`}
            </div>
            ${quoteStatus && html`<p class="muted" style="font-size:13px">${quoteStatus}</p>`}
            ${syncMsg && html`<p class="muted" style="font-size:13px">${syncMsg}</p>`}
        </details>
        <div class="card">
            ${entries.map((e,idx)=> html`<div>
                <div class="entry-grid" style="--cols:6">
                    <label>${t(locale, 'form.stockCode')} <input value=${e.symbol||''} onInput=${ev=>upd(idx,'symbol',ev.target.value)} placeholder="BBCA.JK" /></label>
                    <label>${t(locale, 'form.date')} <input type="date" value=${e.date} onInput=${ev=>upd(idx,'date',ev.target.value)} /></label>
                    <label>${t(locale, 'form.installmentAmount')} <input type="number" value=${e.installment_amount} onInput=${ev=>upd(idx,'installment_amount',ev.target.value)} /></label>
                    <label>${t(locale, 'form.newSharePurchases')} <input type="number" value=${e.new_share_purchases} onInput=${ev=>upd(idx,'new_share_purchases',ev.target.value)} /></label>
                    <label>${t(locale, 'form.dividends')} <input type="number" value=${e.dividends} onInput=${ev=>upd(idx,'dividends',ev.target.value)} /></label>
                    <label>${t(locale, 'column.dividendYield')} <input type="number" step="0.01" value=${e.dividend_yield??''} onInput=${ev=>upd(idx,'dividend_yield',ev.target.value?ev.target.value:null)} /></label>
                    <button class="btn-ghost btn-sm entry-remove" onClick=${()=>rm(idx)}>${t(locale, 'common.remove')}</button>
                </div>
                <div class="entry-grid" style="--cols:1">
                    <label>${t(locale, 'form.currentValue')} <input type="number" value=${e.current_value} onInput=${ev=>upd(idx,'current_value',ev.target.value)} /></label>
                </div>
            </div>`)}
            <button class="btn-ghost" onClick=${addRow}>${t(locale, 'common.addRow')}</button>
            ${!entries.length && html`<button class="btn-ghost" style="margin-left:8px" onClick=${loadSample}>${t(locale, 'overview.loadDemo')}</button>`}
            <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap">
                <button onClick=${()=>onCalc()} disabled=${loading}>${loading ? t(locale, 'common.calculating') : t(locale, 'common.calculateReturns')}</button>
                <${ShareLink} route="stocks" state=${{ entries }} locale=${locale} />
            </div>
            ${error && html`<p style="color:var(--danger)" role="alert">${error}</p>`}
        </div>
        <${LedgerIo} asset="stocks" entries=${entries} locale=${locale} onImport=${importRows} />
        ${result && html`<div data-results class="results-anchor">
            <${MomentumKpi} ledger=${result.ledger} summary=${result.summary} asset="stocks" settings=${settings} />
            <${AssetChart} ledger=${result.ledger} asset="stocks" settings=${settings} />
            <div class="card"><div class="smallcaps">${t(locale, 'common.summary')}${resultSymbolLabel ? html`<span class="muted"> · ${resultSymbolLabel}</span>` : ''}</div></div>
            <${SummaryCards} summary=${result.summary} settings=${settings} />
            <${LedgerTable} rows=${result.ledger} settings=${settings} columns=${[
                {key:'date', label:t(locale, 'column.date')},
                {key:'installment_amount', label:t(locale, 'column.installment'), fmt:'currency'},
                {key:'new_share_purchases', label:t(locale, 'column.newPurchases'), fmt:'currency'},
                {key:'dividends', label:t(locale, 'column.dividends'), fmt:'currency'},
                {key:'dividend_yield', label:t(locale, 'column.dividendYield'), fmt:'percent'},
                {key:'estimated_dividend', label:t(locale, 'column.estimatedDividend'), fmt:'currency'},
                {key:'current_value', label:t(locale, 'column.currentValue'), fmt:'currency'},
                {key:'mom_return', label:t(locale, 'column.momReturn'), fmt:'percent'},
            ]} />
        </div>`}
        <${DividendFocus} settings=${settings} onApply=${applyDividendFocus} />
        ${(result || lastQuote) && html`<${PriceHistory} symbol=${quoteSym} settings=${settings} />`}
        <${RelatedCalcs} current="stocks" settings=${settings} />
    </div>`;
}
