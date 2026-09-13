import { html, useState } from '../vendor/preact-htm-signals.js';
import {
    exportLedgerCsv, exportLedgerJson, exportLedgerCsvTemplate,
    parseLedgerCsv, parseLedgerJson, download,
} from '../ledgerIo.js';
import { t } from '../i18n.js';

// Per-asset backup panel: template + CSV/JSON export + paste-to-import.
// `entries` are the live rows; `onImport(rows)` replaces them.
export function LedgerIo({ asset, entries, onImport, locale }) {
    const [text, setText] = useState('');
    const [preview, setPreview] = useState(null);
    const [status, setStatus] = useState('');

    function doExportCsv() {
        download(`${asset}-ledger.csv`, exportLedgerCsv(asset, entries), 'text/csv');
    }
    function doExportJson() {
        download(`${asset}-ledger.json`, exportLedgerJson(asset, entries), 'application/json');
    }
    function doTemplate() {
        download(`${asset}-template.csv`, exportLedgerCsvTemplate(asset), 'text/csv');
    }
    function doPreview() {
        setStatus('');
        const trimmed = text.trim();
        const parsed = trimmed.startsWith('{') || trimmed.startsWith('[')
            ? parseLedgerJson(asset, text)
            : parseLedgerCsv(asset, text);
        setPreview(parsed);
    }
    function doConfirm() {
        if (preview && !preview.errors.length && preview.entries.length) {
            onImport(preview.entries);
            setStatus(t(locale, 'io.importedCount', { count: preview.entries.length }));
            setText(''); setPreview(null);
        }
    }

    return html`<div class="ledger-io">
        <div class="rows-head"><strong>${t(locale, 'io.importTitle')}</strong></div>
        <div class="io-actions" style="flex-wrap:wrap">
            <button class="btn-ghost btn-sm" onClick=${doTemplate}>${t(locale, 'io.template')}</button>
            <button class="btn-ghost btn-sm" onClick=${doExportCsv}>${t(locale, 'io.exportCsv')}</button>
            <button class="btn-ghost btn-sm" onClick=${doExportJson}>${t(locale, 'io.exportJson')}</button>
        </div>
        <textarea class="io-textarea" value=${text} onInput=${e => setText(e.target.value)}
            placeholder=${t(locale, 'io.pasteCsv')}></textarea>
        <div class="io-actions" style="margin-top:8px">
            <button class="btn-sm" onClick=${doPreview} disabled=${!text.trim()}>${t(locale, 'io.confirmImport')}</button>
            <button class="btn-ghost btn-sm" onClick=${() => { setText(''); setPreview(null); setStatus(''); }}>${t(locale, 'io.cancel')}</button>
        </div>
        ${preview && html`<div class="io-preview">
            <p class="muted" style="font-size:13px">${t(locale, 'io.validRows', { valid: preview.entries.length, errors: preview.errors.length })}</p>
            ${preview.errors.length > 0 && html`<ul class="io-errors">
                ${preview.errors.slice(0, 8).map(e => html`<li>Line ${e.line}: ${e.field || e.type}</li>`)}
            </ul>`}
            ${!preview.errors.length && preview.entries.length > 0 && html`<button class="btn-sm" onClick=${doConfirm}>${t(locale, 'io.confirmImport')} (${preview.entries.length})</button>`}
        </div>`}
        ${status && html`<p class="io-status">${status}</p>`}
    </div>`;
}
