import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';
import { navigate } from '../router.js';

// Orientation trail on calculator pages: Home / Calculators / This tool.
// `nav.calculators` is plain text (there is no calculators index page).
export function Crumbs({ locale, currentKey }) {
    const go = (e, to) => { e.preventDefault(); navigate(to); };
    return html`<nav class="crumbs" aria-label=${t(locale, 'ui.breadcrumb')}>
        <a href="/" onClick=${e => go(e, '/')}>${t(locale, 'nav.home')}</a>
        <span aria-hidden="true">/</span>
        <span>${t(locale, 'nav.calculators')}</span>
        <span aria-hidden="true">/</span>
        <span aria-current="page">${t(locale, currentKey)}</span>
    </nav>`;
}
