import { html, useState } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { navigate } from '../router.js';
import { parseLedgerJson, download } from '../ledgerIo.js';
import {
    loadLedgers, loadSettings, loadGoals,
    trySaveLedgers, trySaveSettings, trySaveGoals,
} from '../store.js';

const LEDGER_ASSETS = ['mutual-funds', 'stocks', 'term-deposits'];
const RECALC_LINKS = [
    { to: '/kalkulator/reksa-dana', labelKey: 'nav.mutualFunds' },
    { to: '/kalkulator/saham', labelKey: 'nav.stocks' },
    { to: '/kalkulator/deposito', labelKey: 'nav.termDeposits' },
];
const ASSET_PATHS = {
    'mutual-funds': '/kalkulator/reksa-dana',
    stocks: '/kalkulator/saham',
    'term-deposits': '/kalkulator/deposito',
};
const ASSET_LABEL_KEYS = {
    'mutual-funds': 'nav.mutualFunds',
    stocks: 'nav.stocks',
    'term-deposits': 'nav.termDeposits',
};

function buildBackup() {
    const l = loadLedgers();
    return {
        app: 'beruang',
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: loadSettings(),
        ledgers: {
            'mutual-funds': l['mutual-funds'],
            stocks: l.stocks,
            'term-deposits': l['term-deposits'],
        },
        goals: loadGoals(),
    };
}

function backupFilename(prefix) {
    return `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
}

function formatSize(bytes) {
    if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Validate one asset's candidate value with the same row rules as
// per-asset import. Returns cleaned rows for commit.
function checkAssetRows(asset, value) {
    const rows = asset === 'term-deposits'
        ? (Array.isArray(value) ? value : value?.entries)
        : value;
    if (!Array.isArray(rows)) return { rows: 0, errors: 1, cleaned: null };
    const parsed = parseLedgerJson(asset, JSON.stringify({ entries: rows }));
    return { rows: parsed.entries.length, errors: parsed.errors.length, cleaned: parsed.entries };
}

export function PortfolioIo({ settings }) {
    const locale = settings?.locale || 'en-US';
    const go = (e, to) => { e.preventDefault(); navigate(to); };
    const [text, setText] = useState('');
    const [fileMeta, setFileMeta] = useState('');
    const [pending, setPending] = useState(null);
    const [perAsset, setPerAsset] = useState(null);
    const [status, setStatus] = useState('');
    const [snapshotNote, setSnapshotNote] = useState('');
    const [error, setError] = useState('');

    function onFile(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            setText(String(reader.result || ''));
            setFileMeta(`${file.name} · ${formatSize(file.size)}`);
            setPending(null);
            setError('');
        };
        reader.onerror = () => setError(t(locale, 'io.fileError'));
        reader.readAsText(file);
        e.target.value = '';
    }

    function exportAll() {
        download(backupFilename('beruang-backup'), JSON.stringify(buildBackup(), null, 2), 'application/json');
        setStatus(t(locale, 'backup.downloaded'));
        setSnapshotNote('');
        setError('');
    }

    // Step 1: parse + validate into a preview. Nothing is overwritten here.
    function reviewBackup() {
        setStatus(''); setSnapshotNote(''); setError('');
        setPending(null); setPerAsset(null);
        let data;
        try { data = JSON.parse(text); }
        catch { setError(t(locale, 'io.invalidJson')); return; }
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            setError(t(locale, 'io.invalidApp'));
            return;
        }
        // Single-asset export belongs on its calculator page, not here.
        if (typeof data.asset === 'string' && Array.isArray(data.entries) && ASSET_PATHS[data.asset]) {
            setPerAsset(data.asset);
            setError(t(locale, 'io.invalidApp'));
            return;
        }
        const ledgers = data.ledgers
            ?? ((data['mutual-funds'] !== undefined || data.stocks !== undefined || data['term-deposits'] !== undefined) ? data : null);
        if (!ledgers || typeof ledgers !== 'object') {
            setError(t(locale, 'io.invalidApp'));
            return;
        }
        const cleaned = {};
        let apy;
        let rows = 0, problems = 0;
        for (const asset of LEDGER_ASSETS) {
            if (ledgers[asset] === undefined) continue;
            const check = checkAssetRows(asset, ledgers[asset]);
            problems += check.errors;
            if (check.cleaned) {
                cleaned[asset] = check.cleaned;
                rows += check.rows;
                if (asset === 'term-deposits' && ledgers[asset] && !Array.isArray(ledgers[asset])
                    && Number.isFinite(Number(ledgers[asset].apy))) {
                    apy = Number(ledgers[asset].apy);
                }
            }
        }
        if (rows === 0 && problems === 0) {
            setError(t(locale, 'backup.emptyBackup'));
            return;
        }
        setPending({
            cleaned,
            apy,
            settings: data.settings && typeof data.settings === 'object' ? data.settings : null,
            goals: data.goals && typeof data.goals === 'object' ? data.goals : null,
            rowCount: rows,
            assetCount: Object.keys(cleaned).length,
            problems,
        });
    }

    // Step 2: snapshot current state (undo path), then commit.
    function applyRestore() {
        if (!pending || pending.problems) return;
        setError('');
        download(backupFilename('beruang-pre-restore'), JSON.stringify(buildBackup(), null, 2), 'application/json');
        const next = loadLedgers();
        if (pending.cleaned['mutual-funds']) next['mutual-funds'] = pending.cleaned['mutual-funds'];
        if (pending.cleaned['stocks']) next.stocks = pending.cleaned['stocks'];
        if (pending.cleaned['term-deposits']) {
            next['term-deposits'] = {
                apy: pending.apy ?? next['term-deposits']?.apy ?? 0,
                entries: pending.cleaned['term-deposits'],
            };
        }
        next.results = { 'mutual-funds': null, stocks: null, 'term-deposits': null };
        let ok = trySaveLedgers(next).ok;
        if (pending.settings) ok = trySaveSettings({ ...loadSettings(), ...pending.settings }).ok && ok;
        if (pending.goals) ok = trySaveGoals(pending.goals).ok && ok;
        if (!ok) {
            setError(t(locale, 'io.storageFull'));
            return;
        }
        setStatus(t(locale, 'backup.restored'));
        setSnapshotNote(t(locale, 'backup.snapshotSaved'));
        setText(''); setFileMeta(''); setPending(null);
    }

    function cancelPending() { setPending(null); }

    return html`<div class="card">
        <h2 style="margin:0 0 4px">${t(locale, 'backup.title')}</h2>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin:8px 0">
            <button class="btn-ghost btn-sm" onClick=${exportAll}>${t(locale, 'backup.exportAll')}</button>
        </div>
        <textarea value=${text} onInput=${e => { setText(e.target.value); setFileMeta(''); setPending(null); }} placeholder=${t(locale, 'backup.pasteHint')} aria-label=${t(locale, 'backup.title')} style="width:100%; min-height:96px; font-family:monospace; font-size:12px"></textarea>
        <div style="margin-top:8px">
            <label class="muted" style="font-size:12px">${t(locale, 'io.chooseFile')}
                <input type="file" accept=".json,application/json" onChange=${onFile} style="font-size:12px" />
            </label>
        </div>
        ${fileMeta && html`<p class="muted" style="font-size:12px; margin:4px 0 0">${fileMeta}</p>`}
        ${!pending && html`<div style="margin-top:8px"><button class="btn-sm" onClick=${reviewBackup} disabled=${!text.trim()}>${t(locale, 'backup.reviewRestore')}</button></div>`}
        ${pending && html`<div class="io-preview">
            <p style="font-size:13px">${t(locale, 'backup.validSummary', { assets: pending.assetCount, rows: pending.rowCount })}</p>
            ${pending.problems > 0 && html`<p style="color:var(--danger); font-size:13px">${t(locale, 'backup.invalidCount', { errors: pending.problems })}</p>`}
            <p class="muted" style="font-size:12px">${t(locale, 'backup.overwriteWarning')}</p>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px">
                <button class="btn-sm btn-danger" onClick=${applyRestore} disabled=${pending.problems > 0}>${t(locale, 'backup.applyRestore')}</button>
                <button class="btn-ghost btn-sm" onClick=${cancelPending}>${t(locale, 'io.cancel')}</button>
            </div>
        </div>`}
        ${status && html`<p style="color:var(--success); font-size:13px">${status}</p>
            ${snapshotNote && html`<p class="muted" style="font-size:12px">${snapshotNote}</p>`}
            <p style="font-size:13px; display:flex; gap:8px; flex-wrap:wrap">
                ${RECALC_LINKS.map(l => html`<a href=${l.to} onClick=${e=>go(e,l.to)}>${t(locale, l.labelKey)} →</a>`)}
            </p>`}
        ${error && html`<p style="color:var(--danger); font-size:13px" role="alert">${error}</p>`}
        ${perAsset && html`<p style="font-size:13px"><a href=${ASSET_PATHS[perAsset]} onClick=${e=>go(e,ASSET_PATHS[perAsset])}>${t(locale, ASSET_LABEL_KEYS[perAsset])} →</a> — ${t(locale, 'backup.wrongFile')}</p>`}
    </div>`;
}
