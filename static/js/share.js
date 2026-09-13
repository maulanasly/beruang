import { html, useState } from './vendor/preact-htm-signals.js';
import { t } from './i18n.js';
import { canonicalPath, getRouteQuery } from './router.js';

// Shareable calculator links: `?s=` carries a base64url JSON snapshot of
// the ledger (plus apy for deposits) on the canonical Indonesian path,
// so a shared link reproduces the sender's inputs on any device.
const MAX_ROWS = 120;

function b64encode(str) {
    return btoa(unescape(encodeURIComponent(str)))
        .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function b64decode(str) {
    const padded = String(str).replaceAll('-', '+').replaceAll('_', '/');
    return decodeURIComponent(escape(atob(padded)));
}

export function encodeShareState(state) {
    return b64encode(JSON.stringify(state));
}

function validRow(r) {
    return r && typeof r === 'object' && typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date);
}

export function decodeShareState(raw) {
    try {
        const s = JSON.parse(b64decode(raw));
        if (!s || typeof s !== 'object') return null;
        // EV snapshots carry {inputs}; ledger pages carry {entries[, apy]}.
        if (s.inputs && typeof s.inputs === 'object' && !Array.isArray(s.inputs)) {
            return { inputs: s.inputs };
        }
        if (!Array.isArray(s.entries) || !s.entries.length || s.entries.length > MAX_ROWS) return null;
        if (!s.entries.every(validRow)) return null;
        if (s.apy !== undefined && !(typeof s.apy === 'number' && Number.isFinite(s.apy))) return null;
        return { entries: s.entries, apy: s.apy };
    } catch { return null; }
}

export function readSharedState() {
    return decodeShareState(getRouteQuery().get('s') || '');
}

export function buildShareUrl(route, state) {
    const path = canonicalPath[route] || '/';
    return `${window.location.origin}${path}?s=${encodeShareState(state)}`;
}

export function ShareLink({ route, state, locale }) {
    const [copied, setCopied] = useState(false);
    async function copy() {
        const url = buildShareUrl(route, state);
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = url; document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); } catch {}
            ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    }
    return html`<button class="btn-ghost btn-sm" onClick=${copy}>
        ${copied ? t(locale, 'share.copied') : t(locale, 'share.copyLink')}
    </button>`;
}

// Payload normalization shared by calculate actions and the dashboard's
// staleness check: identical input always yields identical output.
export function normalizeLedgerEntries(asset, entries, apy) {
    const num = (v) => Number(v) || 0;
    if (asset === 'mutual-funds') {
        return entries.map(e => ({
            date: e.date,
            installment_amount: num(e.installment_amount),
            current_value: num(e.current_value),
        }));
    }
    if (asset === 'stocks') {
        return entries.map(e => ({
            date: e.date,
            installment_amount: num(e.installment_amount),
            new_share_purchases: num(e.new_share_purchases),
            dividends: num(e.dividends),
            current_value: num(e.current_value),
            dividend_yield: e.dividend_yield ? Number(e.dividend_yield) / 100 : null,
        }));
    }
    return {
        apy: Number(apy),
        entries: (entries || []).map(e => ({
            date: e.date,
            installment_amount: num(e.installment_amount),
            current_value: num(e.current_value),
            term_months: Number(e.term_months) || 12,
            maturity_date: e.maturity_date || null,
        })),
    };
}

// Key-order-stable serialization so snapshots compare equal regardless
// of property insertion order (e.g. after CSV import).
export function stableStringify(value) {
    if (value === null || typeof value !== 'object') {
        const n = typeof value === 'number' && Number.isNaN(value) ? null : value;
        return JSON.stringify(n);
    }
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export function calcSnapshot(asset, entries, apy) {
    return stableStringify(normalizeLedgerEntries(asset, entries, apy));
}
