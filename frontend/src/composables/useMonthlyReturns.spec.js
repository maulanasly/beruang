import { describe, expect, it } from 'vitest'
import { buildMonthlyReturns } from './useMonthlyReturns.js'

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

describe('buildMonthlyReturns', () => {
  it('sorts months ascending and aligns every asset to the union of dates', () => {
    const { months, byAsset } = buildMonthlyReturns({
      'mutual-funds': MF,
      stocks: STOCKS,
      'term-deposits': TD,
    })
    expect(months).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
    expect(byAsset['mutual-funds']).toHaveLength(3)
    expect(byAsset.stocks).toHaveLength(3)
    expect(byAsset['term-deposits']).toHaveLength(3)
  })

  it('returns null MoM for the opening month because there is no prior value', () => {
    const { byAsset } = buildMonthlyReturns({
      'mutual-funds': MF,
      stocks: [],
      'term-deposits': [],
    })
    expect(byAsset['mutual-funds'][0]).toBeNull()
  })

  it('computes mutual fund MoM exactly like the backend (value - installment - start) / start', () => {
    const { byAsset } = buildMonthlyReturns({
      'mutual-funds': MF,
      stocks: [],
      'term-deposits': [],
    })
    expect(byAsset['mutual-funds'][1]).toBeCloseTo((2050 - 1000 - 1000) / 1000, 10)
    expect(byAsset['mutual-funds'][2]).toBeCloseTo((3120 - 1000 - 2050) / 2050, 10)
  })

  it('adds dividends back and subtracts extra share purchases for stocks', () => {
    const { byAsset } = buildMonthlyReturns({
      'mutual-funds': [],
      stocks: STOCKS,
      'term-deposits': [],
    })
    expect(byAsset.stocks[1]).toBeCloseTo((1950 - 700 - 200 + 10 - 1000) / 1000, 10)
    expect(byAsset.stocks[2]).toBeCloseTo((2850 - 700 - 150 + 0 - 1950) / 1950, 10)
  })

  it('computes term deposit MoM with the same cash-adjusted formula', () => {
    const { byAsset } = buildMonthlyReturns({
      'mutual-funds': [],
      stocks: [],
      'term-deposits': TD,
    })
    expect(byAsset['term-deposits'][1]).toBeCloseTo((2005 - 1000 - 1000) / 1000, 10)
  })

  it('aggregates the portfolio column across assets present each month', () => {
    const { portfolio } = buildMonthlyReturns({
      'mutual-funds': MF,
      stocks: STOCKS,
      'term-deposits': TD,
    })
    // month 2: value 2050+1950+2005=6005, contributions 1000+(700+200)+1000=2900,
    // dividends 10, start 1000+1000+1000=3000 → (6005-2900+10-3000)/3000
    expect(portfolio[0]).toBeNull()
    expect(portfolio[1]).toBeCloseTo((6005 - 2900 + 10 - 3000) / 3000, 10)
  })

  it('ignores assets with no entry in a month', () => {
    const { byAsset, portfolio } = buildMonthlyReturns({
      'mutual-funds': MF.slice(0, 2),
      stocks: [],
      'term-deposits': [],
    })
    expect(byAsset.stocks).toEqual([null, null])
    expect(portfolio[1]).toBeCloseTo((2050 - 1000 - 1000) / 1000, 10)
  })

  it('sorts out-of-order input by date before computing MoM', () => {
    const shuffled = [MF[2], MF[0], MF[1]]
    const { byAsset, months } = buildMonthlyReturns({
      'mutual-funds': shuffled,
      stocks: [],
      'term-deposits': [],
    })
    expect(months).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
    expect(byAsset['mutual-funds'][1]).toBeCloseTo(0.05, 10)
  })

  it('dedupes multiple entries sharing the same date, keeping the last', () => {
    const duplicate = [
      { date: '2026-01-31', installment_amount: 1000, current_value: 1000 },
      { date: '2026-02-28', installment_amount: 1000, current_value: 2050 },
      { date: '2026-02-28', installment_amount: 1000, current_value: 2100 },
    ]
    const { months, byAsset } = buildMonthlyReturns({
      'mutual-funds': duplicate,
      stocks: [],
      'term-deposits': [],
    })
    expect(months).toEqual(['2026-01-31', '2026-02-28'])
    expect(byAsset['mutual-funds'][1]).toBeCloseTo((2100 - 1000 - 1000) / 1000, 10)
  })

  it('handles empty entries for every asset', () => {
    const { months, byAsset, portfolio } = buildMonthlyReturns({
      'mutual-funds': [],
      stocks: [],
      'term-deposits': [],
    })
    expect(months).toEqual([])
    expect(byAsset['mutual-funds']).toEqual([])
    expect(portfolio).toEqual([])
  })
})
