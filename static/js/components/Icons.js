import { html } from '../vendor/preact-htm-signals.js';

// Topical, monochrome case icons for the calculator cards. Zero-dep
// inline SVG (feather/lucide style): 24×24 viewBox, stroked with
// currentColor so both themes resolve automatically. Decorative —
// adjacent titles carry the accessible name.
const PATHS = {
    // Mutual funds — diversified allocation.
    'mutual-funds': html`<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>`,
    // Stocks — candlesticks.
    stocks: html`<line x1="6" y1="2" x2="6" y2="6"/><rect x="4" y="6" width="4" height="8" rx="1"/><line x1="6" y1="14" x2="6" y2="22"/><line x1="18" y1="5" x2="18" y2="9"/><rect x="16" y="9" width="4" height="9" rx="1"/><line x1="18" y1="18" x2="18" y2="22"/>`,
    // Term deposits — bank.
    'term-deposits': html`<line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/>`,
    // EV vs petrol — car.
    ev: html`<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>`,
    // Rent vs buy — house.
    'rent-buy': html`<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>`,
    // Flat-rate loan — percent.
    'flat-loan': html`<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>`,
    // Debt payoff — credit card.
    'debt-payoff': html`<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>`,
    // Retirement — umbrella.
    retire: html`<path d="M22 12a10 10 0 0 0-20 0z"/><path d="M12 12v7a2 2 0 0 0 4 0"/>`,
    // Bonds — award seal.
    bonds: html`<circle cx="12" cy="8" r="5"/><path d="M8.5 12.5 7 22l5-3 5 3-1.5-9.5"/>`,
};

export function CaseIcon({ kind, size = 18 }) {
    const inner = PATHS[kind];
    if (!inner) return null;
    return html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
