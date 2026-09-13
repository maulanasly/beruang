const SETTINGS_KEY = 'beruang.settings';
const LEDGERS_KEY = 'beruang.ledgers';
const GOALS_KEY = 'beruang.goals';

export const GOALS_ASSETS = ['mutual-funds', 'stocks', 'term-deposits'];

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
    const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    return {
        locale: s?.locale || nav,
        currency: s?.currency || 'IDR',
        market: s?.market || 'IDX',
        theme: s?.theme === 'dark' || s?.theme === 'light' ? s.theme : (prefersDark ? 'dark' : 'light'),
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

// Persist edited rows without touching stored results, so navigating
// away never loses uncalculated edits. Results keep their own snapshot.
export function saveEntries(asset, entries, apy) {
    const l = loadLedgers();
    if (asset === 'term-deposits') {
        l['term-deposits'] = { apy: apy ?? l['term-deposits'].apy, entries };
    } else {
        l[asset] = entries;
    }
    saveLedgers(l);
}

export const SAMPLE_STOCKS = DEFAULT_STOCKS.map(e => ({ ...e }));
export const SAMPLE_MF = DEFAULT_MF.map(e => ({ ...e }));
export const SAMPLE_TD = { apy: 0.06, entries: DEFAULT_TD.map(e => ({ ...e })) };

function defaultGoals() {
    return {
        overall: { target: 0, targetDate: '' },
        assets: {
            'mutual-funds': { target: 0 },
            stocks: { target: 0 },
            'term-deposits': { target: 0 },
        },
    };
}
export function loadGoals() {
    const goals = defaultGoals();
    let raw = null;
    try { const s = localStorage.getItem(GOALS_KEY); raw = s ? JSON.parse(s) : null; } catch { return goals; }
    if (!raw || typeof raw !== 'object') return goals;
    const overallTarget = Number(raw.overall?.target);
    if (Number.isFinite(overallTarget) && overallTarget > 0) goals.overall.target = overallTarget;
    if (raw.overall?.targetDate) goals.overall.targetDate = String(raw.overall.targetDate);
    for (const asset of GOALS_ASSETS) {
        const v = Number(raw.assets?.[asset]?.target);
        if (Number.isFinite(v) && v > 0) goals.assets[asset].target = v;
    }
    return goals;
}
export function saveGoals(goals) { save(GOALS_KEY, goals); }

export const MARKET_OPTIONS = [
    { value: 'IDX', label: 'Indonesia (IDX)', short: 'IDX', suffix: '.JK' },
    { value: 'US', label: 'United States (NYSE/NASDAQ)', short: 'US', suffix: '' },
];
export const LOCALE_OPTIONS = [
    { label: 'English (US)', short: 'EN', value: 'en-US' },
    { label: 'Bahasa Indonesia', short: 'ID', value: 'id-ID' },
];
export const CURRENCY_OPTIONS = [
    { label: 'US Dollar (USD)', short: 'USD', value: 'USD' },
    { label: 'Indonesian Rupiah (IDR)', short: 'IDR', value: 'IDR' },
];
