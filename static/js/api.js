const BASE = '/api/v1';

async function fetchJSON(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const detail = data?.detail ?? `HTTP ${res.status}`;
        const err = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
        err.status = res.status;
        err.detail = data?.detail;
        throw err;
    }
    return data;
}

export async function calculateReturns(asset, payload) {
    const endpoints = {
        'mutual-funds': `${BASE}/mutual-funds/returns`,
        'stocks': `${BASE}/stocks/returns`,
        'term-deposits': `${BASE}/term-deposits/returns`,
    };
    const url = endpoints[asset];
    if (!url) throw new Error(`Unknown asset ${asset}`);
    return fetchJSON(url, { method: 'POST', body: JSON.stringify(payload) });
}

export async function fetchKompas100() {
    return fetchJSON(`${BASE}/market-data/idx/kompas100`);
}
export async function searchIdx(q, limit = 10) {
    return fetchJSON(`${BASE}/market-data/idx/search?q=${encodeURIComponent(q)}&limit=${limit}`);
}
export async function fetchQuote(symbol) {
    return fetchJSON(`${BASE}/market-data/quote?symbol=${encodeURIComponent(symbol)}`);
}
export async function fetchIndexHistory(symbol = '^JKSE', period = '1y') {
    return fetchJSON(`${BASE}/market-data/index/history?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(period)}`);
}
export async function fetchPriceHistory(symbol, period = '1y') {
    return fetchJSON(`${BASE}/market-data/price/history?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(period)}`);
}
export async function fetchDividendYields(limit = 10) {
    return fetchJSON(`${BASE}/market-data/idx/dividend-yields?limit=${limit}`);
}

export async function evComparison(payload) {
    return fetchJSON(`${BASE}/ev/comparison`, { method: 'POST', body: JSON.stringify(payload) });
}
