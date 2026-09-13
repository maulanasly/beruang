export function formatCurrency(value, locale = 'id-ID', currency = 'IDR') {
    if (value == null || isNaN(value)) return '-';
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}
export function formatPercent(value, locale = 'id-ID') {
    if (value == null || isNaN(value)) return '-';
    return new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}
export function formatNumber(value, locale = 'id-ID') {
    if (value == null || isNaN(value)) return '-';
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 6 }).format(value);
}
export function formatCellValue(key, value, locale, currency) {
    if (value == null) return '-';
    const k = String(key).toLowerCase();
    const percentKeys = new Set(['xirr','roi','mom_return','apy','monthly_rate','dividend_yield']);
    if (percentKeys.has(k)) return formatPercent(value, locale);
    if (k.includes('value') || k.includes('installment') || k.includes('contribution') || k.includes('purchase') || k.includes('dividend') || k.includes('interest') || k.includes('fv') || k.includes('invested')) {
        return formatCurrency(value, locale, currency);
    }
    if (typeof value === 'number') return formatNumber(value, locale);
    return String(value);
}
export function parseLocaleNumber(str) {
    if (str == null) return 0;
    const cleaned = String(str).replace(/[^0-9\-\.]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
}

/**
 * Port of useMarket.displaySymbol: the `.JK` suffix stays in the underlying
 * data and is only stripped for display when the IDX market is active.
 */
export function displaySymbol(symbol, market = 'IDX') {
    if (typeof symbol !== 'string') return symbol;
    const suffix = market === 'IDX' ? '.JK' : '';
    if (!suffix) return symbol;
    return symbol.endsWith(suffix) ? symbol.slice(0, -suffix.length) : symbol;
}
