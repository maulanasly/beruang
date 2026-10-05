import { html, useState, useEffect, useRef } from '../vendor/preact-htm-signals.js';
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
import { Retire } from './Retire.js';
import { Footer } from './Footer.js';

// No-JS fallback hook: without JS the nav panel stays visible (see CSS).
document.documentElement.classList.add('js');

// Feather-style inline icons (16px): gear for the settings popover,
// sun/moon for the theme toggle. Shown next to the *action* label, so
// "Dark" with a moon reads as the destination, not the current state.
const gearIcon = html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
const sunIcon = html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
const moonIcon = html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

export function App() {
    const [route, setRoute] = useState(getCurrentRoute());
    const [settings, setSettings] = useState(loadSettings());
    const [menuOpen, setMenuOpen] = useState(false);
    const [calcOpen, setCalcOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const settingsButtonRef = useRef(null);
    const calcButtonRef = useRef(null);
    const locale = settings.locale;

    useEffect(() => {
        const h = () => {
            setRoute(getCurrentRoute());
            setMenuOpen(false);
            setCalcOpen(false);
            setSettingsOpen(false);
            window.scrollTo(0, 0);
            // Move screen-reader/keyboard focus to the new page (main is
            // tabindex=-1 so this never shows a focus ring on click nav).
            requestAnimationFrame(() => document.getElementById('main')?.focus({ preventScroll: true }));
        };
        window.addEventListener('popstate', h);
        return () => window.removeEventListener('popstate', h);
    }, []);
    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            const returnToSettings = settingsOpen;
            const returnToCalculators = calcOpen;
            setMenuOpen(false); setCalcOpen(false); setSettingsOpen(false);
            requestAnimationFrame(() => {
                if (returnToSettings) settingsButtonRef.current?.focus();
                else if (returnToCalculators) calcButtonRef.current?.focus();
            });
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
    useEffect(() => {
        if (!calcOpen && !settingsOpen) return;
        const onDown = (e) => {
            if (!e.target.closest('.nav-drop')) setCalcOpen(false);
            if (!e.target.closest('.settings-drop')) setSettingsOpen(false);
        };
        document.addEventListener('pointerdown', onDown);
        return () => document.removeEventListener('pointerdown', onDown);
    }, [calcOpen, settingsOpen]);
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
            retire: t(locale, 'nav.retire'),
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
        retire: html`<${Retire} settings=${settings} />`,
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
        { to: '/kalkulator/dana-pensiun', key: 'retire', labelKey: 'nav.retire', descKey: 'home.retireDesc' },
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
                    <div class="header-tools" role="group" aria-label=${t(locale, 'settings.groupLabel')}>
                        <div class="settings-drop">
                            <button ref=${settingsButtonRef} type="button" class="settings-toggle" title=${t(locale, 'settings.groupLabel')} aria-label=${t(locale, 'settings.groupLabel')} aria-haspopup="dialog" aria-expanded=${settingsOpen} aria-controls="settings-panel" onClick=${() => setSettingsOpen(!settingsOpen)}>
                                ${gearIcon}
                            </button>
                            ${settingsOpen && html`<div id="settings-panel" class="settings-drop__panel" role="dialog" aria-label=${t(locale, 'settings.groupLabel')}>
                                <label>${t(locale, 'settings.locale')}
                                    <select value=${locale} onChange=${e=>setSettings({...settings, locale:e.target.value})}>
                                        ${LOCALE_OPTIONS.map(o=> html`<option value=${o.value}>${o.label}</option>`)}
                                    </select>
                                </label>
                                <label>${t(locale, 'settings.currency')}
                                    <select value=${settings.currency} onChange=${e=>setSettings({...settings, currency:e.target.value})}>
                                        ${CURRENCY_OPTIONS.map(o=> html`<option value=${o.value}>${o.label}</option>`)}
                                    </select>
                                </label>
                                <label>${t(locale, 'settings.market')}
                                    <select value=${settings.market} onChange=${e=>setSettings({...settings, market:e.target.value})}>
                                        ${MARKET_OPTIONS.map(o=> html`<option value=${o.value}>${o.label}</option>`)}
                                    </select>
                                </label>
                                <label>${t(locale, 'settings.taxRate')} (%)
                                    <input type="number" min="0" max="100" step="1" value=${Math.round((settings.taxRate ?? 0.2) * 100)} onInput=${e => setSettings({ ...settings, taxRate: Math.max(0, Math.min(1, (Number(e.target.value) || 0) / 100)) })} />
                                </label>
                            </div>`}
                        </div>
                        <button type="button" class="theme-toggle" title=${t(locale, 'ui.theme')} aria-label=${dark ? t(locale, 'ui.themeToLight') : t(locale, 'ui.themeToDark')} aria-pressed=${dark} onClick=${() => setSettings({...settings, theme: dark ? 'light' : 'dark', themeExplicit: true})}>
                            ${dark ? sunIcon : moonIcon} ${dark ? t(locale, 'ui.themeLight') : t(locale, 'ui.themeDark')}
                        </button>
                    </div>
                    <button class="menu-toggle" aria-expanded=${menuOpen} aria-controls="primary-nav" aria-label=${t(locale, 'ui.menu')} onClick=${() => setMenuOpen(!menuOpen)}>
                        <span class=${menuOpen ? 'menu-icon open' : 'menu-icon'} aria-hidden="true"></span>
                    </button>
                    <nav id="primary-nav" class=${menuOpen ? 'topnav open' : 'topnav'} aria-label=${t(locale, 'ui.navLabel')}>
                        <a href="/" class=${route==='home'?'active':''} aria-current=${route==='home' ? 'page' : null} onClick=${e=>go(e, '/')}>${t(locale, 'nav.home')}</a>
                        <div class="nav-drop" onPointerEnter=${() => { if (window.matchMedia?.('(hover: hover)').matches) setCalcOpen(true); }} onPointerLeave=${() => { if (window.matchMedia?.('(hover: hover)').matches) setCalcOpen(false); }}>
                            <button ref=${calcButtonRef} type="button" class=${calcActive ? 'nav-drop__btn active' : 'nav-drop__btn'} aria-expanded=${calcOpen} aria-controls="calc-menu" onClick=${() => setCalcOpen(!calcOpen)} onKeyDown=${e => {
                                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    setCalcOpen(true);
                                    requestAnimationFrame(() => document.getElementById('calc-menu')?.querySelector('a')?.focus());
                                }
                            }}>
                                ${t(locale, 'nav.calculators')} <span class="nav-drop__chev" aria-hidden="true">${calcOpen ? '▴' : '▾'}</span>
                            </button>
                            ${calcOpen && html`<div id="calc-menu" class="nav-drop__panel" role="group" aria-label=${t(locale, 'nav.calculators')} onKeyDown=${e => {
                                const links = Array.from(e.currentTarget.querySelectorAll('a'));
                                const i = links.indexOf(document.activeElement);
                                if (e.key === 'ArrowDown') { e.preventDefault(); links[(i + 1) % links.length]?.focus(); }
                                else if (e.key === 'ArrowUp') { e.preventDefault(); links[(i - 1 + links.length) % links.length]?.focus(); }
                                else if (e.key === 'Home') { e.preventDefault(); links[0]?.focus(); }
                                else if (e.key === 'End') { e.preventDefault(); links[links.length - 1]?.focus(); }
                            }}>
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
                        <a href="/portofolio" class=${route==='portofolio'?'active topnav__portfolio':'topnav__portfolio'} aria-current=${route==='portofolio' ? 'page' : null} onClick=${e=>go(e, '/portofolio')}>${t(locale, 'nav.portfolio')}</a>
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
