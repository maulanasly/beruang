import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { getCurrentRoute, navigate } from '../router.js';
import { loadSettings, saveSettings, LOCALE_OPTIONS, CURRENCY_OPTIONS, MARKET_OPTIONS } from '../store.js';
import { t } from '../i18n.js';
import { Landing } from './Landing.js';
import { Overview } from './Overview.js';
import { MutualFunds } from './MutualFunds.js';
import { Stocks } from './Stocks.js';
import { TermDeposits } from './TermDeposits.js';
import { Footer } from './Footer.js';

export function App() {
    const [route, setRoute] = useState(getCurrentRoute());
    const [settings, setSettings] = useState(loadSettings());
    const locale = settings.locale;

    useEffect(() => {
        const h = () => { setRoute(getCurrentRoute()); window.scrollTo(0, 0); };
        window.addEventListener('popstate', h);
        return () => window.removeEventListener('popstate', h);
    }, []);
    useEffect(() => {
        const titles = {
            home: t(locale, 'nav.home'),
            overview: t(locale, 'nav.overview'),
            'mutual-funds': t(locale, 'nav.mutualFunds'),
            stocks: t(locale, 'nav.stocks'),
            'term-deposits': t(locale, 'nav.termDeposits'),
        };
        document.title = `${titles[route] || 'Beruang'} — Beruang`;
    }, [route, locale]);
    useEffect(() => { saveSettings(settings); document.documentElement.lang = locale.split('-')[0]; }, [settings]);

    const pages = {
        home: html`<${Landing} settings=${settings} />`,
        overview: html`<${Overview} settings=${settings} />`,
        'mutual-funds': html`<${MutualFunds} settings=${settings} />`,
        stocks: html`<${Stocks} settings=${settings} />`,
        'term-deposits': html`<${TermDeposits} settings=${settings} />`,
    };

    const navItems = [
        { to: '/overview', key: 'overview', label: t(locale, 'nav.overview') },
        { to: '/mutual-funds', key: 'mutual-funds', label: t(locale, 'nav.mutualFunds') },
        { to: '/stocks', key: 'stocks', label: t(locale, 'nav.stocks') },
        { to: '/term-deposits', key: 'term-deposits', label: t(locale, 'nav.termDeposits') },
    ];
    const go = (e, to) => { e.preventDefault(); navigate(to); };

    return html`
        <div>
            <header class="ledger-header">
                <div class="ledger-header__brand">
                    <a href="/" onClick=${e => go(e, '/')} aria-label="Beruang — ${t(locale, 'nav.home')}" style="display:flex; align-items:center; gap:10px; text-decoration:none; color:inherit">
                        <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true"><rect x="2" y="2" width="60" height="60" rx="14" fill="var(--ledger)"/><circle cx="32" cy="32" r="20" fill="none" stroke="#faf8f3" stroke-width="3.5"/><text x="32" y="41.5" font-family="Georgia, serif" font-size="23" font-weight="bold" fill="#faf8f3" text-anchor="middle">Rp</text></svg>
                        ${t(locale, 'hero.brand')} <small>${t(locale, 'hero.title')}</small>
                    </a>
                </div>
            </header>
            <div class="app-shell">
                <nav class="sidebar" aria-label=${t(locale, 'ui.navLabel')}>
                    <div class="sidebar__section">
                        <div class="sidebar__label">${t(locale, 'overview.portfolio')}</div>
                        ${navItems.map(i => html`<a href=${i.to} class=${route===i.key?'active':''} onClick=${e=>go(e, i.to)}>${i.label}</a>`)}
                    </div>
                    <div class="sidebar__section">
                        <div class="sidebar__label">${t(locale, 'settings.locale')} / ${t(locale, 'settings.currency')}</div>
                        <select value=${locale} title=${t(locale, 'settings.locale')} aria-label=${t(locale, 'settings.locale')} onChange=${e=>setSettings({...settings, locale:e.target.value})}>
                            ${LOCALE_OPTIONS.map(o=> html`<option value=${o.value}>${o.label}</option>`)}
                        </select>
                        <select value=${settings.currency} title=${t(locale, 'settings.currency')} aria-label=${t(locale, 'settings.currency')} onChange=${e=>setSettings({...settings, currency:e.target.value})}>
                            ${CURRENCY_OPTIONS.map(o=> html`<option value=${o.value}>${o.label}</option>`)}
                        </select>
                        <select value=${settings.market} title=${t(locale, 'settings.market')} aria-label=${t(locale, 'settings.market')} onChange=${e=>setSettings({...settings, market:e.target.value})}>
                            ${MARKET_OPTIONS.map(o=> html`<option value=${o.value}>${o.label}</option>`)}
                        </select>
                    </div>
                </nav>
                <main id="main">
                    ${pages[route] || pages.home}
                </main>
            </div>
            <${Footer} settings=${settings} />
        </div>
    `;
}
