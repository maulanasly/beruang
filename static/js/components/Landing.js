import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { navigate } from '../router.js';
import { SAMPLE_MF, SAMPLE_STOCKS, SAMPLE_TD, loadLedgers } from '../store.js';
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

// Intent router: one click per question, asked in the user's own words.
const QUESTIONS = [
    { qKey: 'home.qMf', route: 'mutual-funds', path: '/kalkulator/reksa-dana', sample: null },
    { qKey: 'home.qStocks', route: 'stocks', path: '/kalkulator/saham', sample: null },
    { qKey: 'home.qTd', route: 'term-deposits', path: '/kalkulator/deposito', sample: null },
    { qKey: 'home.qFlat', route: 'flat-loan', path: '/kalkulator/bunga-flat', sample: 'flat-loan' },
    { qKey: 'home.qDebt', route: 'debt-payoff', path: '/kalkulator/lunas-utang', sample: 'debt-payoff' },
    { qKey: 'home.qEv', route: 'ev', path: '/kalkulator/mobil-listrik', sample: 'ev' },
    { qKey: 'home.qRentBuy', route: 'rent-buy', path: '/kalkulator/sewa-vs-beli', sample: 'rent-buy' },
    { qKey: 'home.qRetire', route: 'retire', path: '/kalkulator/dana-pensiun', sample: 'retire' },
];

const SAMPLE_BY_ROUTE = Object.fromEntries(GROUPS.flatMap(g => g.items).map(it => [it.route, it.sample]));

const TRUST = ['home.trustNoSignup', 'home.trustLocal', 'home.trustExact', 'home.trustAdj'];
const FAQS = [['home.faq1q', 'home.faq1a'], ['home.faq2q', 'home.faq2a'], ['home.faq3q', 'home.faq3a'], ['home.faq4q', 'home.faq4a']];

function calcRow(item, go, goUrl, locale) {
    const url = buildShareUrl(item.route, item.sample());
    return html`<div class="calc-index__row">
        <span class="calc-index__icon"><${CaseIcon} kind=${item.route} /></span>
        <div class="calc-index__body">
            <a class="calc-index__title" href=${item.path} onClick=${e => go(e, item.path)}>${t(locale, item.titleKey)}</a>
            <span class="muted calc-index__desc">${t(locale, item.descKey)}</span>
        </div>
        <div class="calc-index__actions">
            <a href=${url} onClick=${e => goUrl(e, url)}>${t(locale, 'home.cardOpenSample')}</a>
            <a class="muted" href=${item.path} onClick=${e => go(e, item.path)}>${t(locale, 'home.cardOpenBlank')}</a>
        </div>
    </div>`;
}

export function Landing({ settings }) {
    const locale = settings.locale;
    const go = (e, path) => { e.preventDefault(); navigate(path); };
    const goUrl = (e, url) => {
        e.preventDefault();
        const u = new URL(url, window.location.origin);
        navigate(u.pathname + u.search);
    };
    const ledgers = loadLedgers();
    const hasPortfolio = Boolean(
        ledgers['mutual-funds']?.length || ledgers.stocks?.length || ledgers['term-deposits']?.entries?.length,
    );
    // New visitors get the worked example; returning visitors get their portfolio.
    const samplePath = buildShareUrl('mutual-funds', { entries: SAMPLE_MF });
    const primary = hasPortfolio
        ? { to: '/portofolio', labelKey: 'home.ctaApp', sample: false }
        : { to: samplePath, labelKey: 'home.ctaCalc', sample: true };
    const secondary = hasPortfolio
        ? { to: '/kalkulator/reksa-dana', labelKey: 'home.ctaNew', sample: false }
        : { to: '/portofolio', labelKey: 'home.ctaApp', sample: false };
    const openCta = (e, cta) => (cta.sample ? goUrl(e, cta.to) : go(e, cta.to));

    return html`<div>
        <section class="home-top">
            <div class="masthead__copy home-top__copy">
                <p class="smallcaps">${t(locale, 'home.eyebrow')}</p>
                <h1>${t(locale, 'home.title')}</h1>
                <p class="muted masthead__sub">${t(locale, 'home.subtitle')}</p>
                <div class="masthead__cta">
                    <a class="btn-primary" href=${primary.to} onClick=${e => openCta(e, primary)}>${t(locale, primary.labelKey)}</a>
                    <a class="masthead__cta-link" href=${secondary.to} onClick=${e => openCta(e, secondary)}>${t(locale, secondary.labelKey)}</a>
                </div>
            </div>

            <div class="home-top__visual">
                <${HeroCalc} settings=${settings} />
            </div>

            <section class="card home-questions" aria-label=${t(locale, 'home.questionsTitle')}>
                <h2 style="margin:0; font-size:17px">${t(locale, 'home.questionsTitle')}</h2>
                <div class="home-questions__chips">
                    ${QUESTIONS.map(q => {
                        const sample = q.sample ? SAMPLE_BY_ROUTE[q.sample] : null;
                        const url = sample ? buildShareUrl(q.route, sample()) : q.path;
                        const open = sample ? (e => goUrl(e, url)) : (e => go(e, url));
                        return html`<a class="trust-badge" href=${url} onClick=${open}>${t(locale, q.qKey)} →</a>`;
                    })}
                </div>
            </section>
        </section>

        <${StatStrip} settings=${settings} />

        <section class="card calc-index" aria-label=${t(locale, 'home.calcsLabel')}>
            <p class="smallcaps" style="margin:0">${t(locale, 'home.calcsLabel')}</p>
            ${GROUPS.map(g => html`<div class="calc-index__group">
                <p class="smallcaps calc-index__group-label">${t(locale, g.labelKey)}</p>
                ${g.items.map(it => calcRow(it, go, goUrl, locale))}
            </div>`)}
        </section>

        <${ConceptBand} settings=${settings} go=${go} />

        <section class="card">
            <div class="trust-row">
                ${TRUST.map(k => html`<a class="trust-badge" href="#method">✓ ${t(locale, k)}</a>`)}
            </div>
            <details class="faq" style="margin-top:12px">
                <summary>${t(locale, 'home.faqTitle')}</summary>
                ${FAQS.map(([q, a]) => html`<details class="faq"><summary>${t(locale, q)}</summary><p class="muted" style="font-size:13px">${t(locale, a)}</p></details>`)}
            </details>
            <div id="method" style="margin-top:12px">
                <h2 style="margin:0 0 8px; font-size:17px">${t(locale, 'method.title')}</h2>
                <p class="muted" style="font-size:13px; margin:0 0 6px">${t(locale, 'method.xirr')}</p>
                <p class="muted" style="font-size:13px; margin:0 0 6px">${t(locale, 'method.adjClose')}</p>
                <p class="muted" style="font-size:13px; margin:0 0 6px">${t(locale, 'method.flat')}</p>
                <p class="muted" style="font-size:13px; margin:0 0 6px">${t(locale, 'method.wealth')}</p>
                <p class="muted" style="font-size:13px; margin:0 0 6px">${t(locale, 'method.retire')}</p>
                <p class="muted" style="font-size:13px; margin:0">${t(locale, 'method.disclaimer')}</p>
            </div>
        </section>
    </div>`;
}
