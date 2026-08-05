import { computed } from 'vue'

const PERCENT_KEYS = new Set(['xirr', 'roi', 'mom_return', 'apy', 'monthly_rate'])
const CURRENCY_HINTS = [
  'value',
  'installment',
  'contribution',
  'purchase',
  'dividend',
  'interest',
  'fv',
]

export function normalizeKey(key) {
  return String(key || '').toLowerCase()
}

export function isPercentKey(key) {
  return PERCENT_KEYS.has(normalizeKey(key))
}

export function isCurrencyKey(key) {
  const normalized = normalizeKey(key)
  return CURRENCY_HINTS.some((hint) => normalized.includes(hint))
}

export function isDateKey(key) {
  return normalizeKey(key) === 'date'
}

/**
 * Reactive Intl formatters driven by locale/currency refs.
 * Pass refs (not raw strings) so the computeds update on change.
 */
export function useFormatter(localeRef, currencyRef) {
  const currencyFormatter = computed(
    () =>
      new Intl.NumberFormat(localeRef.value, {
        style: 'currency',
        currency: currencyRef.value,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
  )

  const decimalFormatter = computed(
    () =>
      new Intl.NumberFormat(localeRef.value, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 6,
      }),
  )

  const percentFormatter = computed(
    () =>
      new Intl.NumberFormat(localeRef.value, {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
  )

  function formatCellValue(key, value) {
    if (value === null || value === undefined) {
      return '-'
    }

    if (isDateKey(key)) {
      return String(value)
    }

    if (typeof value === 'number') {
      if (isPercentKey(key)) {
        return percentFormatter.value.format(value)
      }
      if (isCurrencyKey(key)) {
        return currencyFormatter.value.format(value)
      }
      return decimalFormatter.value.format(value)
    }

    return String(value)
  }

  function isNumericColumn(column, rows = []) {
    return rows.some((row) => typeof row?.[column] === 'number')
  }

  return {
    currencyFormatter,
    decimalFormatter,
    percentFormatter,
    formatCellValue,
    isNumericColumn,
    isPercentKey,
    isCurrencyKey,
    isDateKey,
  }
}