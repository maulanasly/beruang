import { beforeEach, describe, expect, it } from 'vitest'
import { annualize, chainLink, useTwr } from './useTwr.js'
import { useLedgers } from './useLedgers.js'
import { resetLedgers, resetSettings } from '../test/helpers.js'

const MF = [
  { date: '2026-01-31', installment_amount: 1000, current_value: 1000 },
  { date: '2026-02-28', installment_amount: 1000, current_value: 2050 },
  { date: '2026-03-31', installment_amount: 1000, current_value: 3120 },
]

const STOCKS = [
  { date: '2026-01-31', installment_amount: 700, new_share_purchases: 300, dividends: 0, current_value: 1000 },
  { date: '2026-02-28', installment_amount: 700, new_share_purchases: 200, dividends: 10, current_value: 1950 },
  { date: '2026-03-31', installment_amount: 700, new_share_purchases: 150, dividends: 0, current_value: 2850 },
]

const TD = [
  { date: '2026-01-31', installment_amount: 1000, current_value: 1000 },
  { date: '2026-02-28', installment_amount: 1000, current_value: 2005 },
  { date: '2026-03-31', installment_amount: 1000, current_value: 3020 },
]

beforeEach(() => {
  resetSettings()
  resetLedgers()
})

describe('chainLink', () => {
  it('returns null with fewer than two valid returns', () => {
    expect(chainLink([])).toBeNull()
    expect(chainLink([0.05])).toBeNull()
    expect(chainLink([null, 0.05])).toBeNull()
  })

  it('compounds returns as (1+r1)(1+r2)... - 1', () => {
    expect(chainLink([0.05, 0.034146])).toBeCloseTo(1.05 * 1.034146 - 1, 10)
  })

  it('ignores null and non-numeric entries', () => {
    expect(chainLink([null, 0.05, null, 0.02, 'x'])).toBeCloseTo(1.05 * 1.02 - 1, 10)
  })
})

describe('annualize', () => {
  it('returns null when the total is null', () => {
    expect(annualize(null, '2026-01-31', '2026-03-31')).toBeNull()
  })

  it('returns null when the window is missing or reversed', () => {
    expect(annualize(0.1, '', '2026-01-31')).toBeNull()
    expect(annualize(0.1, '2026-03-31', '2026-01-31')).toBeNull()
    expect(annualize(0.1, '2026-01-31', '2026-01-31')).toBeNull()
  })

  it('annualizes the total over the calendar span', () => {
    const total = chainLink([0.05, 0.0224813])
    const annual = annualize(total, '2026-01-31', '2026-03-31')
    const expected = (1 + total) ** (365 / 59) - 1
    expect(annual).toBeCloseTo(expected, 10)
  })
})

describe('useTwr', () => {
  it('computes the portfolio TWR from the monthly aggregate', () => {
    const ledgers = useLedgers()
    ledgers.setEntries('mutual-funds', MF)
    ledgers.setEntries('stocks', STOCKS)
    ledgers.setEntries('term-deposits', TD)

    const twr = useTwr()
    // month 2: value 6005, contributions 2900, dividends 10, start 3000
    // month 3: value 8990, contributions 2850, dividends 0, start 6005
    const mom2 = (6005 - 2900 + 10 - 3000) / 3000
    const mom3 = (8990 - 2850 + 0 - 6005) / 6005
    const total = (1 + mom2) * (1 + mom3) - 1
    expect(twr.portfolioTotal.value).toBeCloseTo(total, 10)
    expect(twr.portfolioTwr.value).toBeCloseTo((1 + total) ** (365 / 59) - 1, 6)
  })

  it('returns null portfolio TWR with fewer than two months', () => {
    const ledgers = useLedgers()
    ledgers.setEntries('mutual-funds', [MF[0]])
    ledgers.setEntries('stocks', [])
    ledgers.setEntries('term-deposits', [])

    const twr = useTwr()
    expect(twr.portfolioTotal.value).toBeNull()
    expect(twr.portfolioTwr.value).toBeNull()
  })

  it('exposes per-asset annualized TWR from each asset own returns', () => {
    const ledgers = useLedgers()
    ledgers.setEntries('mutual-funds', MF)
    ledgers.setEntries('stocks', [])
    ledgers.setEntries('term-deposits', [])

    const twr = useTwr()
    const mf = twr.assets.value.find((a) => a.asset === 'mutual-funds')
    const total = 1.05 * (1 + (3120 - 1000 - 2050) / 2050) - 1
    expect(mf.total).toBeCloseTo(total, 10)
    expect(mf.annualized).toBeCloseTo((1 + total) ** (365 / 59) - 1, 6)
  })
})
