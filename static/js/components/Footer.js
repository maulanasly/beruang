import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { navigate } from '../router.js';

export function Footer({ settings }) {
    const locale = settings.locale;
    const go = (e, path) => { e.preventDefault(); navigate(path); };
    return html`<footer class="site-footer">
        <div class="site-footer__grid">
            <div>
                <strong>Beruang</strong>
                <p class="muted" style="font-size:12px; margin:4px 0 0">${t(locale, 'footer.tagline')}</p>
            </div>
            <nav aria-label=${t(locale, 'footer.navLabel')}>
                <a href="/" onClick=${e => go(e, '/')}>${t(locale, 'nav.home')}</a>
                <a href="/portofolio" onClick=${e => go(e, '/portofolio')}>${t(locale, 'nav.portfolio')}</a>
                <a href="/kalkulator/reksa-dana" onClick=${e => go(e, '/kalkulator/reksa-dana')}>${t(locale, 'nav.mutualFunds')}</a>
                <a href="/kalkulator/saham" onClick=${e => go(e, '/kalkulator/saham')}>${t(locale, 'nav.stocks')}</a>
                <a href="/kalkulator/deposito" onClick=${e => go(e, '/kalkulator/deposito')}>${t(locale, 'nav.termDeposits')}</a>
            </nav>
            <p class="muted" style="font-size:12px; margin:0">${t(locale, 'footer.dataNote')}</p>
        </div>
    </footer>`;
}
