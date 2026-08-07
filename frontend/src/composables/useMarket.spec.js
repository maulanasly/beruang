import { beforeEach, describe, expect, it } from 'vitest'
import { useMarket } from './useMarket'
import { resetSettings } from '../test/helpers.js'

beforeEach(() => resetSettings())

describe('useMarket', () => {
  it('defaults to the IDX market with a .JK suffix', () => {
    const { market, displaySymbol } = useMarket()
    expect(market.value.suffix).toBe('.JK')
    expect(displaySymbol('BBCA.JK')).toBe('BBCA')
  })

  it('returns symbols untouched for markets without a suffix', () => {
    resetSettings({ market: 'US' })
    const { market, displaySymbol } = useMarket()
    expect(market.value.suffix).toBe('')
    expect(displaySymbol('AAPL')).toBe('AAPL')
  })

  it('leaves symbols that do not carry the configured suffix alone', () => {
    const { displaySymbol } = useMarket()
    expect(displaySymbol('TLKM')).toBe('TLKM')
    expect(displaySymbol(null)).toBe(null)
    expect(displaySymbol(undefined)).toBe(undefined)
  })

  it('falls back to the first market for unknown values', () => {
    resetSettings({ market: 'XX' })
    const { market } = useMarket()
    expect(market.value.value).toBe('IDX')
  })
})
