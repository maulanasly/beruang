import { beforeEach, describe, expect, it } from 'vitest'
import {
  isCurrencyKey,
  isDateKey,
  isPercentKey,
  normalizeKey,
  useFormatter,
} from './useFormatter'
import { useSettings } from './useSettings'

/** Reset the shared settings store to a known baseline before each test. */
function resetSettings(overrides = {}) {
  const settings = useSettings()
  settings.locale = overrides.locale || 'en-US'
  settings.currency = overrides.currency || 'USD'
}

describe('useFormatter key classifiers', () => {
  it('normalizes keys to lowercase strings', () => {
    expect(normalizeKey('XIRR')).toBe('xirr')
    expect(normalizeKey(null)).toBe('')
    expect(normalizeKey(undefined)).toBe('')
  })

  it('flags the percent keys defined by the contract', () => {
    for (const key of ['xirr', 'roi', 'mom_return', 'apy', 'monthly_rate', 'dividend_yield']) {
      expect(isPercentKey(key)).toBe(true)
    }
    expect(isPercentKey('current_value')).toBe(false)
  })

  it('flags currency-bearing keys by hint substring', () => {
    expect(isCurrencyKey('current_value')).toBe(true)
    expect(isCurrencyKey('installment_amount')).toBe(true)
    expect(isCurrencyKey('projected_fv_constant_installment')).toBe(true)
    expect(isCurrencyKey('date')).toBe(false)
  })

  it('recognizes date keys', () => {
    expect(isDateKey('date')).toBe(true)
    expect(isDateKey('DATE')).toBe(true)
    expect(isDateKey('current_value')).toBe(false)
  })
})

describe('useFormatter formatCellValue', () => {
  beforeEach(() => resetSettings())

  it('renders null/-', () => {
    const formatter = useFormatter()
    expect(formatter.formatCellValue('current_value', null)).toBe('-')
    expect(formatter.formatCellValue('current_value', undefined)).toBe('-')
  })

  it('renders percent keys as localized percentages', () => {
    const formatter = useFormatter()
    expect(formatter.formatCellValue('xirr', 0.1234)).toMatch(/12\.34%/)
  })

  it('renders currency keys as localized currency', () => {
    const formatter = useFormatter()
    expect(formatter.formatCellValue('current_value', 6500)).toMatch(/6,500.00/)
  })

  it('renders plain numbers with the decimal formatter', () => {
    const formatter = useFormatter()
    expect(formatter.formatCellValue('installment_amount', 1100)).toMatch(/1,100/)
  })

  it('passes dates through as strings', () => {
    const formatter = useFormatter()
    expect(formatter.formatCellValue('date', '2026-05-31')).toBe('2026-05-31')
  })

  it('reacts to currency changes in the settings store', () => {
    resetSettings({ currency: 'USD' })
    const formatter = useFormatter()
    const usdOut = formatter.formatCellValue('current_value', 1000)
    useSettings().currency = 'IDR'
    const idrOut = formatter.formatCellValue('current_value', 1000)
    expect(usdOut).not.toBe(idrOut)
  })
})

describe('useFormatter formatCurrency', () => {
  beforeEach(() => resetSettings())

  it('formats using the locale with an explicit currency override', () => {
    const formatter = useFormatter()
    expect(formatter.formatCurrency(9100, 'IDR')).toMatch(/9,100/)
  })

  it('falls back to the active currency when no override is given', () => {
    const formatter = useFormatter()
    expect(formatter.formatCurrency(1000)).toMatch(/1,000/)
  })

  it('returns - for null/undefined and strings through for non-numbers', () => {
    const formatter = useFormatter()
    expect(formatter.formatCurrency(null)).toBe('-')
    expect(formatter.formatCurrency(undefined)).toBe('-')
    expect(formatter.formatCurrency('n/a', 'USD')).toBe('n/a')
  })
})