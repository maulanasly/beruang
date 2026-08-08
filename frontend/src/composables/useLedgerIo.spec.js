import { describe, expect, it } from 'vitest'
import {
  ASSET_COLUMNS,
  exportLedgerCsv,
  exportLedgerCsvTemplate,
  exportLedgerJson,
  parseLedgerCsv,
  parseLedgerJson,
} from './useLedgerIo.js'

const MF_ENTRIES = [
  { date: '2026-05-31', installment_amount: 1100, current_value: 6500 },
  { date: '2026-06-30', installment_amount: 1100, current_value: 7700 },
]

const STOCK_ENTRIES = [
  {
    symbol: 'BBCA.JK',
    date: '2026-05-31',
    installment_amount: 700,
    new_share_purchases: 300,
    dividends: 0,
    dividend_yield: 0,
    current_value: 1000,
  },
]

const TD_ENTRIES = [
  {
    date: '2026-05-31',
    installment_amount: 1000,
    current_value: 1000,
    term_months: 12,
    maturity_date: '2027-05-31',
  },
]

describe('exportLedgerCsv', () => {
  it('writes a header row and one line per entry', () => {
    const csv = exportLedgerCsv('mutual-funds', MF_ENTRIES)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('date,installment_amount,current_value')
    expect(lines).toHaveLength(3)
  })

  it('includes the symbol column for stocks', () => {
    const csv = exportLedgerCsv('stocks', STOCK_ENTRIES)
    expect(csv.split('\n')[0]).toBe(
      'symbol,date,installment_amount,new_share_purchases,dividends,dividend_yield,current_value',
    )
  })

  it('includes term and maturity columns for term deposits', () => {
    const csv = exportLedgerCsv('term-deposits', TD_ENTRIES)
    expect(csv.split('\n')[0]).toBe(
      'date,installment_amount,current_value,term_months,maturity_date',
    )
  })
})

describe('parseLedgerCsv', () => {
  it('round-trips exported mutual-fund rows', () => {
    const csv = exportLedgerCsv('mutual-funds', MF_ENTRIES)
    const { entries, errors } = parseLedgerCsv('mutual-funds', csv)
    expect(errors).toEqual([])
    expect(entries).toEqual(MF_ENTRIES)
  })

  it('round-trips exported stock rows including the symbol', () => {
    const csv = exportLedgerCsv('stocks', STOCK_ENTRIES)
    const { entries, errors } = parseLedgerCsv('stocks', csv)
    expect(errors).toEqual([])
    expect(entries).toEqual(STOCK_ENTRIES)
  })

  it('reports a missing-header error for wrong headers', () => {
    const { entries, errors } = parseLedgerCsv('mutual-funds', 'date,amount\n2026-01-31,5\n')
    expect(entries).toEqual([])
    expect(errors[0]).toMatchObject({ type: 'missingHeader', line: 1 })
  })

  it('reports invalid dates with the offending line number', () => {
    const csv = 'date,installment_amount,current_value\nnot-a-date,100,200\n2026-06-30,100,300\n'
    const { entries, errors } = parseLedgerCsv('mutual-funds', csv)
    expect(entries).toHaveLength(1)
    expect(errors).toEqual([
      expect.objectContaining({ type: 'invalidDate', line: 2 }),
    ])
  })

  it('reports invalid numbers and keeps them out of the result', () => {
    const csv = 'date,installment_amount,current_value\n2026-05-31,abc,200\n'
    const { entries, errors } = parseLedgerCsv('mutual-funds', csv)
    expect(entries).toHaveLength(0)
    expect(errors).toEqual([
      expect.objectContaining({ type: 'invalidNumber', line: 2, field: 'installment_amount' }),
    ])
  })

  it('treats an empty file as an empty error', () => {
    const { entries, errors } = parseLedgerCsv('mutual-funds', '')
    expect(entries).toEqual([])
    expect(errors[0]).toMatchObject({ type: 'empty' })
  })

  it('handles quoted fields containing commas', () => {
    const csv = 'date,installment_amount,current_value\n"2026-05-31",100,200\n'
    const { entries, errors } = parseLedgerCsv('mutual-funds', csv)
    expect(errors).toEqual([])
    expect(entries[0].date).toBe('2026-05-31')
  })
})

describe('exportLedgerJson / parseLedgerJson', () => {
  it('wraps entries with asset metadata and round-trips', () => {
    const json = exportLedgerJson('term-deposits', TD_ENTRIES)
    const parsed = JSON.parse(json)
    expect(parsed.asset).toBe('term-deposits')
    expect(parsed.version).toBe(1)
    expect(Array.isArray(parsed.entries)).toBe(true)

    const { entries, errors } = parseLedgerJson('term-deposits', json)
    expect(errors).toEqual([])
    expect(entries).toEqual(TD_ENTRIES)
  })

  it('accepts a bare array of entries', () => {
    const { entries, errors } = parseLedgerJson(
      'mutual-funds',
      JSON.stringify(MF_ENTRIES),
    )
    expect(errors).toEqual([])
    expect(entries).toEqual(MF_ENTRIES)
  })

  it('rejects invalid JSON', () => {
    const { entries, errors } = parseLedgerJson('mutual-funds', '{not json')
    expect(entries).toEqual([])
    expect(errors[0]).toMatchObject({ type: 'invalidJson' })
  })

  it('reports invalid dates and non-numeric fields', () => {
    const bad = [
      { date: 'bad', installment_amount: 100, current_value: 200 },
      { date: '2026-06-30', installment_amount: 'nope', current_value: 300 },
    ]
    const { entries, errors } = parseLedgerJson('mutual-funds', JSON.stringify(bad))
    expect(entries).toHaveLength(0)
    expect(errors).toEqual([
      expect.objectContaining({ type: 'invalidDate', line: 1 }),
      expect.objectContaining({ type: 'invalidNumber', line: 2 }),
    ])
  })
})

describe('exportLedgerCsvTemplate', () => {
  it('writes the header plus a sample row', () => {
    const csv = exportLedgerCsvTemplate('stocks')
    const lines = csv.split('\n')
    expect(lines[0]).toBe(
      'stock code,date,installment_amount,new_share_purchases,dividends,dividend_yield,current_value',
    )
    expect(lines[1]).toBe('BBCA,2026-07-31,1000,1000,1000,1000,1000')
  })

  it('produces a template that parses back to one valid sample entry', () => {
    const csv = exportLedgerCsvTemplate('mutual-funds')
    const { entries, errors } = parseLedgerCsv('mutual-funds', csv)
    expect(errors).toEqual([])
    expect(entries).toEqual([
      { date: '2026-07-31', installment_amount: 1000, current_value: 1000 },
    ])
  })

  it('accepts the stock code alias when parsing stock templates', () => {
    const csv = exportLedgerCsvTemplate('stocks')
    const { entries, errors } = parseLedgerCsv('stocks', csv)
    expect(errors).toEqual([])
    expect(entries[0]).toMatchObject({
      symbol: 'BBCA',
      date: '2026-07-31',
      installment_amount: 1000,
      current_value: 1000,
    })
  })
})

describe('ASSET_COLUMNS', () => {
  it('defines columns for every supported asset class', () => {
    expect(Object.keys(ASSET_COLUMNS).sort()).toEqual([
      'mutual-funds',
      'stocks',
      'term-deposits',
    ])
  })
})
