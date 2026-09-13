import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';

// Glossary tooltip (?), styled by .info-tip in css. `tipKey` is a glossary path
// e.g. `glossary.xirr`. Falls back to plain text when the key is missing.
export function InfoTip({ locale, tipKey, text }) {
    const tip = text || t(locale, tipKey || 'glossary.moM');
    return html`<span class="info-tip" data-tip=${tip} tabindex="0" title=${tip}>ⓘ</span>`;
}
