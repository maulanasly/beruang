import { describe, expect, it } from 'vitest'
import {
  isCurrencyKey,
  isDateKey,
  isPercentKey,
  normalizeKey,
  useFormatter,
} from './useFormatter'
import { ref } from 'vue'

describe('useFormatter key classifiers', () => {
  it('normalizes keys to lowercase strings', () => {
    expect(normalizeKey('XIRR')).toBe('xirr')
    expect(normalizeKey(null)).toBe('')
    expect(normalizeKey(undefined)).toBe('')
  })

  it('flags the percent keys defined by the contract', () => {
    for (const key of ['xirr', 'roi', 'mom_return', 'apy', 'monthly_rate']) {
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
  const formatter = useFormatter(ref('en-US'), ref('USD'))

  it('renders null/-', () => {
    expect(formatter.formatCellValue('current_value', null)).toBe('-')
    expect(formatter.formatCellValue('current_value', undefined)).toBe('-')
  })

  it('renders percent keys as localized percentages', () => {
    expect(formatter.formatCellValue('xirr', 0.1234)).toMatch(/12\.34%/)
  })

  it('renders currency keys as localized currency', () => {
    expect(formatter.formatCellValue('current_value', 6500)).toMatch(/6,500.00/)
  })

  it('renders plain numbers with the decimal formatter', () => {
    expect(formatter.formatCellValue('installment_amount', 1100)).toMatch(/1,100/)
  })

  it('passes dates through as strings', () => {
    expect(formatter.formatCellValue('date', '2026-05-31')).toBe('2026-05-31')
  })

  it('reacts to locale/currency ref changes', () => {
    const locale = ref('en-US')
    const currency = ref('USD')
    const reactive = useFormatter(locale, currency)
    const usdOut = reactive.formatCellValue('current_value', 1000)
    currency.value = 'IDR'
    const idrOut = reactive.formatCellValue('current_value', 1000)
    expect(usdOut).not.toBe(idrOut)
  })
})