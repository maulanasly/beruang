import { html, useState } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { loadLedgers, saveLedgers, loadSettings, saveSettings, loadGoals, saveGoals } from '../store.js';

export function PortfolioIo({ settings }) {
    const locale = settings?.locale || 'en-US';
    const [text, setText] = useState('');
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');

    function exportAll() {
        const backup = {
            app: 'beruang',
            version: 1,
            exportedAt: new Date().toISOString(),
            settings: loadSettings(),
            ledgers: (() => { const l = loadLedgers(); return { 'mutual-funds': l['mutual-funds'], stocks: l.stocks, 'term-deposits': l['term-deposits'] }; })(),
            goals: loadGoals(),
        };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `beruang-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        setStatus(t(locale, 'backup.downloaded'));
        setError('');
    }

    function restore() {
        setStatus(''); setError('');
        let data;
        try { data = JSON.parse(text); }
        catch { setError(t(locale, 'io.invalidJson')); return; }
        if (!data || (data.app !== 'beruang' && !data.ledgers && !data['mutual-funds'])) {
            setError(t(locale, 'io.invalidApp'));
            return;
        }
        try {
            const ledgers = data.ledgers ?? data;
            const next = loadLedgers();
            if (Array.isArray(ledgers['mutual-funds'])) next['mutual-funds'] = ledgers['mutual-funds'];
            if (Array.isArray(ledgers.stocks)) next.stocks = ledgers.stocks;
            if (ledgers['term-deposits']) next['term-deposits'] = ledgers['term-deposits'];
            next.results = { 'mutual-funds': null, stocks: null, 'term-deposits': null };
            saveLedgers(next);
            if (data.settings) saveSettings({ ...loadSettings(), ...data.settings });
            if (data.goals) saveGoals(data.goals);
            setStatus(t(locale, 'backup.restored'));
            setText('');
        } catch (e) { setError(t(locale, 'io.invalidStructure')); }
    }

    return html`<div class="card">
        <h2 style="margin:0 0 4px">${t(locale, 'backup.title')}</h2>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin:8px 0">
            <button class="btn-ghost btn-sm" onClick=${exportAll}>${t(locale, 'backup.exportAll')}</button>
        </div>
        <textarea value=${text} onInput=${e=>setText(e.target.value)} placeholder=${t(locale, 'backup.pasteHint')} aria-label=${t(locale, 'backup.title')} style="width:100%; min-height:64px; font-family:monospace; font-size:12px"></textarea>
        <div style="margin-top:8px"><button class="btn-sm" onClick=${restore} disabled=${!text.trim()}>${t(locale, 'backup.confirmRestore')}</button></div>
        ${status && html`<p style="color:var(--success); font-size:13px">${status}</p>`}
        ${error && html`<p style="color:var(--danger); font-size:13px">${error}</p>`}
    </div>`;
}
