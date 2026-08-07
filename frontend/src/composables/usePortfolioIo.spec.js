import { describe, expect, it } from 'vitest'
import {
  PORTFOLIO_ASSETS,
  PORTFOLIO_BACKUP_APP,
  PORTFOLIO_BACKUP_VERSION,
  exportPortfolioJson,
  parsePortfolioJson,
} from './usePortfolioIo.js'

const LEDGERS = {
  'mutual-funds': [
    { date: '2026-05-31', installment_amount: 1100, current_value: 6500 },
  ],
  stocks: [
    {
      symbol: 'BBCA.JK',
      date: '2026-05-31',
      installment_amount: 700,
      new_share_purchases: 300,
      dividends: 0,
      current_value: 1000,
    },
  ],
  'term-deposits': {
    apy: 0.08,
    entries: [
      { date: '2026-05-31', installment_amount: 1000, current_value: 1000 },
    ],
  },
}

const SETTINGS = { locale: 'id-ID', currency: 'IDR', market: 'IDX' }

function backupFor(overrides = {}) {
  const base = exportPortfolioJson(LEDGERS, SETTINGS)
  return JSON.parse(base) && { ...JSON.parse(base), ...overrides }
}

describe('exportPortfolioJson', () => {
  it('wraps all asset classes, apy, and settings in a versioned envelope', () => {
    const parsed = JSON.parse(exportPortfolioJson(LEDGERS, SETTINGS))
    expect(parsed.app).toBe(PORTFOLIO_BACKUP_APP)
    expect(parsed.version).toBe(PORTFOLIO_BACKUP_VERSION)
    expect(typeof parsed.exportedAt).toBe('string')
    expect(parsed.settings).toEqual(SETTINGS)
    expect(parsed.ledgers['mutual-funds']).toEqual(LEDGERS['mutual-funds'])
    expect(parsed.ledgers.stocks).toEqual(LEDGERS.stocks)
    expect(parsed.ledgers['term-deposits']).toEqual(LEDGERS['term-deposits'])
  })

  it('round-trips through parsePortfolioJson', () => {
    const json = exportPortfolioJson(LEDGERS, SETTINGS)
    const { ok, data, errors } = parsePortfolioJson(json)
    expect(errors).toEqual([])
    expect(ok).toBe(true)
    expect(data.ledgers).toEqual(LEDGERS)
    expect(data.settings).toEqual(SETTINGS)
  })
})

describe('parsePortfolioJson', () => {
  it('rejects invalid JSON', () => {
    const { ok, errors } = parsePortfolioJson('{not json')
    expect(ok).toBe(false)
    expect(errors[0]).toMatchObject({ type: 'invalidJson' })
  })

  it('rejects a non-object document', () => {
    const { ok, errors } = parsePortfolioJson('[1, 2, 3]')
    expect(ok).toBe(false)
    expect(errors[0]).toMatchObject({ type: 'invalidStructure' })
  })

  it('rejects a document from another app', () => {
    const bad = backupFor({ app: 'other-app' })
    const { ok, errors } = parsePortfolioJson(JSON.stringify(bad))
    expect(ok).toBe(false)
    expect(errors[0]).toMatchObject({ type: 'invalidApp' })
  })

  it('rejects a missing ledgers object', () => {
    const bad = backupFor()
    delete bad.ledgers
    const { ok, errors } = parsePortfolioJson(JSON.stringify(bad))
    expect(ok).toBe(false)
    expect(errors[0]).toMatchObject({ type: 'invalidStructure' })
  })

  it('rejects a missing asset class', () => {
    const bad = backupFor()
    delete bad.ledgers.stocks
    const { ok, errors } = parsePortfolioJson(JSON.stringify(bad))
    expect(ok).toBe(false)
    expect(errors).toEqual([
      expect.objectContaining({ type: 'invalidStructure', field: 'stocks' }),
    ])
  })

  it('rejects a non-object term-deposits entry', () => {
    const bad = backupFor()
    bad.ledgers['term-deposits'] = []
    const { ok, errors } = parsePortfolioJson(JSON.stringify(bad))
    expect(ok).toBe(false)
    expect(errors).toEqual([
      expect.objectContaining({ type: 'invalidStructure', field: 'term-deposits' }),
    ])
  })

  it('rejects invalid dates and numbers inside entries', () => {
    const bad = backupFor()
    bad.ledgers['mutual-funds'] = [
      { date: 'not-a-date', installment_amount: 100, current_value: 200 },
    ]
    const { ok, errors } = parsePortfolioJson(JSON.stringify(bad))
    expect(ok).toBe(false)
    expect(errors).toEqual([
      expect.objectContaining({ type: 'invalidDate', line: 1 }),
    ])
  })

  it('rejects a non-numeric apy', () => {
    const bad = backupFor()
    bad.ledgers['term-deposits'].apy = 'high'
    const { ok, errors } = parsePortfolioJson(JSON.stringify(bad))
    expect(ok).toBe(false)
    expect(errors).toEqual([
      expect.objectContaining({ type: 'invalidNumber', field: 'apy' }),
    ])
  })

  it('keeps only known settings keys and ignores unknown ones', () => {
    const bad = backupFor()
    bad.settings = { locale: 'en-US', currency: 'IDR', market: 'IDX', junk: 'x' }
    const { ok, data } = parsePortfolioJson(JSON.stringify(bad))
    expect(ok).toBe(true)
    expect(data.settings).toEqual({ locale: 'en-US', currency: 'IDR', market: 'IDX' })
  })

  it('drops unsupported settings values', () => {
    const bad = backupFor()
    bad.settings = { locale: 'fr-FR', currency: 'EUR', market: 'CN' }
    const { ok, data } = parsePortfolioJson(JSON.stringify(bad))
    expect(ok).toBe(true)
    expect(data.settings).toEqual({})
  })
})

describe('PORTFOLIO_ASSETS', () => {
  it('covers every supported asset class', () => {
    expect(PORTFOLIO_ASSETS.sort()).toEqual([
      'mutual-funds',
      'stocks',
      'term-deposits',
    ])
  })
})
