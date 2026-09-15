// Per-asset CSV/JSON import-export (legacy Vue ledger-I/O parity).
// Pure functions, no framework.

export const ASSET_COLUMNS = {
    'mutual-funds': ['date', 'installment_amount', 'current_value'],
    stocks: ['symbol', 'date', 'installment_amount', 'new_share_purchases', 'dividends', 'dividend_yield', 'current_value'],
    'term-deposits': ['date', 'installment_amount', 'current_value', 'term_months', 'maturity_date'],
};

const NUMERIC_FIELDS = new Set([
    'installment_amount', 'current_value', 'new_share_purchases',
    'dividends', 'dividend_yield', 'term_months',
]);

const HEADER_ALIASES = { 'stock code': 'symbol', symbol: 'symbol' };

export function columnsFor(asset) { return ASSET_COLUMNS[asset] || []; }

function escapeCsvValue(value) {
    const text = String(value ?? '');
    if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
    return text;
}

export function exportLedgerCsv(asset, entries) {
    const columns = columnsFor(asset);
    const rows = (entries || []).map(e => columns.map(c => escapeCsvValue(e[c])).join(','));
    return [columns.join(','), ...rows].join('\n');
}

export function exportLedgerJson(asset, entries) {
    return JSON.stringify({ asset, version: 1, exportedAt: new Date().toISOString(), entries: entries || [] }, null, 2);
}

export function exportLedgerCsvTemplate(asset) {
    const columns = columnsFor(asset);
    const sample = columns.map(c => {
        if (c === 'date') return '2026-07-31';
        if (c === 'symbol') return 'BBCA';
        if (c === 'maturity_date') return '2027-07-31';
        if (c === 'term_months') return '12';
        return '1000';
    }).join(',');
    const header = columns.map(c => (c === 'symbol' ? 'stock code' : c)).join(',');
    // Deposits read best as a cumulative pair: second row adds fresh money
    // on top of the running balance, mirroring the bundled sample data.
    if (asset === 'term-deposits') {
        const second = columns.map(c => {
            if (c === 'date') return '2026-08-31';
            if (c === 'maturity_date') return '2027-08-31';
            if (c === 'term_months') return '12';
            if (c === 'current_value') return '2005';
            return '1000';
        }).join(',');
        return `${header}\n${sample}\n${second}\n`;
    }
    return `${header}\n${sample}\n`;
}

function isValidDate(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }

function parseCsvRow(line) {
    const values = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') { current += '"'; i++; }
                else inQuotes = false;
            } else current += ch;
        } else if (ch === '"') inQuotes = true;
        else if (ch === ',') { values.push(current); current = ''; }
        else current += ch;
    }
    values.push(current);
    return values;
}

export function parseLedgerCsv(asset, text) {
    const columns = columnsFor(asset);
    const errors = [], entries = [];
    const rawLines = String(text || '').split(/\r?\n/);
    const headerLine = rawLines.findIndex(l => l.trim() !== '');
    if (headerLine === -1) return { entries: [], errors: [{ line: 1, type: 'empty' }] };
    const header = parseCsvRow(rawLines[headerLine]).map(h => h.trim());
    const resolved = header.map(h => HEADER_ALIASES[h] ?? h);
    if (resolved.join(',') !== columns.join(',')) {
        return { entries: [], errors: [{ line: headerLine + 1, type: 'missingHeader' }] };
    }
    rawLines.slice(headerLine + 1).forEach((line, index) => {
        if (!line.trim()) return;
        const lineNumber = headerLine + index + 2;
        const values = parseCsvRow(line);
        const entry = {};
        columns.forEach((column, i) => {
            const raw = values[i]?.trim() ?? '';
            if (column === 'date' || column === 'symbol' || column === 'maturity_date') entry[column] = raw;
            else if (NUMERIC_FIELDS.has(column)) entry[column] = raw === '' ? 0 : Number(raw);
            else entry[column] = raw;
        });
        const rowErrors = [];
        if (!isValidDate(entry.date)) rowErrors.push({ line: lineNumber, type: 'invalidDate', field: 'date' });
        for (const column of columns) {
            if (NUMERIC_FIELDS.has(column) && (entry[column] === undefined || Number.isNaN(entry[column]))) {
                rowErrors.push({ line: lineNumber, type: 'invalidNumber', field: column });
            }
        }
        if (rowErrors.length) errors.push(...rowErrors);
        else entries.push(entry);
    });
    return { entries, errors };
}

export function parseLedgerJson(asset, text) {
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return { entries: [], errors: [{ line: 1, type: 'invalidJson' }] }; }
    const rawEntries = Array.isArray(parsed) ? parsed : parsed?.entries;
    if (!Array.isArray(rawEntries)) return { entries: [], errors: [{ line: 1, type: 'missingHeader' }] };
    const errors = [], entries = [];
    rawEntries.forEach((entry, index) => {
        const line = index + 1;
        const value = entry && typeof entry === 'object' ? entry : {};
        const rowErrors = [];
        if (!isValidDate(value.date)) rowErrors.push({ line, type: 'invalidDate', field: 'date' });
        for (const column of columnsFor(asset)) {
            // Lenient like the CSV path: numeric strings coerce (spreadsheets
            // and hand-edited backups); only truly non-numeric values fail.
            if (NUMERIC_FIELDS.has(column) && value[column] != null && value[column] !== '' &&
                Number.isNaN(Number(value[column]))) {
                rowErrors.push({ line, type: 'invalidNumber', field: column });
            }
        }
        if (rowErrors.length) errors.push(...rowErrors);
        else {
            const cleaned = { date: value.date };
            columnsFor(asset).forEach(column => {
                if (column === 'date') return;
                cleaned[column] = value[column] ?? (NUMERIC_FIELDS.has(column) ? 0 : '');
            });
            entries.push(cleaned);
        }
    });
    return { entries, errors };
}

export function download(filename, text, mime = 'text/plain') {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}
