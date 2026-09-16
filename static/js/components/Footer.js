import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { navigate } from '../router.js';

// Compact modern footer: one flex band (brand · inline nav) plus a
// single-line data note. Canonical order matches the header.
export function Footer({ settings }) {
    const locale = settings.locale;
    const go = (e, path) => { e.preventDefault(); navigate(path); };
    return html`<footer class="site-footer">
        <div class="site-footer__bar">
            <div class="site-footer__brand">
                <strong>Beruang</strong>
                <span class="muted">${t(locale, 'footer.tagline')}</span>
            </div>
            <nav aria-label=${t(locale, 'footer.navLabel')}>
                <a href="/" onClick=${e => go(e, '/')}>${t(locale, 'nav.home')}</a>
                <a href="/portofolio" onClick=${e => go(e, '/portofolio')}>${t(locale, 'nav.portfolio')}</a>
                <span class="site-footer__label" aria-hidden="true">${t(locale, 'nav.calculators')}</span>
                <a href="/kalkulator/reksa-dana" onClick=${e => go(e, '/kalkulator/reksa-dana')}>${t(locale, 'nav.mutualFunds')}</a>
                <a href="/kalkulator/saham" onClick=${e => go(e, '/kalkulator/saham')}>${t(locale, 'nav.stocks')}</a>
                <a href="/kalkulator/deposito" onClick=${e => go(e, '/kalkulator/deposito')}>${t(locale, 'nav.termDeposits')}</a>
                <a href="/kalkulator/mobil-listrik" onClick=${e => go(e, '/kalkulator/mobil-listrik')}>${t(locale, 'nav.ev')}</a>
                <a href="/kalkulator/sewa-vs-beli" onClick=${e => go(e, '/kalkulator/sewa-vs-beli')}>${t(locale, 'nav.rentBuy')}</a>
                <a href="/kalkulator/bunga-flat" onClick=${e => go(e, '/kalkulator/bunga-flat')}>${t(locale, 'nav.flatLoan')}</a>
            </nav>
        </div>
        <p class="site-footer__note">${t(locale, 'footer.dataNote')}</p>
    </footer>`;
}
