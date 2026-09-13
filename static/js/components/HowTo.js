import { html, useState } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';

// Collapsible first-run walkthrough. Native <details> = free keyboard support.
// `startOpen` seeds the initial state (pages pass `!result` so first-run
// users see guidance while returning users with results do not); after
// mount the user owns the toggle and re-renders never stomp it.
export function HowTo({ locale, steps, startOpen }) {
    const [open, setOpen] = useState(!!startOpen);
    return html`<details class="card howto" open=${open || null} onToggle=${e => setOpen(e.target.open)}>
        <summary>${t(locale, 'howto.title')}</summary>
        <ol>${steps.map(s => html`<li>${s}</li>`)}</ol>
    </details>`;
}
