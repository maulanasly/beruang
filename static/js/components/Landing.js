import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { navigate } from '../router.js';
import { SAMPLE_MF, SAMPLE_STOCKS, SAMPLE_TD } from '../store.js';
import { buildShareUrl } from '../share.js';
import { HeroCalc } from './HeroCalc.js';

const CALCS = [
    { route: 'mutual-funds', path: '/kalkulator/reksa-dana', titleKey: 'home.calcMfTitle', descKey: 'home.calcMfDesc', exKey: 'home.cardExampleMf', sample: () => ({ entries: SAMPLE_MF }) },
    { route: 'stocks', path: '/kalkulator/saham', titleKey: 'home.calcStocksTitle', descKey: 'home.calcStocksDesc', exKey: 'home.cardExampleStocks', sample: () => ({ entries: SAMPLE_STOCKS }) },
    { route: 'term-deposits', path: '/kalkulator/deposito', titleKey: 'home.calcTdTitle', descKey: 'home.calcTdDesc', exKey: 'home.cardExampleTd', sample: () => ({ entries: SAMPLE_TD.entries, apy: SAMPLE_TD.apy }) },
];

const QUESTIONS = [
    { route: 'mutual-funds', titleKey: 'home.qMf', path: '/kalkulator/reksa-dana', sample: () => ({ entries: SAMPLE_MF }) },
    { route: 'stocks', titleKey: 'home.qStocks', path: '/kalkulator/saham', sample: () => ({ entries: SAMPLE_STOCKS }) },
    { route: 'term-deposits', titleKey: 'home.qTd', path: '/kalkulator/deposito', sample: () => ({ entries: SAMPLE_TD.entries, apy: SAMPLE_TD.apy }) },
    { route: 'ev', titleKey: 'home.qEv', path: '/kalkulator/mobil-listrik', sample: null },
];

const TRUST = ['home.trustNoSignup', 'home.trustLocal', 'home.trustExact', 'home.trustAdj'];
const FAQS = [['home.faq1q', 'home.faq1a'], ['home.faq2q', 'home.faq2a'], ['home.faq3q', 'home.faq3a']];

function sparkline() {
    // Static proof figure: the Rp1M x 12 -> Rp13.2M sample (XIRR 22.6%/yr).
    const pts = [[8, 60], [56, 53], [104, 46], [152, 40], [200, 33], [248, 22]];
    const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
    return html`<svg viewBox="0 0 256 72" width="100%" height="72" role="img" aria-hidden="true" style="background:var(--paper);border:1px solid var(--hairline);border-radius:8px; margin-top:10px">
        <path d=${d} fill="none" style="stroke:var(--accent)" stroke-width="2.5" />
        ${pts.map(([x, y]) => html`<circle cx=${x} cy=${y} r="3" style="fill:var(--ledger)" />`)}
    </svg>`;
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
                <button onClick=${e => go(e, '/kalkulator/saham')}>${t(locale, 'home.ctaCalc')}</button>
                <button class="btn-ghost" onClick=${e => go(e, '/portofolio')}>${t(locale, 'home.ctaApp')}</button>
            </div>
        </section>
        <section aria-label=${t(locale, 'home.calcsLabel')}>
            <div class="summary-cards">
                ${CALCS.map(c => html`<article class="card">
                    <h2 style="margin:0 0 4px; font-size:17px"><a href=${c.path} onClick=${e => go(e, c.path)}>${t(locale, c.titleKey)}</a></h2>
                    <p class="muted" style="font-size:13px; margin:0 0 8px">${t(locale, c.descKey)}</p>
                    <p class="muted" style="font-size:12px; margin:0 0 8px">${t(locale, c.exKey)}</p>
                    <p style="margin:0; display:flex; gap:12px; font-size:13px">
                        <a href=${buildShareUrl(c.route, c.sample())} onClick=${e => goUrl(e, buildShareUrl(c.route, c.sample()))}>${t(locale, 'home.cardOpenSample')}</a>
                        <a href=${c.path} onClick=${e => go(e, c.path)} class="muted">${t(locale, 'home.cardOpenBlank')}</a>
                    </p>
                </article>`)}
            </div>
            <div class="summary-cards">
                <article class="card">
                    <h2 style="margin:0 0 4px; font-size:17px"><a href="/portofolio" onClick=${e => go(e, '/portofolio')}>${t(locale, 'nav.portfolio')}</a></h2>
                    <p class="muted" style="font-size:13px; margin:0">${t(locale, 'overview.subtitle')}</p>
                </article>
                <article class="card" aria-label=${t(locale, 'home.evTitle')}>
                    <h2 style="margin:0 0 4px; font-size:17px"><a href="/kalkulator/mobil-listrik" onClick=${e => go(e, '/kalkulator/mobil-listrik')}>${t(locale, 'home.evTitle')}</a></h2>
                    <p class="muted" style="font-size:13px; margin:0">${t(locale, 'home.evDesc')}</p>
                </article>
            </div>
        </section>
        <section class="card">
            <h2 style="margin:0 0 8px; font-size:17px">${t(locale, 'home.questionsTitle')}</h2>
            <ul class="question-list">
                ${QUESTIONS.map(q => {
                    const url = q.sample ? buildShareUrl(q.route, q.sample()) : q.path;
                    return html`<li><a href=${url} onClick=${e => goUrl(e, url)}>${t(locale, q.titleKey)}</a></li>`;
                })}
            </ul>
        </section>
        <section class="card" aria-label=${t(locale, 'home.eyebrow')}>
            <div class="trust-row">
                ${TRUST.map(k => html`<span class="trust-badge">✓ ${t(locale, k)}</span>`)}
            </div>
        </section>
        <section class="card">
            <h2 style="margin:0 0 8px; font-size:17px">${t(locale, 'home.faqTitle')}</h2>
            ${FAQS.map(([q, a]) => html`<details class="faq"><summary>${t(locale, q)}</summary><p class="muted" style="font-size:13px">${t(locale, a)}</p></details>`)}
        </section>
        <section class="card">
            <h2 style="margin:0 0 8px; font-size:17px">${t(locale, 'home.stepsTitle')}</h2>
            <ol class="steps">
                <li><strong>${t(locale, 'home.step1Title')}</strong><br /><span class="muted">${t(locale, 'home.step1Desc')}</span></li>
                <li><strong>${t(locale, 'home.step2Title')}</strong><br /><span class="muted">${t(locale, 'home.step2Desc')}</span></li>
                <li><strong>${t(locale, 'home.step3Title')}</strong><br /><span class="muted">${t(locale, 'home.step3Desc')}</span></li>
            </ol>
        </section>
        <section class="card">
            <h2 style="margin:0 0 8px; font-size:17px">${t(locale, 'method.title')}</h2>
            <p class="muted" style="font-size:13px; margin:0 0 6px">${t(locale, 'method.xirr')}</p>
            <p class="muted" style="font-size:13px; margin:0 0 6px">${t(locale, 'method.adjClose')}</p>
            <p class="muted" style="font-size:13px; margin:0">${t(locale, 'method.disclaimer')}</p>
        </section>
    </div>`;
}
