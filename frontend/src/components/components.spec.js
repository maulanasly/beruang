import { beforeAll, describe, expect, it, vi } from 'vitest'
import SummaryCards from './SummaryCards.vue'
import LedgerTable from './LedgerTable.vue'
import LatestMomentumKpi from './LatestMomentumKpi.vue'
import LineChart from './LineChart.vue'
import { mountWith } from '../test/helpers.js'

// Mock vue-chartjs before importing LineChart so chart.js never touches the
// canvas; the LineChart tests only assert on computed data (labels, datasets).
vi.mock('vue-chartjs', () => ({
  Line: { template: '<div class="line-stub" />' },
}))

beforeAll(() => {
  if (!window.IntersectionObserver) {
    window.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

describe('SummaryCards', () => {
  it('renders one card per summary key with title-cased labels', () => {
    const wrapper = mountWith(SummaryCards, {
      props: { summary: { total_installments: 2200, ending_value: 7700, xirr: 0.4 } },
    })
    const cards = wrapper.findAll('.summary-card')
    expect(cards).toHaveLength(3)
    expect(wrapper.text()).toContain('Installment')
  })

  it('equivalently accepts empty summary', () => {
    const wrapper = mountWith(SummaryCards, {
      props: { summary: {} },
    })
    expect(wrapper.findAll('.summary-card')).toHaveLength(0)
  })
})

describe('LedgerTable', () => {
  it('renders friendly column headers and the inline Capital Invested column', () => {
    const ledger = [
      { date: '2026-01-31', installment_amount: 1000, current_value: 1000, mom_return: 0 },
      { date: '2026-02-28', installment_amount: 1000, current_value: 2050, mom_return: 0.05 },
    ]
    const wrapper = mountWith(LedgerTable, { props: { ledger, asset: 'mutual-funds' } })
    const headers = wrapper.findAll('th').map((h) => h.text())
    expect(headers.some((h) => h.includes('Date'))).toBe(true)
    expect(headers.some((h) => h.includes('Installment'))).toBe(true)
    expect(headers.some((h) => h.includes('Current Value'))).toBe(true)
    expect(headers.some((h) => h.includes('MoM Return'))).toBe(true)
    // Capital Invested sits next to Current Value
    const indexOf = (needle) => headers.findIndex((h) => h.includes(needle))
    expect(indexOf('Capital Invested')).toBeLessThan(indexOf('Current Value'))
    // Cumulative invested stats: 1000 then 2000
    expect(wrapper.text()).toContain('1,000')
    expect(wrapper.text()).toContain('2,000')
    expect(wrapper.text()).toContain('5.00%')
  })

  it('colors positive MoM green and negative MoM red', () => {
    const ledger = [
      { date: '2026-01-31', mom_return: 0.05 },
      { date: '2026-02-28', mom_return: -0.02 },
    ]
    const wrapper = mountWith(LedgerTable, { props: { ledger, asset: 'mutual-funds' } })
    const cells = wrapper.findAll('tbody tr')
    const positiveMomCell = cells[0].findAll('td').find((td) => td.text().includes('5.00%'))
    const negativeMomCell = cells[1].findAll('td').find((td) => td.text().includes('2.00'))
    expect(positiveMomCell.classes()).toContain('mom-positive')
    expect(negativeMomCell.classes()).toContain('mom-negative')
  })

  it('highlights the latest row with the latest-row class', () => {
    const ledger = [
      { date: '2026-01-31', mom_return: 0 },
      { date: '2026-02-28', mom_return: 0.05 },
    ]
    const wrapper = mountWith(LedgerTable, { props: { ledger, asset: 'mutual-funds' } })
    const rows = wrapper.findAll('tbody tr')
    expect(rows[0].classes()).not.toContain('latest-row')
    expect(rows[rows.length - 1].classes()).toContain('latest-row')
  })

  it('shows an empty-state guidance line when the ledger is empty', () => {
    const wrapper = mountWith(LedgerTable, {
      props: { ledger: [], asset: 'mutual-funds' },
    })
    expect(wrapper.findAll('th')).toHaveLength(0)
    expect(wrapper.findAll('tbody tr')).toHaveLength(0)
    expect(wrapper.find('.ledger-empty').exists()).toBe(true)
    expect(wrapper.text()).toMatch(/Calculate Returns/)
  })

  it('renders a title suffix badge when titleSuffix is provided', () => {
    const ledger = [{ date: '2026-01-31', symbol: 'BBCA.JK', current_value: 1000 }]
    const wrapper = mountWith(LedgerTable, {
      props: { ledger, asset: 'stocks', titleSuffix: 'BBCA.JK' },
    })
    expect(wrapper.find('.section-symbol').exists()).toBe(true)
    expect(wrapper.text()).toContain('BBCA.JK')
  })

  it('strips the market suffix from stock code cells', () => {
    const ledger = [{ date: '2026-01-31', symbol: 'BBCA.JK', current_value: 1000 }]
    const wrapper = mountWith(LedgerTable, {
      props: { ledger, asset: 'stocks' },
    })
    expect(wrapper.text()).toContain('BBCA')
    expect(wrapper.text()).not.toContain('BBCA.JK')
  })

  it('adds glossary tips to jargon column headers', () => {
    const ledger = [{ date: '2026-01-31', symbol: 'BBCA.JK', current_value: 1000 }]
    const wrapper = mountWith(LedgerTable, {
      props: { ledger, asset: 'stocks' },
    })
    const stockCodeTip = wrapper
      .findAll('th')
      .find((th) => th.text().includes('Stock Code'))
      .find('.info-tip')
    expect(stockCodeTip.exists()).toBe(true)
    expect(stockCodeTip.attributes('title')).toMatch(/\.JK suffix/)
  })
})

describe('LatestMomentumKpi', () => {
  it('shows 4 cards for mutual funds: date, MoM, XIRR, TWR', () => {
    const ledger = [
      { date: '2026-01-31', mom_return: null },
      { date: '2026-02-28', mom_return: 0.03 },
    ]
    const summary = { xirr: 0.5, ending_value: 7700 }
    const wrapper = mountWith(LatestMomentumKpi, {
      props: { ledger, summary, asset: 'mutual-funds' },
    })
    expect(wrapper.findAll('.kpi-card')).toHaveLength(4)
    expect(wrapper.text()).toContain('Latest MoM')
    expect(wrapper.text()).toContain('3.00%')
    expect(wrapper.text()).toContain('TWR')
  })

  it('adds glossary tips to KPI cards so terms are self-explanatory', () => {
    const ledger = [{ date: '2026-02-28', mom_return: 0.03 }]
    const summary = { xirr: 0.5, roi: 0.2 }
    const wrapper = mountWith(LatestMomentumKpi, {
      props: { ledger, summary, asset: 'stocks' },
    })
    const tips = wrapper.findAll('.info-tip')
    expect(tips).toHaveLength(5)
    expect(tips[0].attributes('title')).toMatch(/Month-over-Month/)
    expect(tips[1].attributes('title')).toMatch(/Return on Investment/)
    expect(tips[2].attributes('title')).toMatch(/Extended Internal Rate/)
    expect(tips[3].attributes('title')).toMatch(/dividend/i)
    expect(tips[4].attributes('title')).toMatch(/Time-Weighted Return/)
  })

  it('shows 5 cards for stocks: date, MoM, ROI, XIRR, TWR', () => {
    const ledger = [{ date: '2026-02-28', mom_return: 0.07 }]
    const summary = { roi: 0.2, xirr: 0.6 }
    const wrapper = mountWith(LatestMomentumKpi, {
      props: { ledger, summary, asset: 'stocks' },
    })
    expect(wrapper.findAll('.kpi-card')).toHaveLength(6)
    expect(wrapper.text()).toContain('Latest ROI')
    expect(wrapper.text()).toContain('TWR')
  })

  it('shows 4 cards for term-deposits: date, prorated interest, APY, TWR', () => {
    const ledger = [{ date: '2026-02-28', prorated_interest: 4.5 }]
    const summary = { apy: 0.06 }
    const wrapper = mountWith(LatestMomentumKpi, {
      props: { ledger, summary, asset: 'term-deposits' },
    })
    expect(wrapper.findAll('.kpi-card')).toHaveLength(4)
    expect(wrapper.text()).toContain('Latest Prorated Interest')
    expect(wrapper.text()).toContain('6.00%')
    expect(wrapper.text()).toContain('TWR')
  })

  it('remains hidden when there is no ledger row', () => {
    const wrapper = mountWith(LatestMomentumKpi, {
      props: { ledger: [], summary: {}, asset: 'mutual-funds' },
    })
    expect(wrapper.find('.kpi-block').exists()).toBe(false)
  })
})

describe('LineChart series assembly', () => {
  it('builds Total Capital Invested vs Current Market Value for mutual funds', () => {
    const ledger = [
      { date: '2026-01-31', installment_amount: 1000, current_value: 1000 },
      { date: '2026-02-28', installment_amount: 1000, current_value: 2050 },
    ]
    const wrapper = mountWith(LineChart, { props: { ledger, asset: 'mutual-funds' } })
    const labels = wrapper.vm.labels
    const datasets = wrapper.vm.datasets
    expect(labels).toEqual(['2026-01-31', '2026-02-28'])
    expect(datasets[0].label).toBe('Total Contribution')
    expect(datasets[0].data).toEqual([1000, 2000])
    expect(datasets[1].label).toBe('Current Market Value')
    expect(datasets[1].data).toEqual([1000, 2050])
  })

  it('adds new_share_purchases into Total Contribution for stocks', () => {
    const ledger = [
      { date: '2026-01-31', installment_amount: 700, new_share_purchases: 300, current_value: 1000 },
      { date: '2026-02-28', installment_amount: 700, new_share_purchases: 200, current_value: 1950 },
    ]
    const wrapper = mountWith(LineChart, { props: { ledger, asset: 'stocks' } })
    expect(wrapper.vm.datasets[0].label).toBe('Total Contribution')
    expect(wrapper.vm.datasets[0].data).toEqual([1000, 1900])
  })

  it('plots expected vs current value for term-deposits', () => {
    const ledger = [
      { date: '2026-01-31', current_value: 1000, expected_month_end_value: 1005 },
      { date: '2026-02-28', current_value: 2005, expected_month_end_value: 2015 },
    ]
    const wrapper = mountWith(LineChart, { props: { ledger, asset: 'term-deposits' } })
    expect(wrapper.vm.datasets[0].label).toBe('Expected Value')
    expect(wrapper.vm.datasets[1].label).toBe('Current Market Value')
  })

  it('renders no chart section when the ledger is empty', () => {
    const wrapper = mountWith(LineChart, { props: { ledger: [], asset: 'mutual-funds' } })
    expect(wrapper.find('.chart-block').exists()).toBe(false)
  })
})