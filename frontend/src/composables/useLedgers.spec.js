import { beforeEach, describe, expect, it } from 'vitest'
import { useLedgers } from './useLedgers.js'
import { resetLedgers } from '../test/helpers.js'

describe('useLedgers', () => {
  beforeEach(() => {
    resetLedgers()
    localStorage.clear()
  })

  it('seeds default entries per asset class', () => {
    const ledgers = useLedgers()
    expect(ledgers.getEntries('mutual-funds')).toHaveLength(2)
    expect(ledgers.getEntries('stocks')).toHaveLength(2)
    expect(ledgers.getEntries('term-deposits')).toHaveLength(2)
    expect(ledgers.getApy()).toBe(0.06)
  })

  it('seeds a stock symbol on the first stock row', () => {
    const ledgers = useLedgers()
    expect(ledgers.getEntries('stocks')[0].symbol).toBe('BBCA.JK')
  })

  it('setEntries replaces the array for an asset class', () => {
    const ledgers = useLedgers()
    const rows = [{ date: '2026-07-31', installment_amount: 100, current_value: 100 }]
    ledgers.setEntries('mutual-funds', rows)
    expect(ledgers.getEntries('mutual-funds')).toEqual(rows)
  })

  it('persists ledgers to localStorage and restores them', () => {
    const ledgers = useLedgers()
    const rows = [{ date: '2026-07-31', installment_amount: 100, current_value: 100 }]
    ledgers.setEntries('stocks', rows)
    ledgers.setApy(0.12)

    const fresh = useLedgers()
    expect(fresh.getEntries('stocks')).toEqual(rows)
    expect(fresh.getApy()).toBe(0.12)
  })

  it('stores and clears results per asset', () => {
    const ledgers = useLedgers()
    expect(ledgers.getResult('stocks')).toBeNull()
    ledgers.setResult('stocks', { summary: { xirr: 0.4 } })
    expect(ledgers.getResult('stocks')).toEqual({ summary: { xirr: 0.4 } })
    ledgers.clearResult('stocks')
    expect(ledgers.getResult('stocks')).toBeNull()
  })

  it('resetAll restores pristine defaults without shared object mutation', () => {
    const ledgers = useLedgers()
    ledgers.getEntries('mutual-funds')[0].date = ''
    ledgers.setEntries('stocks', [{ date: '2026-07-31' }])
    ledgers.setApy(0.5)
    ledgers.setResult('mutual-funds', { summary: {} })

    ledgers.resetAll()

    expect(ledgers.getEntries('mutual-funds')[0].date).toBe('2026-05-31')
    expect(ledgers.getEntries('stocks')).toHaveLength(2)
    expect(ledgers.getEntries('stocks')[0].symbol).toBe('BBCA.JK')
    expect(ledgers.getApy()).toBe(0.06)
    expect(ledgers.getResult('mutual-funds')).toBeNull()
  })

  it('survives repeated resets even after entries are mutated', () => {
    const ledgers = useLedgers()
    for (let round = 0; round < 3; round += 1) {
      ledgers.getEntries('term-deposits')[0].date = `corrupt-${round}`
      ledgers.resetAll()
    }
    expect(ledgers.getEntries('term-deposits')[0].date).toBe('2026-05-31')
  })

  it('restoreAll replaces every asset class, apy, and clears results', () => {
    const ledgers = useLedgers()
    ledgers.setResult('stocks', { summary: { xirr: 0.5 }, ledger: [] })

    ledgers.restoreAll({
      'mutual-funds': [{ date: '2026-07-31', installment_amount: 500, current_value: 600 }],
      stocks: [],
      'term-deposits': {
        apy: 0.12,
        entries: [{ date: '2026-07-31', installment_amount: 200, current_value: 220 }],
      },
    })

    expect(ledgers.getEntries('mutual-funds')).toEqual([
      { date: '2026-07-31', installment_amount: 500, current_value: 600 },
    ])
    expect(ledgers.getEntries('stocks')).toEqual([])
    expect(ledgers.getEntries('term-deposits')).toEqual([
      {
        date: '2026-07-31',
        installment_amount: 200,
        current_value: 220,
        term_months: 12,
        maturity_date: '',
      },
    ])
    expect(ledgers.getApy()).toBe(0.12)
    expect(ledgers.getResult('stocks')).toBeNull()
  })

  it('restoreAll clones entries so later edits do not mutate the payload', () => {
    const ledgers = useLedgers()
    const payload = {
      'mutual-funds': [{ date: '2026-07-31', installment_amount: 500, current_value: 600 }],
      stocks: [],
      'term-deposits': { apy: 0.06, entries: [] },
    }
    ledgers.restoreAll(payload)
    ledgers.getEntries('mutual-funds')[0].date = 'changed'
    expect(payload['mutual-funds'][0].date).toBe('2026-07-31')
  })
})