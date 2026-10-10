import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { navigate } from '../router.js';
import { SAMPLE_MF, SAMPLE_STOCKS, SAMPLE_TD } from '../store.js';
import { buildShareUrl } from '../share.js';
import { HeroCalc } from './HeroCalc.js';
import { StatStrip, ConceptBand } from './HomeVisuals.js';
import { CaseIcon } from './Icons.js';

// One canonical discovery surface: grouped rows, one per calculator.
// Every entry ships a worked sample plus a blank path; the chips above are
// the same tools phrased as questions.
const GROUPS = [
    {
        labelKey: 'home.groupInvest',
        items: [
            { route: 'mutual-funds', path: '/kalkulator/reksa-dana', titleKey: 'home.calcMfTitle', descKey: 'home.calcMfDesc', sample: () => ({ entries: SAMPLE_MF }) },
            { route: 'stocks', path: '/kalkulator/saham', titleKey: 'home.calcStocksTitle', descKey: 'home.calcStocksDesc', sample: () => ({ entries: SAMPLE_STOCKS }) },
            { route: 'term-deposits', path: '/kalkulator/deposito', titleKey: 'home.calcTdTitle', descKey: 'home.calcTdDesc', sample: () => ({ entries: SAMPLE_TD.entries, apy: SAMPLE_TD.apy }) },
            {
                route: 'bonds', path: '/kalkulator/obligasi', titleKey: 'home.calcBondsTitle', descKey: 'home.calcBondsDesc',
                sample: () => ({ inputs: { nominal: 10000000, coupon_annual: 6.9, tenor_months: 36, price_pct: 100, tax_rate: 10, rates_pct: 1 } }),
            },
        ],
    },
    {
        labelKey: 'home.groupCredit',
        items: [
            {
                route: 'flat-loan', path: '/kalkulator/bunga-flat', titleKey: 'home.flatTitle', descKey: 'home.flatDesc',
                sample: () => ({ inputs: { price: 150000000, down_payment: 30000000, flat_rate_annual: 5, tenor_months: 35, upfront_fees: 1500000, rates_pct: 1 } }),
            },
            {
                route: 'debt-payoff', path: '/kalkulator/lunas-utang', titleKey: 'home.debtTitle', descKey: 'home.debtDesc',
                sample: () => ({
                    inputs: {
                        debts: [
                            { name: 'Paylater', balance: 12000000, annual_rate: 36, rate_kind: 'effective', tenor_months: 12, min_payment: 1000000 },
                            { name: 'Motor', balance: 20000000, annual_rate: 8, rate_kind: 'flat', tenor_months: 24, min_payment: 0 },
                        ],
                        extra_payment: 1000000, rates_pct: 1,
                    },
                }),
            },
        ],
    },
    {
        labelKey: 'home.groupCompare',
        items: [
            {
                route: 'ev', path: '/kalkulator/mobil-listrik', titleKey: 'home.evTitle', descKey: 'home.evDesc',
                sample: () => ({
                    inputs: {
                        price_ice: 250000000, price_ev: 300000000, km_per_month: 1500,
                        fuel_price_per_liter: 10000, fuel_km_per_liter: 12,
                        electricity_price_per_kwh: 1444, ev_kwh_per_100km: 15,
                        service_ice_per_month: 500000, service_ev_per_month: 200000,
                    },
                }),
            },
            {
                route: 'rent-buy', path: '/kalkulator/sewa-vs-beli', titleKey: 'home.rentBuyTitle', descKey: 'home.rentBuyDesc',
                sample: () => ({
                    inputs: {
                        house_price: 800000000, down_payment: 160000000, dp_mode: 'amount', dp_percent: 20,
                        mortgage_rate_annual: 7, tenor_years: 20, rent_per_month: 3000000, other_buy_costs_per_month: 500000,
                        home_appreciation_annual: 4, rent_growth_annual: 3, other_growth_annual: 3, invest_return_annual: 8,
                        closing_costs: 0, selling_cost_rate: 5, wait_years: 0, gross_monthly_income: 0, rates_pct: 1,
                    },
                }),
            },
            {
                route: 'retire', path: '/kalkulator/dana-pensiun', titleKey: 'home.retireTitle', descKey: 'home.retireDesc',
                sample: () => ({
                    inputs: {
                        years_to_retire: 20, monthly_need_today: 10000000, inflation_annual: 4, invest_return_annual: 8,
                        current_savings: 100000000, withdrawal_rate: 4, current_monthly_invest: 2000000, rates_pct: 1,
                    },
                }),
            },
        ],
    },
];

// Trust badges point at the specific FAQ or method section that backs them.
const TRUST = [
    ['home.trustLocal', '#faq-server'],
    ['home.trustExact', '#method'],
    ['home.trustAdvice', '#faq-advice'],
];
const FAQS = [
    ['faq-server', 'home.faq1q', 'home.faq1a'],
    ['faq-xirr', 'home.faq2q', 'home.faq2a'],
    ['faq-prices', 'home.faq3q', 'home.faq3a'],
    ['faq-advice', 'home.faq4q', 'home.faq4a'],
    ['faq-start', 'home.faq5q', 'home.faq5a'],
];

function calcRow(item, go, goUrl, locale) {
    const url = buildShareUrl(item.route, item.sample());
    return html`<div class="calc-index__row">
        <span class="calc-index__icon"><${CaseIcon} kind=${item.route} /></span>
        <div class="calc-index__body">
            <h3 class="calc-index__title">${t(locale, item.titleKey)}</h3>
            <span class="muted calc-index__desc">${t(locale, item.descKey)}</span>
        </div>
        <div class="calc-index__actions">
            <a class="calc-index__sample" href=${url} onClick=${e => goUrl(e, url)}>${t(locale, 'home.cardOpenSample')}</a>
            <a class="calc-index__blank" href=${item.path} onClick=${e => go(e, item.path)}>${t(locale, 'home.cardOpenBlank')}</a>
        </div>
    </div>`;
}

export function Landing({ settings }) {
    const locale = settings.locale;
    const letBrowserHandle = (e) => e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
    const go = (e, path) => {
        if (letBrowserHandle(e)) return;
        e.preventDefault();
        navigate(path);
    };
    const goUrl = (e, url) => {
        if (letBrowserHandle(e)) return;
        e.preventDefault();
        const u = new URL(url, window.location.origin);
        navigate(u.pathname + u.search);
    };
    // Design read: retail-investing homepage in a calm ledger language,
    // ENERGY 1 / RHYTHM 2 / MOTION 1; calculation is primary, browsing secondary.
    return html`<div>
        <section class="home-top">
            <div class="masthead__copy home-top__copy">
                <p class="smallcaps">${t(locale, 'home.eyebrow')}</p>
                <h1>${t(locale, 'home.title')}</h1>
                <p class="muted masthead__sub">${t(locale, 'home.subtitle')}</p>
                <div class="masthead__cta">
                    <a class="masthead__cta-link" href="#calculator-index">${t(locale, 'home.ctaBrowse')}</a>
                </div>
            </div>

            <div class="home-top__visual">
                <${HeroCalc} settings=${settings} />
            </div>

        </section>

        <${StatStrip} settings=${settings} />

        <section class="card calc-index" id="calculator-index" aria-label=${t(locale, 'home.calcsLabel')}>
            <h2 class="calc-index__heading">${t(locale, 'home.calcsLabel')}</h2>
            ${GROUPS.map(g => html`<div class="calc-index__group">
                <h3 class="smallcaps calc-index__group-label">${t(locale, g.labelKey)}</h3>
                ${g.items.map(it => calcRow(it, go, goUrl, locale))}
            </div>`)}
        </section>

        <${ConceptBand} settings=${settings} go=${go} />

        <section class="card" id="faq">
            <div class="trust-row">
                ${TRUST.map(([key, anchor]) => html`<a class="trust-badge" href=${anchor} onClick=${anchor === '#method' ? () => { const method = document.getElementById('method'); if (method) method.open = true; } : null}>✓ ${t(locale, key)}</a>`)}
            </div>
            <h2 class="faq-heading">${t(locale, 'home.faqTitle')}</h2>
            <div class="faq-list">
                ${FAQS.map(([id, q, a]) => html`<details class="faq" id=${id}>
                    <summary>${t(locale, q)}</summary>
                    <p class="muted" style="font-size:13px">${t(locale, a)}</p>
                </details>`)}
            </div>
            <details class="method" id="method">
                <summary>${t(locale, 'method.title')}</summary>
                <p class="muted" style="font-size:13px; margin:8px 0 6px">${t(locale, 'method.xirr')}</p>
                <p class="muted" style="font-size:13px; margin:0 0 6px">${t(locale, 'method.adjClose')}</p>
                <p class="muted" style="font-size:13px; margin:0 0 6px">${t(locale, 'method.flat')}</p>
                <p class="muted" style="font-size:13px; margin:0 0 6px">${t(locale, 'method.wealth')}</p>
                <p class="muted" style="font-size:13px; margin:0 0 6px">${t(locale, 'method.retire')}</p>
                <p class="muted" style="font-size:13px; margin:0">${t(locale, 'method.disclaimer')}</p>
            </details>
        </section>
    </div>`;
}
