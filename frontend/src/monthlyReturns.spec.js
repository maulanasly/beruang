import { beforeEach, describe, expect, it } from 'vitest'
import MonthlyReturnsTable from './components/MonthlyReturnsTable.vue'
import { useLedgers } from './composables/useLedgers.js'
import { mountWith, resetLedgers, resetSettings } from './test/helpers.js'

beforeEach(() => {
  resetSettings()
  resetLedgers()
})

describe('MonthlyReturnsTable', () => {
  it('renders headers for every asset class plus the portfolio column', () => {
    const wrapper = mountWith(MonthlyReturnsTable)
    const headers = wrapper.findAll('th').map((th) => th.text())
    expect(headers.some((h) => h.includes('Month'))).toBe(true)
    expect(headers.some((h) => h.includes('Mutual Funds'))).toBe(true)
    expect(headers.some((h) => h.includes('Stocks'))).toBe(true)
    expect(headers.some((h) => h.includes('Term Deposits'))).toBe(true)
    expect(headers.some((h) => h.includes('Portfolio'))).toBe(true)
  })

  it('shows an em dash for the opening month and formatted percentages after', () => {
    const wrapper = mountWith(MonthlyReturnsTable)
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    const firstCells = rows[0].findAll('td').map((td) => td.text())
    expect(firstCells[0]).toBe('2026-05-31')
    expect(firstCells.slice(1)).toEqual(['—', '—', '—', '—'])
    expect(rows[1].text()).toContain('6.00%')
    expect(rows[1].text()).toContain('0.50%')
  })

  it('colors positive months green and negative months red', () => {
    const ledgers = useLedgers()
    ledgers.setEntries('stocks', [
      { symbol: 'BBCA.JK', date: '2026-05-31', installment_amount: 700, new_share_purchases: 300, dividends: 0, current_value: 1000 },
      { symbol: 'BBCA.JK', date: '2026-06-30', installment_amount: 700, new_share_purchases: 200, dividends: 0, current_value: 900 },
    ])
    const wrapper = mountWith(MonthlyReturnsTable)
    const cells = wrapper.findAll('tbody tr')[1].findAll('td')
    const negative = cells.find((td) => td.classes().includes('mom-negative'))
    expect(negative.exists()).toBe(true)
    expect(cells.some((td) => td.classes().includes('mom-positive'))).toBe(true)
  })

  it('highlights the latest month row', () => {
    const wrapper = mountWith(MonthlyReturnsTable)
    const rows = wrapper.findAll('tbody tr')
    expect(rows[0].classes()).not.toContain('latest-row')
    expect(rows[rows.length - 1].classes()).toContain('latest-row')
  })

  it('shows a hint when entries span fewer than two months', () => {
    const ledgers = useLedgers()
    ledgers.setEntries('mutual-funds', [{ date: '2026-05-31', installment_amount: 1000, current_value: 1000 }])
    ledgers.setEntries('stocks', [])
    ledgers.setEntries('term-deposits', [])
    const wrapper = mountWith(MonthlyReturnsTable)
    expect(wrapper.findAll('tbody tr')).toHaveLength(0)
    expect(wrapper.find('.table-wrap').exists()).toBe(false)
    expect(wrapper.text()).toContain('Add entries across at least two months')
  })

  it('renders nothing when there are no entries', () => {
    const ledgers = useLedgers()
    ledgers.setEntries('mutual-funds', [])
    ledgers.setEntries('stocks', [])
    ledgers.setEntries('term-deposits', [])
    const wrapper = mountWith(MonthlyReturnsTable)
    expect(wrapper.find('.monthly-returns').exists()).toBe(false)
  })
})
