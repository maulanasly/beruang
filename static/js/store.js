const SETTINGS_KEY = 'beruang.settings';
const LEDGERS_KEY = 'beruang.ledgers';

const DEFAULT_MF = [
    { date: '2026-05-31', installment_amount: 1100, current_value: 6500 },
    { date: '2026-06-30', installment_amount: 1100, current_value: 7700 },
];
const DEFAULT_STOCKS = [
    { symbol: 'BBCA.JK', date: '2026-05-31', installment_amount: 700, new_share_purchases: 300, dividends: 0, dividend_yield: null, current_value: 1000 },
    { symbol: 'BBCA.JK', date: '2026-06-30', installment_amount: 700, new_share_purchases: 200, dividends: 10, dividend_yield: null, current_value: 1950 },
];
const DEFAULT_TD = [
    { date: '2026-05-31', installment_amount: 1000, current_value: 1000, term_months: 12, maturity_date: '2027-05-31' },
    { date: '2026-06-30', installment_amount: 1000, current_value: 2005, term_months: 12, maturity_date: '2027-06-30' },
];

function load(key) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

export function loadSettings() {
    const s = load(SETTINGS_KEY);
    const nav = typeof navigator !== 'undefined' && navigator.language?.startsWith('id') ? 'id-ID' : 'en-US';
    return {
        locale: s?.locale || nav,
        currency: s?.currency || 'IDR',
        market: s?.market || 'IDX',
    };
}
export function saveSettings(s) { save(SETTINGS_KEY, s); }

export function loadLedgers() {
    const s = load(LEDGERS_KEY);
    return {
        'mutual-funds': s?.['mutual-funds'] ?? DEFAULT_MF.map(e => ({ ...e })),
        stocks: s?.stocks ?? DEFAULT_STOCKS.map(e => ({ ...e })),
        'term-deposits': s?.['term-deposits'] ?? { apy: 0.06, entries: DEFAULT_TD.map(e => ({ ...e })) },
        results: s?.results ?? { 'mutual-funds': null, stocks: null, 'term-deposits': null },
    };
}
export function saveLedgers(ledgers) { save(LEDGERS_KEY, ledgers); }

export const MARKET_OPTIONS = [
    { value: 'IDX', label: 'Indonesia (IDX)', suffix: '.JK' },
    { value: 'US', label: 'United States (NYSE/NASDAQ)', suffix: '' },
];
export const LOCALE_OPTIONS = [
    { label: 'English (US)', value: 'en-US' },
    { label: 'Bahasa Indonesia', value: 'id-ID' },
];
export const CURRENCY_OPTIONS = [
    { label: 'US Dollar (USD)', value: 'USD' },
    { label: 'Indonesian Rupiah (IDR)', value: 'IDR' },
];
