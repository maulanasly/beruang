import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';

// Collapsible first-run walkthrough. Native <details> = free keyboard support.
export function HowTo({ locale, steps }) {
    return html`<details class="card howto">
        <summary>${t(locale, 'howto.title')}</summary>
        <ol>${steps.map(s => html`<li>${s}</li>`)}</ol>
    </details>`;
}
