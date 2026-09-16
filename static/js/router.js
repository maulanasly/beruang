// History-API router: clean shareable paths (fragments never reach
// servers or link-preview scrapers, so calculator state lives in the
// pathname + real query string). Indonesian-first canonicals; the app
// also answers its legacy English paths.
const routes = {
    '/': 'home',
    '/portofolio': 'portofolio',
    '/overview': 'portofolio',
    '/mutual-funds': 'mutual-funds',
    '/kalkulator/reksa-dana': 'mutual-funds',
    '/calculators/mutual-funds': 'mutual-funds',
    '/stocks': 'stocks',
    '/kalkulator/saham': 'stocks',
    '/calculators/stocks': 'stocks',
    '/term-deposits': 'term-deposits',
    '/kalkulator/deposito': 'term-deposits',
    '/calculators/term-deposits': 'term-deposits',
    '/ev': 'ev',
    '/kalkulator/mobil-listrik': 'ev',
    '/calculators/ev': 'ev',
    '/rent-vs-buy': 'rent-buy',
    '/kalkulator/sewa-vs-beli': 'rent-buy',
    '/calculators/rent-vs-buy': 'rent-buy',
    '/flat-loan': 'flat-loan',
    '/kalkulator/bunga-flat': 'flat-loan',
    '/calculators/flat-rate-loan': 'flat-loan',
    '/debt-payoff': 'debt-payoff',
    '/kalkulator/lunas-utang': 'debt-payoff',
    '/calculators/debt-payoff': 'debt-payoff',
    '/retirement': 'retire',
    '/kalkulator/dana-pensiun': 'retire',
    '/calculators/retirement': 'retire',
};

// Canonical (shareable, Indonesian-first) path per route.
export const canonicalPath = {
    home: '/',
    portofolio: '/portofolio',
    'mutual-funds': '/kalkulator/reksa-dana',
    stocks: '/kalkulator/saham',
    'term-deposits': '/kalkulator/deposito',
    ev: '/kalkulator/mobil-listrik',
    'rent-buy': '/kalkulator/sewa-vs-beli',
    'flat-loan': '/kalkulator/bunga-flat',
    'debt-payoff': '/kalkulator/lunas-utang',
    retire: '/kalkulator/dana-pensiun',
};

// One-time upgrade: old `#/path` links become real paths without reload.
function upgradeLegacyHash() {
    const h = window.location.hash;
    if (h && h.startsWith('#/')) {
        history.replaceState(null, '', h.slice(1) + window.location.search);
    }
}

function cleanPath() {
    upgradeLegacyHash();
    const p = window.location.pathname.replace(/\/+$/, '') || '/';
    return p;
}

export function getCurrentRoute() {
    return routes[cleanPath()] || 'home';
}
export function getRouteQuery() {
    return new URLSearchParams(window.location.search);
}
export function navigate(path) {
    if (window.location.pathname + window.location.search === path) return;
    history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
}
