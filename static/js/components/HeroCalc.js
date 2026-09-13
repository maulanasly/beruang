import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { calculateReturns } from '../api.js';
import { formatPercent } from '../utils.js';
import { t } from '../i18n.js';
import { navigate } from '../router.js';
import { encodeShareState } from '../share.js';

function monthDate(base, back) {
    const d = new Date(base.getFullYear(), base.getMonth() - back, 28);
    return d.toISOString().slice(0, 10);
}

// Interactive hero demo: 3 inputs → real XIRR from the API → deep link
// carrying the same inputs into the full calculator.
export function HeroCalc({ settings }) {
    const locale = settings.locale;
    const [monthly, setMonthly] = useState('1000000');
    const [months, setMonths] = useState('12');
    const [finalValue, setFinalValue] = useState('13200000');
    const [xirr, setXirr] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Single-job hero: run once on mount so the demo result (and the
    // deep link carrying the same inputs) is visible without a first click.
    useEffect(() => { onCount(); }, []);

    function buildEntries() {
        const p = Number(monthly) || 0;
        const n = Math.max(2, Math.min(120, Math.floor(Number(months) || 0)));
        const v = Number(finalValue) || 0;
        const now = new Date();
        return Array.from({ length: n }, (_, i) => ({
            date: monthDate(now, n - 1 - i),
            installment_amount: p,
            current_value: i === n - 1 ? v : p * (i + 1),
        }));
    }

    async function onCount() {
        setLoading(true); setError(''); setXirr(null);
        try {
            const data = await calculateReturns('mutual-funds', { entries: buildEntries() });
            setXirr(data.summary.xirr);
        } catch (e) { setError(e.detail ? JSON.stringify(e.detail) : e.message); }
        finally { setLoading(false); }
    }

    function openFull(e) {
        e.preventDefault();
        const s = encodeShareState({ entries: buildEntries() });
        navigate(`/kalkulator/reksa-dana?s=${s}`);
    }

    return html`<div class="card hero-widget">
        <div class="smallcaps" style="margin-bottom:8px">${t(locale, 'home.heroWidgetTitle')}</div>
        <div class="entry-grid" style="--cols:3">
            <label>${t(locale, 'home.heroWidgetMonthly')} <input type="number" min="0" value=${monthly} onInput=${e=>setMonthly(e.target.value)} /></label>
            <label>${t(locale, 'home.heroWidgetMonths')} <input type="number" min="2" max="120" value=${months} onInput=${e=>setMonths(e.target.value)} /></label>
            <label>${t(locale, 'home.heroWidgetFinal')} <input type="number" min="0" value=${finalValue} onInput=${e=>setFinalValue(e.target.value)} /></label>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px">
            <button class="btn-sm" onClick=${onCount} disabled=${loading}>${loading ? t(locale, 'common.calculating') : t(locale, 'home.heroWidgetGo')}</button>
            ${xirr != null && html`<strong class="amount" style="font-size:18px">XIRR ${formatPercent(xirr, locale)}</strong>
            <a href="/kalkulator/reksa-dana" onClick=${openFull}>${t(locale, 'home.heroWidgetOpen')}</a>`}
        </div>
        ${error && html`<p style="color:var(--danger); font-size:13px" role="alert">${error}</p>`}
    </div>`;
}
