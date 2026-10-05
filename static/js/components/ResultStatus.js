import { html } from '../vendor/preact-htm-signals.js';
import { t } from '../i18n.js';

export function ResultStatus({ locale, stale }) {
    if (!stale) return html``;
    return html`<p class="result-status result-status--stale" role="status">
        <strong>${t(locale, 'results.staleTitle')}</strong> ${t(locale, 'results.staleBody')}
    </p>`;
}

export function ResultsSection({ locale, stale, children }) {
    return html`<section data-results class="results-anchor" aria-labelledby="results-heading">
        <div class="results-heading-row">
            <h2 id="results-heading" tabindex="-1">${t(locale, 'results.title')}</h2>
        </div>
        <${ResultStatus} locale=${locale} stale=${stale} />
        ${children}
    </section>`;
}
