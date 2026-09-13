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
