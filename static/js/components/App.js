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
import { RentVsBuy } from './RentVsBuy.js';
import { FlatLoan } from './FlatLoan.js';
import { DebtPayoff } from './DebtPayoff.js';
import { Footer } from './Footer.js';

// No-JS fallback hook: without JS the nav panel stays visible (see CSS).
document.documentElement.classList.add('js');

export function App() {
    const [route, setRoute] = useState(getCurrentRoute());
    const [settings, setSettings] = useState(loadSettings());
    const [menuOpen, setMenuOpen] = useState(false);
    const [calcOpen, setCalcOpen] = useState(false);
    const locale = settings.locale;

    useEffect(() => {
        const h = () => {
            setRoute(getCurrentRoute());
            setMenuOpen(false);
            setCalcOpen(false);
            window.scrollTo(0, 0);
            // Move screen-reader/keyboard focus to the new page (main is
            // tabindex=-1 so this never shows a focus ring on click nav).
            requestAnimationFrame(() => document.getElementById('main')?.focus({ preventScroll: true }));
        };
        window.addEventListener('popstate', h);
        return () => window.removeEventListener('popstate', h);
    }, []);
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') { setMenuOpen(false); setCalcOpen(false); } };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
    useEffect(() => {
        if (!calcOpen) return;
        const onDown = (e) => { if (!e.target.closest('.nav-drop')) setCalcOpen(false); };
        document.addEventListener('pointerdown', onDown);
        return () => document.removeEventListener('pointerdown', onDown);
    }, [calcOpen]);
    useEffect(() => {
        const titles = {
            home: t(locale, 'nav.home'),
            portofolio: t(locale, 'nav.portfolio'),
            'mutual-funds': t(locale, 'nav.mutualFunds'),
            stocks: t(locale, 'nav.stocks'),
            'term-deposits': t(locale, 'nav.termDeposits'),
            ev: t(locale, 'nav.ev'),
            'rent-buy': t(locale, 'nav.rentBuy'),
            'flat-loan': t(locale, 'nav.flatLoan'),
            'debt-payoff': t(locale, 'nav.debtPayoff'),
        };
        document.title = `${titles[route] || 'Beruang'} — Beruang`;
    }, [route, locale]);
    useEffect(() => { saveSettings(settings); document.documentElement.lang = locale.split('-')[0]; }, [settings]);
    useEffect(() => { document.documentElement.dataset.theme = settings.theme === 'dark' ? 'dark' : 'light'; }, [settings.theme]);
    const dark = settings.theme === 'dark';

    const pages = {
        home: html`<${Landing} settings=${settings} />`,
        portofolio: html`<${Overview} settings=${settings} />`,
        'mutual-funds': html`<${MutualFunds} settings=${settings} />`,
        stocks: html`<${Stocks} settings=${settings} />`,
        'term-deposits': html`<${TermDeposits} settings=${settings} />`,
        ev: html`<${Ev} settings=${settings} />`,
        'rent-buy': html`<${RentVsBuy} settings=${settings} />`,
        'flat-loan': html`<${FlatLoan} settings=${settings} />`,
        'debt-payoff': html`<${DebtPayoff} settings=${settings} />`,
    };

    // Canonical order everywhere (header, mobile menu, footer):
    // home → calculators group → portfolio.
    const calcLinks = [
        { to: '/kalkulator/reksa-dana', key: 'mutual-funds', labelKey: 'nav.mutualFunds', descKey: 'home.calcMfDesc' },
        { to: '/kalkulator/saham', key: 'stocks', labelKey: 'nav.stocks', descKey: 'home.calcStocksDesc' },
        { to: '/kalkulator/deposito', key: 'term-deposits', labelKey: 'nav.termDeposits', descKey: 'home.calcTdDesc' },
        { to: '/kalkulator/mobil-listrik', key: 'ev', labelKey: 'nav.ev', descKey: 'home.evDesc' },
        { to: '/kalkulator/sewa-vs-beli', key: 'rent-buy', labelKey: 'nav.rentBuy', descKey: 'home.rentBuyDesc' },
        { to: '/kalkulator/bunga-flat', key: 'flat-loan', labelKey: 'nav.flatLoan', descKey: 'home.flatDesc' },
        { to: '/kalkulator/lunas-utang', key: 'debt-payoff', labelKey: 'nav.debtPayoff', descKey: 'home.debtDesc' },
    ];
    const calcActive = calcLinks.some(l => l.key === route);
    const go = (e, to) => { e.preventDefault(); setMenuOpen(false); setCalcOpen(false); navigate(to); };

    return html`
        <div>
            <header class="ledger-header">
                <div class="topbar-main">
                    <div class="ledger-header__brand">
                        <a href="/" onClick=${e => go(e, '/')} aria-label="Beruang — ${t(locale, 'nav.home')}" style="display:flex; align-items:center; gap:10px; text-decoration:none; color:inherit">
                            <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true"><rect x="2" y="2" width="60" height="60" rx="14" style="fill:var(--ledger)"/><circle cx="32" cy="32" r="20" fill="none" style="stroke:var(--paper)" stroke-width="3.5"/><text x="32" y="41.5" font-family="Georgia, serif" font-size="23" font-weight="bold" style="fill:var(--paper)" text-anchor="middle">Rp</text></svg>
                            ${t(locale, 'hero.brand')} <small>${t(locale, 'hero.title')}</small>
                        </a>
                    </div>
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
                        <button type="button" class="theme-toggle" title=${t(locale, 'ui.theme')} aria-label=${t(locale, 'ui.themeToggle')} aria-pressed=${dark} onClick=${() => setSettings({...settings, theme: dark ? 'light' : 'dark'})}>
                            ${dark ? t(locale, 'ui.themeLight') : t(locale, 'ui.themeDark')}
                        </button>
                    </div>
                    <button class="menu-toggle" aria-expanded=${menuOpen} aria-controls="primary-nav" aria-label=${t(locale, 'ui.menu')} onClick=${() => setMenuOpen(!menuOpen)}>
                        <span class=${menuOpen ? 'menu-icon open' : 'menu-icon'} aria-hidden="true"></span>
                    </button>
                    <nav id="primary-nav" class=${menuOpen ? 'topnav open' : 'topnav'} aria-label=${t(locale, 'ui.navLabel')}>
                        <a href="/" class=${route==='home'?'active':''} aria-current=${route==='home' ? 'page' : null} onClick=${e=>go(e, '/')}>${t(locale, 'nav.home')}</a>
                        <div class="nav-drop">
                            <button type="button" class=${calcActive ? 'nav-drop__btn active' : 'nav-drop__btn'} aria-expanded=${calcOpen} aria-controls="calc-menu" onClick=${() => setCalcOpen(!calcOpen)}>
                                ${t(locale, 'nav.calculators')} <span class="nav-drop__chev" aria-hidden="true">${calcOpen ? '▴' : '▾'}</span>
                            </button>
                            ${calcOpen && html`<div id="calc-menu" class="nav-drop__panel" role="group" aria-label=${t(locale, 'nav.calculators')}>
                                ${calcLinks.map(l => html`<a href=${l.to} class=${route===l.key?'active':''} aria-current=${route===l.key ? 'page' : null} onClick=${e=>go(e, l.to)}>
                                    <span class="nav-drop__title">${t(locale, l.labelKey)}</span>
                                    <span class="nav-drop__desc">${t(locale, l.descKey)}</span>
                                </a>`)}
                            </div>`}
                        </div>
                        <div class="topnav__section" role="group" aria-label=${t(locale, 'nav.calculators')}>
                            <span class="topnav__label" aria-hidden="true">${t(locale, 'nav.calculators')}</span>
                            ${calcLinks.map(l => html`<a href=${l.to} class=${route===l.key?'active sub':'sub'} aria-current=${route===l.key ? 'page' : null} onClick=${e=>go(e, l.to)}>${t(locale, l.labelKey)}</a>`)}
                        </div>
                        <a href="/portofolio" class=${route==='portofolio'?'active':''} aria-current=${route==='portofolio' ? 'page' : null} onClick=${e=>go(e, '/portofolio')}>${t(locale, 'nav.portfolio')}</a>
                    </nav>
                </div>
            </header>
            <main id="main" tabindex="-1">
                ${pages[route] || pages.home}
            </main>
            <${Footer} settings=${settings} />
        </div>
    `;
}
