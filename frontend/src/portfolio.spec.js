import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePortfolio } from './composables/usePortfolio.js'
import { useLedgers } from './composables/useLedgers.js'
import OverviewView from './views/OverviewView.vue'
import { mountWith, resetLedgers, resetSettings } from './test/helpers.js'

// Mock chart.js chart components so the test never touches a canvas; we only
// assert on layout/data through the components' props.
vi.mock('vue-chartjs', () => ({
  Doughnut: { template: '<div class="donut-stub" />' },
  Line: { template: '<div class="line-stub" />' },
}))

beforeEach(() => {
  resetSettings()
  resetLedgers()
})

describe('usePortfolio', () => {
  it('computes per-asset invested, value, pnl, and roi', () => {
    const ledgers = useLedgers()
    // mutual-funds: invested 2200 (1100+1100), value 7700
    const portfolio = usePortfolio()
    const mf = portfolio.assets.value.find((a) => a.asset === 'mutual-funds')
    expect(mf.invested).toBe(2200)
    expect(mf.value).toBe(7700)
    expect(mf.pnl).toBe(5500)
    expect(mf.roi).toBeCloseTo(2.5, 5)
    expect(mf.latestDate).toBe('2026-06-30')
  })

  it('includes stock purchases in invested but not dividends', () => {
    const portfolio = usePortfolio()
    const stocks = portfolio.assets.value.find((a) => a.asset === 'stocks')
    // installments 700+700 + purchases 300+200 = 1900; value 1950
    expect(stocks.invested).toBe(1900)
    expect(stocks.value).toBe(1950)
    expect(stocks.roi).toBeCloseTo(50 / 1900, 5)
  })

  it('sums portfolio-wide totals across asset classes', () => {
    const portfolio = usePortfolio()
    // invested: 2200 + 1900 + 2000 (TD 1000+1000) = 6100
    // value: 7700 + 1950 + 2005 = 11655
    expect(portfolio.totalInvested.value).toBe(6100)
    expect(portfolio.totalValue.value).toBe(11655)
    expect(portfolio.totalPnl.value).toBe(5555)
    expect(portfolio.overallRoi.value).toBeCloseTo(5555 / 6100, 5)
  })

  it('exposes empty per-asset stats when the store has no entries', () => {
    const ledgers = useLedgers()
    ledgers.resetAll()
    ledgers.setEntries('mutual-funds', [])
    ledgers.setEntries('stocks', [])
    ledgers.setEntries('term-deposits', [])
    const portfolio = usePortfolio()
    expect(portfolio.totalInvested.value).toBe(0)
    expect(portfolio.totalValue.value).toBe(0)
    expect(portfolio.hasData.value).toBe(false)
    expect(portfolio.assets.value.every((a) => a.invested === 0)).toBe(true)
  })

  it('weights XIRR by current value across assets that have a result', () => {
    const ledgers = useLedgers()
    ledgers.setResult('mutual-funds', {
      summary: { xirr: 0.1 },
      ledger: [],
    })
    ledgers.setResult('stocks', { summary: { xirr: 0.5 }, ledger: [] })
    const portfolio = usePortfolio()
    // weights: mf value 7700, stocks value 1950 → (0.1*7700 + 0.5*1950)/9650
    const expected = (0.1 * 7700 + 0.5 * 1950) / 9650
    expect(portfolio.weightedXirr.value).toBeCloseTo(expected, 5)
  })

  it('returns null weighted XIRR when no asset has a result', () => {
    const portfolio = usePortfolio()
    expect(portfolio.weightedXirr.value).toBeNull()
  })

  it('builds a proportion series only for assets with positive value', () => {
    const portfolio = usePortfolio()
    const series = portfolio.proportionSeries.value
    expect(series).toHaveLength(3)
    const sum = series.reduce((total, item) => total + item.value, 0)
    expect(sum).toBe(11655)
    expect(series.every((item) => item.color && item.labelKey)).toBe(true)
  })

  it('aligns the line chart labels and datasets across asset dates', () => {
    const portfolio = usePortfolio()
    expect(portfolio.lineLabels.value).toEqual(['2026-05-31', '2026-06-30'])
    const mf = portfolio.lineDatasets.value.find((d) => d.labelKey === 'nav.mutualFunds')
    expect(mf.data).toEqual([6500, 7700])
  })
})

describe('OverviewView', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          symbol: '^JKSE',
          name: 'IDX Composite (IHSG)',
          period: '1y',
          points: [
            { date: '2026-04-30', close: 7000 },
            { date: '2026-05-01', close: 7100 },
            { date: '2026-05-31', close: 7200 },
          ],
        }),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders portfolio KPIs, per-asset cards, and charts', async () => {
    const wrapper = mountWith(OverviewView)
    expect(wrapper.findAll('.kpi-card')).toHaveLength(4)
    expect(wrapper.findAll('.summary-card')).toHaveLength(3)
    expect(wrapper.find('.donut-stub').exists()).toBe(true)
    expect(wrapper.find('.line-stub').exists()).toBe(true)
    expect(wrapper.text()).toContain('Total Invested')
    expect(wrapper.text()).toContain('Current Value')
  })

  it('renders the full-portfolio backup section', async () => {
    const wrapper = mountWith(OverviewView)
    expect(wrapper.text()).toContain('Full Portfolio Backup')
    expect(wrapper.text()).toContain('Backup All Data')
  })

  it('renders the benchmark comparison chart when data exists', async () => {
    const wrapper = mountWith(OverviewView)
    expect(wrapper.text()).toContain('Portfolio vs Index')
  })

  it('omits the benchmark chart in the empty state', async () => {
    const ledgers = useLedgers()
    ledgers.setEntries('mutual-funds', [])
    ledgers.setEntries('stocks', [])
    ledgers.setEntries('term-deposits', [])
    const wrapper = mountWith(OverviewView)
    expect(wrapper.text()).not.toContain('Portfolio vs Index')
  })

  it('renders the empty-state message when no data exists', async () => {
    const ledgers = useLedgers()
    ledgers.setEntries('mutual-funds', [])
    ledgers.setEntries('stocks', [])
    ledgers.setEntries('term-deposits', [])
    const wrapper = mountWith(OverviewView)
    expect(wrapper.find('.kpi-card').exists()).toBe(false)
    expect(wrapper.find('.ledger-empty').exists()).toBe(true)
  })
})
