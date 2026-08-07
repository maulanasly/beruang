import { computed } from 'vue'
import { useSettings } from './useSettings'

const PERCENT_KEYS = new Set([
  'xirr',
  'roi',
  'mom_return',
  'apy',
  'monthly_rate',
  'dividend_yield',
])
const CURRENCY_HINTS = [
  'value',
  'installment',
  'contribution',
  'purchase',
  'dividend',
  'interest',
  'fv',
  'invested',
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
 * Reactive Intl formatters bound to the global settings store.
 * No arguments: locale and currency are read from useSettings(), so every
 * component that calls useFormatter() and any chart axis that reads
 * settings.locale stays in lockstep with the dashboard selector.
 */
export function useFormatter() {
  const settings = useSettings()

  const currencyFormatter = computed(
    () =>
      new Intl.NumberFormat(settings.locale, {
        style: 'currency',
        currency: settings.currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
  )

  const decimalFormatter = computed(
    () =>
      new Intl.NumberFormat(settings.locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 6,
      }),
  )

  const percentFormatter = computed(
    () =>
      new Intl.NumberFormat(settings.locale, {
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

  /**
   * Format a value as currency. Pass an explicit `currencyOverride` to format
   * a price whose currency differs from the dashboard's selected currency
   * (e.g. an IDX quote that always returns IDR). When omitted, uses the
   * dashboard currency from settings.
   */
  function formatCurrency(value, currencyOverride) {
    if (value === null || value === undefined) {
      return '-'
    }
    if (typeof value !== 'number') {
      return String(value)
    }
    const currency = currencyOverride || settings.currency
    const fmt = new Intl.NumberFormat(settings.locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return fmt.format(value)
  }

  function isNumericColumn(column, rows = []) {
    return rows.some((row) => typeof row?.[column] === 'number')
  }

  return {
    currencyFormatter,
    decimalFormatter,
    percentFormatter,
    formatCellValue,
    formatCurrency,
    isNumericColumn,
    isPercentKey,
    isCurrencyKey,
    isDateKey,
  }
}