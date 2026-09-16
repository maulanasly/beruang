import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { navigate } from '../router.js';

// Cross-calculator funnel: every result block points at the other tools.
const LINKS = {
    'mutual-funds': [
        { path: '/kalkulator/saham', titleKey: 'related.toStocks', descKey: 'related.toStocksDesc' },
        { path: '/kalkulator/deposito', titleKey: 'related.toDeposits', descKey: 'related.toDepositsDesc' },
        { path: '/kalkulator/mobil-listrik', titleKey: 'related.toEv', descKey: 'related.toEvDesc' },
        { path: '/kalkulator/sewa-vs-beli', titleKey: 'related.toRentBuy', descKey: 'related.toRentBuyDesc' },
        { path: '/kalkulator/bunga-flat', titleKey: 'related.toFlatLoan', descKey: 'related.toFlatLoanDesc' },
    ],
    stocks: [
        { path: '/kalkulator/reksa-dana', titleKey: 'related.toMf', descKey: 'related.toMfDesc' },
        { path: '/kalkulator/deposito', titleKey: 'related.toDeposits', descKey: 'related.toDepositsDesc' },
        { path: '/kalkulator/mobil-listrik', titleKey: 'related.toEv', descKey: 'related.toEvDesc' },
        { path: '/kalkulator/sewa-vs-beli', titleKey: 'related.toRentBuy', descKey: 'related.toRentBuyDesc' },
        { path: '/kalkulator/bunga-flat', titleKey: 'related.toFlatLoan', descKey: 'related.toFlatLoanDesc' },
    ],
    'term-deposits': [
        { path: '/kalkulator/reksa-dana', titleKey: 'related.toMf', descKey: 'related.toMfDesc' },
        { path: '/kalkulator/saham', titleKey: 'related.toStocks', descKey: 'related.toStocksDesc' },
        { path: '/kalkulator/mobil-listrik', titleKey: 'related.toEv', descKey: 'related.toEvDesc' },
        { path: '/kalkulator/sewa-vs-beli', titleKey: 'related.toRentBuy', descKey: 'related.toRentBuyDesc' },
        { path: '/kalkulator/bunga-flat', titleKey: 'related.toFlatLoan', descKey: 'related.toFlatLoanDesc' },
    ],
    ev: [
        { path: '/kalkulator/reksa-dana', titleKey: 'related.toMf', descKey: 'related.toMfDesc' },
        { path: '/kalkulator/saham', titleKey: 'related.toStocks', descKey: 'related.toStocksDesc' },
        { path: '/kalkulator/deposito', titleKey: 'related.toDeposits', descKey: 'related.toDepositsDesc' },
        { path: '/kalkulator/sewa-vs-beli', titleKey: 'related.toRentBuy', descKey: 'related.toRentBuyDesc' },
        { path: '/kalkulator/bunga-flat', titleKey: 'related.toFlatLoan', descKey: 'related.toFlatLoanDesc' },
    ],
    'rent-buy': [
        { path: '/kalkulator/reksa-dana', titleKey: 'related.toMf', descKey: 'related.toMfDesc' },
        { path: '/kalkulator/saham', titleKey: 'related.toStocks', descKey: 'related.toStocksDesc' },
        { path: '/kalkulator/deposito', titleKey: 'related.toDeposits', descKey: 'related.toDepositsDesc' },
        { path: '/kalkulator/mobil-listrik', titleKey: 'related.toEv', descKey: 'related.toEvDesc' },
        { path: '/kalkulator/bunga-flat', titleKey: 'related.toFlatLoan', descKey: 'related.toFlatLoanDesc' },
    ],
    'flat-loan': [
        { path: '/kalkulator/reksa-dana', titleKey: 'related.toMf', descKey: 'related.toMfDesc' },
        { path: '/kalkulator/saham', titleKey: 'related.toStocks', descKey: 'related.toStocksDesc' },
        { path: '/kalkulator/deposito', titleKey: 'related.toDeposits', descKey: 'related.toDepositsDesc' },
        { path: '/kalkulator/mobil-listrik', titleKey: 'related.toEv', descKey: 'related.toEvDesc' },
        { path: '/kalkulator/sewa-vs-beli', titleKey: 'related.toRentBuy', descKey: 'related.toRentBuyDesc' },
    ],
};

export function RelatedCalcs({ current, settings }) {
    const locale = settings.locale;
    const links = LINKS[current] || [];
    if (!links.length) return html``;
    const go = (e, path) => { e.preventDefault(); navigate(path); };
    return html`<section class="card" aria-label=${t(locale, 'related.title')}>
        <div class="smallcaps" style="margin-bottom:8px">${t(locale, 'related.title')}</div>
        <div class="summary-cards" style="margin-bottom:0">
            ${links.map(l => html`<a href=${l.path} onClick=${e => go(e, l.path)} class="card" style="margin:0; text-decoration:none; color:inherit; display:block">
                <div style="font-weight:700; font-size:14px">${t(locale, l.titleKey)} →</div>
                <div class="muted" style="font-size:12px">${t(locale, l.descKey)}</div>
            </a>`)}
        </div>
        <p style="margin:10px 0 0; font-size:13px"><a href="/portofolio" onClick=${e => go(e, '/portofolio')}>${t(locale, 'nav.portfolio')} →</a></p>
    </section>`;
}
