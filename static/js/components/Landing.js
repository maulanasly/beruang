import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { navigate } from '../router.js';
import { SAMPLE_MF, SAMPLE_STOCKS, SAMPLE_TD } from '../store.js';
import { buildShareUrl } from '../share.js';
import { HeroCalc } from './HeroCalc.js';

const INVEST = [
    { route: 'mutual-funds', path: '/kalkulator/reksa-dana', titleKey: 'home.calcMfTitle', descKey: 'home.calcMfDesc', exKey: 'home.cardExampleMf', sample: () => ({ entries: SAMPLE_MF }) },
    { route: 'stocks', path: '/kalkulator/saham', titleKey: 'home.calcStocksTitle', descKey: 'home.calcStocksDesc', exKey: 'home.cardExampleStocks', sample: () => ({ entries: SAMPLE_STOCKS }) },
    { route: 'term-deposits', path: '/kalkulator/deposito', titleKey: 'home.calcTdTitle', descKey: 'home.calcTdDesc', exKey: 'home.cardExampleTd', sample: () => ({ entries: SAMPLE_TD.entries, apy: SAMPLE_TD.apy }) },
];

// Comparison calculators with one-click sample inputs (percent rates +
// rates_pct marker, matching each page's share-restore contract).
const CREDIT = [
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
];

const COMPARE = [
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

const SAMPLE_BY_ROUTE = Object.fromEntries([...CREDIT, ...COMPARE].map(c => [c.route, c.sample]));

const TRUST = ['home.trustNoSignup', 'home.trustLocal', 'home.trustExact', 'home.trustAdj'];
const FAQS = [['home.faq1q', 'home.faq1a'], ['home.faq2q', 'home.faq2a'], ['home.faq3q', 'home.faq3a'], ['home.faq4q', 'home.faq4a']];

function sparkline() {
    // Static proof figure: the Rp1M x 12 -> Rp13.2M sample (XIRR 22.6%/yr).
    const pts = [[8, 60], [56, 53], [104, 46], [152, 40], [200, 33], [248, 22]];
    const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
    return html`<svg viewBox="0 0 256 72" width="100%" height="72" role="img" aria-hidden="true" style="background:var(--paper);border:1px solid var(--hairline);border-radius:8px; margin-top:10px">
        <path d=${d} fill="none" style="stroke:var(--accent)" stroke-width="2.5" />
        ${pts.map(([x, y]) => html`<circle cx=${x} cy=${y} r="3" style="fill:var(--ledger)" />`)}
    </svg>`;
}

function calcCard(c, go, goUrl, locale) {
    const url = buildShareUrl(c.route, c.sample());
    return html`<article class="card">
        <h2 style="margin:0 0 4px; font-size:17px"><a href=${c.path} onClick=${e => go(e, c.path)}>${t(locale, c.titleKey)}</a></h2>
        <p class="muted" style="font-size:13px; margin:0 0 8px">${t(locale, c.descKey)}</p>
        ${c.exKey && html`<p class="muted" style="font-size:12px; margin:0 0 8px">${t(locale, c.exKey)}</p>`}
        <p style="margin:0; display:flex; gap:12px; font-size:13px">
            <a href=${url} onClick=${e => goUrl(e, url)}>${t(locale, 'home.cardOpenSample')}</a>
            <a href=${c.path} onClick=${e => go(e, c.path)} class="muted">${t(locale, 'home.cardOpenBlank')}</a>
        </p>
    </article>`;
}

export function Landing({ settings }) {
    const locale = settings.locale;
    const go = (e, path) => { e.preventDefault(); navigate(path); };
    const goUrl = (e, url) => {
        e.preventDefault();
        const u = new URL(url, window.location.origin);
        navigate(u.pathname + u.search);
    };
    return html`<div>
        <section class="card hero">
            <p class="smallcaps">${t(locale, 'home.eyebrow')}</p>
            <h1>${t(locale, 'home.title')}</h1>
            <p class="muted hero-sub">${t(locale, 'home.subtitle')}</p>
            <div class="hero-proof">
                <div>
                    <p class="muted" style="font-size:13px; margin:0">${t(locale, 'home.heroProofCaption')}</p>
                    ${sparkline()}
                </div>
                <${HeroCalc} settings=${settings} />
            </div>
            <div class="hero-cta">
                <button onClick=${e => go(e, '/kalkulator/reksa-dana')}>${t(locale, 'home.ctaCalc')}</button>
                <button class="btn-ghost" onClick=${e => go(e, '/portofolio')}>${t(locale, 'home.ctaApp')}</button>
            </div>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:12px">
                <span class="muted" style="font-size:12px">${t(locale, 'home.popularLabel')}</span>
                ${[['/kalkulator/bunga-flat', 'nav.flatLoan'], ['/kalkulator/lunas-utang', 'nav.debtPayoff'], ['/kalkulator/dana-pensiun', 'nav.retire']].map(([path, labelKey]) => html`<a href=${path} onClick=${e => go(e, path)} style="font-size:12px; color:#fff">${t(locale, labelKey)} →</a>`)}
            </div>
        </section>
        <section class="card" aria-label=${t(locale, 'home.questionsTitle')}>
            <h2 style="margin:0; font-size:17px">${t(locale, 'home.questionsTitle')}</h2>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px">
                ${QUESTIONS.map(q => {
                    const sample = q.sample ? SAMPLE_BY_ROUTE[q.sample] : null;
                    const url = sample ? buildShareUrl(q.route, sample()) : q.path;
                    const open = sample ? (e => goUrl(e, url)) : (e => go(e, url));
                    return html`<a class="trust-badge" href=${url} onClick=${open}>${t(locale, q.qKey)} →</a>`;
                })}
            </div>
        </section>
        <section aria-label=${t(locale, 'home.calcsLabel')}>
            <p class="smallcaps" style="margin:14px 0 8px">${t(locale, 'home.groupInvest')}</p>
            <div class="summary-cards">
                ${INVEST.map(c => calcCard(c, go, goUrl, locale))}
            </div>
            <p class="smallcaps" style="margin:14px 0 8px">${t(locale, 'home.groupCredit')}</p>
            <div class="summary-cards">
                ${CREDIT.map(c => calcCard(c, go, goUrl, locale))}
            </div>
            <p class="smallcaps" style="margin:14px 0 8px">${t(locale, 'home.groupCompare')}</p>
            <div class="summary-cards">
                ${COMPARE.map(c => calcCard(c, go, goUrl, locale))}
            </div>
            <div class="summary-cards">
                <article class="card">
                    <h2 style="margin:0 0 4px; font-size:17px"><a href="/portofolio" onClick=${e => go(e, '/portofolio')}>${t(locale, 'nav.portfolio')}</a></h2>
                    <p class="muted" style="font-size:13px; margin:0">${t(locale, 'overview.subtitle')}</p>
                </article>
            </div>
        </section>
        <section class="card">
            <div class="trust-row">
                ${TRUST.map(k => html`<a class="trust-badge" href="#method">✓ ${t(locale, k)}</a>`)}
            </div>
            <details class="faq" style="margin-top:12px">
                <summary>${t(locale, 'home.stepsTitle')}</summary>
                <ol class="steps">
                    <li><strong>${t(locale, 'home.step1Title')}</strong><br /><span class="muted">${t(locale, 'home.step1Desc')}</span></li>
                    <li><strong>${t(locale, 'home.step2Title')}</strong><br /><span class="muted">${t(locale, 'home.step2Desc')}</span></li>
                    <li><strong>${t(locale, 'home.step3Title')}</strong><br /><span class="muted">${t(locale, 'home.step3Desc')}</span></li>
                </ol>
            </details>
            <details class="faq">
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
