import { html, useState } from '../vendor/preact-htm-signals.js';
import {
    exportLedgerCsv, exportLedgerJson, exportLedgerCsvTemplate,
    parseLedgerCsv, parseLedgerJson, download,
} from '../ledgerIo.js';
import { t } from '../i18n.js';

// Per-asset backup panel: template + CSV/JSON export + paste-to-import.
// `entries` are the live rows; `onImport(rows, apy?)` replaces them.
function formatSize(bytes) {
    if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
export function LedgerIo({ asset, entries, onImport, locale }) {
    const [text, setText] = useState('');
    const [fileMeta, setFileMeta] = useState('');
    const [preview, setPreview] = useState(null);
    const [status, setStatus] = useState('');

    // Localized preview errors (raw parser codes are never shown).
    function errorText(e) {
        if (e.type === 'invalidJson') return t(locale, 'io.invalidJson');
        if (e.type === 'missingHeader') return t(locale, 'io.missingHeader', { line: e.line });
        if (e.type === 'invalidDate') return t(locale, 'io.invalidDate', { line: e.line, field: e.field });
        if (e.type === 'invalidNumber') return t(locale, 'io.invalidNumber', { line: e.line, field: e.field });
        if (e.type === 'empty') return t(locale, 'io.empty');
        return `${t(locale, 'ui.line')} ${e.line}: ${e.field || e.type}`;
    }

    function doExportCsv() {
        download(`${asset}-ledger.csv`, exportLedgerCsv(asset, entries), 'text/csv');
    }
    function doExportJson() {
        download(`${asset}-ledger.json`, exportLedgerJson(asset, entries), 'application/json');
    }
    function doTemplate() {
        download(`${asset}-template.csv`, exportLedgerCsvTemplate(asset), 'text/csv');
    }
    function onFile(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            setText(String(reader.result || ''));
            setFileMeta(`${file.name} · ${formatSize(file.size)}`);
            setPreview(null);
        };
        reader.onerror = () => setStatus(t(locale, 'io.fileError'));
        reader.readAsText(file);
        e.target.value = '';
    }
    function doPreview() {
        setStatus('');
        const trimmed = text.trim();
        const parsed = trimmed.startsWith('{') || trimmed.startsWith('[')
            ? parseLedgerJson(asset, text)
            : parseLedgerCsv(asset, text);
        // Header-only / blank input otherwise ends in a guidance dead end.
        if (!parsed.entries.length && !parsed.errors.length) {
            setPreview({ entries: [], errors: [{ line: 1, type: 'empty' }] });
        } else {
            setPreview(parsed);
        }
    }
    function doConfirm() {
        if (preview && !preview.errors.length && preview.entries.length) {
            // Term-deposit JSON snapshots may carry apy alongside entries.
            let apy;
            if (asset === 'term-deposits') {
                try {
                    const raw = JSON.parse(text);
                    if (raw && Number.isFinite(Number(raw.apy))) apy = Number(raw.apy);
                } catch {}
            }
            onImport(preview.entries, apy);
            setStatus(t(locale, 'io.importedCount', { count: preview.entries.length }));
            setText(''); setFileMeta(''); setPreview(null);
            requestAnimationFrame(() => document.querySelector('.page-head')?.scrollIntoView());
        }
    }

    return html`<div class="ledger-io">
        <div class="rows-head"><strong>${t(locale, 'io.importTitle')}</strong></div>
        <div class="io-actions" style="flex-wrap:wrap">
            <button class="btn-ghost btn-sm" onClick=${doTemplate}>${t(locale, 'io.template')}</button>
            <button class="btn-ghost btn-sm" onClick=${doExportCsv}>${t(locale, 'io.exportCsv')}</button>
            <button class="btn-ghost btn-sm" onClick=${doExportJson}>${t(locale, 'io.exportJson')}</button>
        </div>
        <textarea class="io-textarea" value=${text} onInput=${e => { setText(e.target.value); setFileMeta(''); setPreview(null); }}
            placeholder=${t(locale, 'io.pasteCsv')} aria-label=${t(locale, 'io.importTitle')}></textarea>
        <div style="margin-top:8px">
            <label class="muted" style="font-size:12px">${t(locale, 'io.chooseFile')}
                <input type="file" accept=".csv,.json,text/csv,application/json" onChange=${onFile} style="font-size:12px" />
            </label>
        </div>
        ${fileMeta && html`<p class="muted" style="font-size:12px; margin:4px 0 0">${fileMeta}</p>`}
        <div class="io-actions" style="margin-top:8px">
            <button class="btn-sm" onClick=${doPreview} disabled=${!text.trim()}>${t(locale, 'io.confirmImport')}</button>
            <button class="btn-ghost btn-sm" onClick=${() => { setText(''); setFileMeta(''); setPreview(null); setStatus(''); }}>${t(locale, 'io.cancel')}</button>
        </div>
        ${preview && html`<div class="io-preview">
            <p class="muted" style="font-size:13px">${t(locale, 'io.validRows', { valid: preview.entries.length, errors: preview.errors.length })}</p>
            ${preview.errors.length > 0 && html`<ul class="io-errors" role="alert">
                ${preview.errors.slice(0, 8).map(e => html`<li>${errorText(e)}</li>`)}
            </ul>`}
            ${!preview.errors.length && preview.entries.length > 0 && html`<button class="btn-sm" onClick=${doConfirm}>${t(locale, 'io.confirmImport')} (${preview.entries.length})</button>`}
        </div>`}
        ${status && html`<p class="io-status">${status}</p>`}
    </div>`;
}
