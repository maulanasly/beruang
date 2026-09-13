import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { navigate } from '../router.js';

const CALCS = [
    { path: '/kalkulator/reksa-dana', titleKey: 'home.calcMfTitle', descKey: 'home.calcMfDesc' },
    { path: '/kalkulator/saham', titleKey: 'home.calcStocksTitle', descKey: 'home.calcStocksDesc' },
    { path: '/kalkulator/deposito', titleKey: 'home.calcTdTitle', descKey: 'home.calcTdDesc' },
];

export function Landing({ settings }) {
    const locale = settings.locale;
    const go = (e, path) => { e.preventDefault(); navigate(path); };
    return html`<div>
        <section class="card hero">
            <p class="smallcaps">${t(locale, 'home.eyebrow')}</p>
            <h1>${t(locale, 'home.title')}</h1>
            <p class="muted hero-sub">${t(locale, 'home.subtitle')}</p>
            <div class="hero-cta">
                <button onClick=${e => go(e, '/overview')}>${t(locale, 'home.ctaApp')}</button>
                <button class="btn-ghost" onClick=${e => go(e, '/kalkulator/saham')}>${t(locale, 'home.ctaCalc')}</button>
            </div>
        </section>
        <section aria-label=${t(locale, 'home.calcsLabel')}>
            <div class="summary-cards">
                ${CALCS.map(c => html`<article class="card">
                    <h2 style="margin:0 0 4px; font-size:17px"><a href=${c.path} onClick=${e => go(e, c.path)}>${t(locale, c.titleKey)}</a></h2>
                    <p class="muted" style="font-size:13px; margin:0">${t(locale, c.descKey)}</p>
                </article>`)}
            </div>
        </section>
        <section class="card">
            <h2 style="margin:0 0 8px; font-size:17px">${t(locale, 'home.stepsTitle')}</h2>
            <ol class="steps">
                <li><strong>${t(locale, 'home.step1Title')}</strong><br><span class="muted">${t(locale, 'home.step1Desc')}</span></li>
                <li><strong>${t(locale, 'home.step2Title')}</strong><br><span class="muted">${t(locale, 'home.step2Desc')}</span></li>
                <li><strong>${t(locale, 'home.step3Title')}</strong><br><span class="muted">${t(locale, 'home.step3Desc')}</span></li>
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
