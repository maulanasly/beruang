import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { loadLedgers } from '../store.js';
import { formatCurrency, formatPercent } from '../utils.js';

export function Overview({ settings }) {
    const [ledgers, setLedgers] = useState(loadLedgers());
    useEffect(() => {
        const h = () => setLedgers(loadLedgers());
        window.addEventListener('storage', h);
        window.addEventListener('hashchange', h);
        const id = setInterval(h, 1000);
        return () => { window.removeEventListener('storage', h); clearInterval(id); };
    }, []);

    const mfEntries = ledgers['mutual-funds'] || [];
    const stEntries = ledgers.stocks || [];
    const tdEntries = ledgers['term-deposits']?.entries || [];
    const mfVal = mfEntries.length ? Number(mfEntries[mfEntries.length-1].current_value)||0 : 0;
    const stVal = stEntries.length ? Number(stEntries[stEntries.length-1].current_value)||0 : 0;
    const tdVal = tdEntries.length ? Number(tdEntries[tdEntries.length-1].current_value)||0 : 0;
    const total = mfVal + stVal + tdVal;
    const mfInv = mfEntries.reduce((s,e)=> s+(Number(e.installment_amount)||0),0);
    const stInv = stEntries.reduce((s,e)=> s+(Number(e.installment_amount)||0)+(Number(e.new_share_purchases)||0),0);
    const tdInv = tdEntries.reduce((s,e)=> s+(Number(e.installment_amount)||0),0);
    const totalInv = mfInv + stInv + tdInv;
    const pnl = total - totalInv;

    const hasData = total>0 || totalInv>0;
    if (!hasData) {
        return html`<div class="card">
            <h2>Overview</h2>
            <p class="muted">Add entries on asset pages and Calculate Returns to populate this overview.</p>
            <p><a href="#/mutual-funds">Mutual Funds</a> · <a href="#/stocks">Stocks</a> · <a href="#/term-deposits">Term Deposits</a></p>
        </div>`;
    }

    return html`<div>
        <div class="card">
            <h2>Portfolio</h2>
            <p class="muted">Your portfolio at a glance.</p>
            <div class="summary-cards">
                <div class="card"><div class="smallcaps">Invested</div><div class="amount">${formatCurrency(totalInv, settings.locale, settings.currency)}</div></div>
                <div class="card"><div class="smallcaps">Current Value</div><div class="amount">${formatCurrency(total, settings.locale, settings.currency)}</div></div>
                <div class="card"><div class="smallcaps">P/L</div><div class="amount" style="color:${pnl>=0?'var(--success)':'var(--danger)'}">${formatCurrency(pnl, settings.locale, settings.currency)} <span style="font-size:12px">(${totalInv?formatPercent(pnl/totalInv, settings.locale):'-'})</span></div></div>
            </div>
        </div>
        <div class="summary-cards">
            <div class="card"><div class="smallcaps">Mutual Funds</div><div class="amount">${formatCurrency(mfVal, settings.locale, settings.currency)}</div><div class="muted" style="font-size:12px">Invested ${formatCurrency(mfInv, settings.locale, settings.currency)}</div></div>
            <div class="card"><div class="smallcaps">Stocks</div><div class="amount">${formatCurrency(stVal, settings.locale, settings.currency)}</div><div class="muted" style="font-size:12px">Invested ${formatCurrency(stInv, settings.locale, settings.currency)}</div></div>
            <div class="card"><div class="smallcaps">Term Deposits</div><div class="amount">${formatCurrency(tdVal, settings.locale, settings.currency)}</div><div class="muted" style="font-size:12px">Invested ${formatCurrency(tdInv, settings.locale, settings.currency)}</div></div>
        </div>
    </div>`;
}
