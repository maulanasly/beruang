import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { getCurrentRoute, navigate } from '../router.js';
import { loadSettings, saveSettings, LOCALE_OPTIONS, CURRENCY_OPTIONS, MARKET_OPTIONS } from '../store.js';
import { Overview } from './Overview.js';
import { MutualFunds } from './MutualFunds.js';
import { Stocks } from './Stocks.js';
import { TermDeposits } from './TermDeposits.js';

const TITLES = {
    overview: 'Overview',
    'mutual-funds': 'Mutual Funds',
    stocks: 'Stocks',
    'term-deposits': 'Term Deposits',
};

export function App() {
    const [route, setRoute] = useState(getCurrentRoute());
    const [settings, setSettings] = useState(loadSettings());

    useEffect(() => {
        const h = () => setRoute(getCurrentRoute());
        window.addEventListener('hashchange', h);
        return () => window.removeEventListener('hashchange', h);
    }, []);
    useEffect(() => { document.title = `${TITLES[route] || 'Beruang'} — Beruang`; }, [route]);
    useEffect(() => { saveSettings(settings); document.documentElement.lang = settings.locale.split('-')[0]; }, [settings]);

    const pages = {
        overview: html`<${Overview} settings=${settings} />`,
        'mutual-funds': html`<${MutualFunds} settings=${settings} />`,
        stocks: html`<${Stocks} settings=${settings} />`,
        'term-deposits': html`<${TermDeposits} settings=${settings} />`,
    };

    const navItems = [
        { to: '#/overview', key: 'overview', label: 'Overview' },
        { to: '#/mutual-funds', key: 'mutual-funds', label: 'Mutual Funds' },
        { to: '#/stocks', key: 'stocks', label: 'Stocks' },
        { to: '#/term-deposits', key: 'term-deposits', label: 'Term Deposits' },
    ];

    return html`
        <div>
            <header class="ledger-header">
                <div class="ledger-header__brand">
                    <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true"><rect x="2" y="2" width="60" height="60" rx="14" fill="var(--ledger)"/><circle cx="32" cy="32" r="20" fill="none" stroke="#faf8f3" stroke-width="3.5"/><text x="32" y="41.5" font-family="Georgia, serif" font-size="23" font-weight="bold" fill="#faf8f3" text-anchor="middle">Rp</text></svg>
                    Beruang <small>Investment Tracker</small>
                </div>
                <div class="ledger-header__period">
                    <span class="muted" style="font-size:12px">${settings.locale} · ${settings.currency} · ${settings.market}</span>
                </div>
            </header>
            <div class="app-shell">
                <nav class="sidebar" aria-label="Nav">
                    <div class="sidebar__section">
                        <div class="sidebar__label">Portfolio</div>
                        ${navItems.map(i => html`<a href=${i.to} class=${route===i.key?'active':''} onClick=${e=>{e.preventDefault(); navigate(i.to.slice(1));}}>${i.label}</a>`)}
                    </div>
                    <div class="sidebar__section">
                        <div class="sidebar__label">Settings</div>
                        <select value=${settings.locale} onChange=${e=>setSettings({...settings, locale:e.target.value})}>
                            ${LOCALE_OPTIONS.map(o=> html`<option value=${o.value}>${o.label}</option>`)}
                        </select>
                        <select value=${settings.currency} onChange=${e=>setSettings({...settings, currency:e.target.value})}>
                            ${CURRENCY_OPTIONS.map(o=> html`<option value=${o.value}>${o.label}</option>`)}
                        </select>
                        <select value=${settings.market} onChange=${e=>setSettings({...settings, market:e.target.value})}>
                            ${MARKET_OPTIONS.map(o=> html`<option value=${o.value}>${o.label}</option>`)}
                        </select>
                    </div>
                </nav>
                <main>
                    ${pages[route] || pages.overview}
                </main>
            </div>
        </div>
    `;
}
