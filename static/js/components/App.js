import { html, useState, useEffect } from '../vendor/preact-htm-signals.js';
import { getCurrentRoute, navigate } from '../router.js';
import { loadSettings, saveSettings, LOCALE_OPTIONS, CURRENCY_OPTIONS, MARKET_OPTIONS } from '../store.js';
import { t } from '../i18n.js';
import { Landing } from './Landing.js';
import { Overview } from './Overview.js';
import { MutualFunds } from './MutualFunds.js';
import { Stocks } from './Stocks.js';
import { TermDeposits } from './TermDeposits.js';
import { Ev } from './Ev.js';
import { Footer } from './Footer.js';

// No-JS fallback hook: without JS the nav panel stays visible (see CSS).
document.documentElement.classList.add('js');

export function App() {
    const [route, setRoute] = useState(getCurrentRoute());
    const [settings, setSettings] = useState(loadSettings());
    const [menuOpen, setMenuOpen] = useState(false);
    const locale = settings.locale;

    useEffect(() => {
        const h = () => { setRoute(getCurrentRoute()); setMenuOpen(false); window.scrollTo(0, 0); };
        window.addEventListener('popstate', h);
        return () => window.removeEventListener('popstate', h);
    }, []);
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
    useEffect(() => {
        const titles = {
            home: t(locale, 'nav.home'),
            portofolio: t(locale, 'nav.portfolio'),
            'mutual-funds': t(locale, 'nav.mutualFunds'),
            stocks: t(locale, 'nav.stocks'),
            'term-deposits': t(locale, 'nav.termDeposits'),
            ev: t(locale, 'nav.ev'),
        };
        document.title = `${titles[route] || 'Beruang'} — Beruang`;
    }, [route, locale]);
    useEffect(() => { saveSettings(settings); document.documentElement.lang = locale.split('-')[0]; }, [settings]);

    const pages = {
        home: html`<${Landing} settings=${settings} />`,
        portofolio: html`<${Overview} settings=${settings} />`,
        'mutual-funds': html`<${MutualFunds} settings=${settings} />`,
        stocks: html`<${Stocks} settings=${settings} />`,
        'term-deposits': html`<${TermDeposits} settings=${settings} />`,
        ev: html`<${Ev} settings=${settings} />`,
    };

    const navItems = [
        { to: '/', key: 'home', label: t(locale, 'nav.home') },
        { to: '/kalkulator/reksa-dana', key: 'mutual-funds', label: t(locale, 'nav.mutualFunds') },
        { to: '/kalkulator/saham', key: 'stocks', label: t(locale, 'nav.stocks') },
        { to: '/kalkulator/deposito', key: 'term-deposits', label: t(locale, 'nav.termDeposits') },
        { to: '/portofolio', key: 'portofolio', label: t(locale, 'nav.portfolio') },
        { to: '/kalkulator/mobil-listrik', key: 'ev', label: t(locale, 'nav.ev') },
    ];
    const go = (e, to) => { e.preventDefault(); setMenuOpen(false); navigate(to); };

    return html`
        <div>
            <header class="ledger-header">
                <div class="topbar-main">
                    <div class="ledger-header__brand">
                        <a href="/" onClick=${e => go(e, '/')} aria-label="Beruang — ${t(locale, 'nav.home')}" style="display:flex; align-items:center; gap:10px; text-decoration:none; color:inherit">
                            <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true"><rect x="2" y="2" width="60" height="60" rx="14" fill="var(--ledger)"/><circle cx="32" cy="32" r="20" fill="none" stroke="#faf8f3" stroke-width="3.5"/><text x="32" y="41.5" font-family="Georgia, serif" font-size="23" font-weight="bold" fill="#faf8f3" text-anchor="middle">Rp</text></svg>
                            ${t(locale, 'hero.brand')} <small>${t(locale, 'hero.title')}</small>
                        </a>
                    </div>
                    <button class="menu-toggle" aria-expanded=${menuOpen} aria-controls="primary-nav" aria-label=${t(locale, 'ui.menu')} onClick=${() => setMenuOpen(!menuOpen)}>
                        <span class=${menuOpen ? 'menu-icon open' : 'menu-icon'} aria-hidden="true"></span>
                    </button>
                    <nav id="primary-nav" class=${menuOpen ? 'topnav open' : 'topnav'} aria-label=${t(locale, 'ui.navLabel')}>
                        ${navItems.map(i => html`<a href=${i.to} class=${route===i.key?'active':''} aria-current=${route===i.key ? 'page' : null} onClick=${e=>go(e, i.to)}>${i.label}</a>`)}
                    </nav>
                    <div class="locale-group" role="group" aria-label=${`${t(locale, 'settings.locale')} / ${t(locale, 'settings.currency')}`}>
                        <select value=${locale} title=${t(locale, 'settings.locale')} aria-label=${t(locale, 'settings.locale')} onChange=${e=>setSettings({...settings, locale:e.target.value})}>
                            ${LOCALE_OPTIONS.map(o=> html`<option value=${o.value}>${o.short || o.label}</option>`)}
                        </select>
                        <select value=${settings.currency} title=${t(locale, 'settings.currency')} aria-label=${t(locale, 'settings.currency')} onChange=${e=>setSettings({...settings, currency:e.target.value})}>
                            ${CURRENCY_OPTIONS.map(o=> html`<option value=${o.value}>${o.short || o.label}</option>`)}
                        </select>
                        <select value=${settings.market} title=${t(locale, 'settings.market')} aria-label=${t(locale, 'settings.market')} onChange=${e=>setSettings({...settings, market:e.target.value})}>
                            ${MARKET_OPTIONS.map(o=> html`<option value=${o.value}>${o.short || o.label}</option>`)}
                        </select>
                    </div>
                </div>
            </header>
            <main id="main">
                ${pages[route] || pages.home}
            </main>
            <${Footer} settings=${settings} />
        </div>
    `;
}
