import { html, useState } from '../vendor/preact-htm-signals.js';
import { loadLedgers, saveLedgers, loadSettings, saveSettings, loadGoals, saveGoals } from '../store.js';

export function PortfolioIo() {
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
        setStatus('Backup downloaded.');
        setError('');
    }

    function restore() {
        setStatus(''); setError('');
        let data;
        try { data = JSON.parse(text); }
        catch { setError('Invalid JSON.'); return; }
        if (!data || (data.app !== 'beruang' && !data.ledgers && !data['mutual-funds'])) {
            setError('Not a Beruang backup file.');
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
            setStatus('Portfolio restored. Recalculate returns to refresh the dashboard.');
            setText('');
        } catch (e) { setError('Unrecognized backup format.'); }
    }

    return html`<div class="card">
        <h2 style="margin:0 0 4px">Full Portfolio Backup</h2>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin:8px 0">
            <button class="btn-ghost btn-sm" onClick=${exportAll}>Backup All Data</button>
        </div>
        <textarea value=${text} onInput=${e=>setText(e.target.value)} placeholder="Paste backup JSON here, or pick a file above" style="width:100%; min-height:64px; font-family:monospace; font-size:12px"></textarea>
        <div style="margin-top:8px"><button class="btn-sm" onClick=${restore} disabled=${!text.trim()}>Confirm Restore</button></div>
        ${status && html`<p style="color:var(--success); font-size:13px">${status}</p>`}
        ${error && html`<p style="color:var(--danger); font-size:13px">${error}</p>`}
    </div>`;
}
