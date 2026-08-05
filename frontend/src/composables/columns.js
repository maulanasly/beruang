/**
 * Friendly column labels for ledger rows returned by the backend.
 * Shared between LedgerTable headers and any client-side guidance so the
 * user-facing vocabulary stays consistent.
 *
 * Keys not listed here fall back to a title-cased version of themselves.
 */
export const COLUMN_LABELS = {
  symbol: 'Stock Code',
  date: 'Date',
  installment_amount: 'Installment',
  current_value: 'Current Value',
  new_share_purchases: 'New Purchases',
  dividends: 'Dividends',
  month_start_value: 'Start Value',
  mom_return: 'MoM Return',
  prorated_interest: 'Prorated Interest',
  expected_month_end_value: 'Expected Value',
}

export function columnLabel(key) {
  if (COLUMN_LABELS[key]) return COLUMN_LABELS[key]
  return key
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

/** Columns whose value designates a signed rate of return. */
export const MOM_COLUMNS = new Set(['mom_return'])