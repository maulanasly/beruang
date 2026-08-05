import { beforeAll, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SummaryCards from './SummaryCards.vue'
import LedgerTable from './LedgerTable.vue'
import LatestMomentumKpi from './LatestMomentumKpi.vue'
import LineChart from './LineChart.vue'
import { useFormatter } from '../composables/useFormatter'
import { ref } from 'vue'

// chart.js needs a 2D canvas context that happy-dom does not provide; stub it
// with a Proxy that answers any canvas-2D method call as a no-op so the Line
// component mounts without noisy "can't acquire context" errors.
beforeAll(() => {
  const noopContext = new Proxy({}, { get: () => () => {} })
  HTMLCanvasElement.prototype.getContext = () => noopContext
  if (!window.IntersectionObserver) {
    window.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

const formatter = useFormatter(ref('en-US'), ref('USD'))

function provideFormatter() {
  return {
    global: { provide: { formatter } },
  }
}

describe('SummaryCards', () => {
  it('renders one card per summary key with title-cased labels', () => {
    const wrapper = mount(
      SummaryCards,
      {
        props: { summary: { total_installments: 2200, ending_value: 7700, xirr: 0.4 } },
        ...provideFormatter(),
      },
    )
    const cards = wrapper.findAll('.summary-card')
    expect(cards).toHaveLength(3)
    expect(wrapper.text()).toContain('Total Installments')
  })

  it('equivalently accepts empty summary', () => {
    const wrapper = mount(SummaryCards, {
      props: { summary: {} },
      ...provideFormatter(),
    })
    expect(wrapper.findAll('.summary-card')).toHaveLength(0)
  })
})

describe('LedgerTable', () => {
  it('derives columns from the first row and formats percent cells', () => {
    const ledger = [
      { date: '2026-01-31', installment_amount: 1000, mom_return: 0 },
      { date: '2026-02-28', installment_amount: 1000, mom_return: 0.05 },
    ]
    const wrapper = mount(LedgerTable, {
      props: { ledger },
      ...provideFormatter(),
    })
    const headers = wrapper.findAll('th')
    expect(headers.map((h) => h.text())).toEqual(['date', 'installment_amount', 'mom_return'])
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(wrapper.text()).toContain('5.00%')
  })

  it('renders nothing for an empty ledger', () => {
    const wrapper = mount(LedgerTable, {
      props: { ledger: [] },
      ...provideFormatter(),
    })
    expect(wrapper.findAll('th')).toHaveLength(0)
    expect(wrapper.findAll('tbody tr')).toHaveLength(0)
  })
})

describe('LatestMomentumKpi', () => {
  it('shows 3 cards for mutual funds: latest date, MoM, XIRR', () => {
    const ledger = [
      { date: '2026-01-31', mom_return: null },
      { date: '2026-02-28', mom_return: 0.03 },
    ]
    const summary = { xirr: 0.5, ending_value: 7700 }
    const wrapper = mount(LatestMomentumKpi, {
      props: { ledger, summary, asset: 'mutual-funds' },
      ...provideFormatter(),
    })
    expect(wrapper.findAll('.kpi-card')).toHaveLength(3)
    expect(wrapper.text()).toContain('Latest MoM')
    expect(wrapper.text()).toContain('3.00%')
  })

  it('shows 4 cards for stocks: date, MoM, ROI, XIRR', () => {
    const ledger = [{ date: '2026-02-28', mom_return: 0.07 }]
    const summary = { roi: 0.2, xirr: 0.6 }
    const wrapper = mount(LatestMomentumKpi, {
      props: { ledger, summary, asset: 'stocks' },
      ...provideFormatter(),
    })
    expect(wrapper.findAll('.kpi-card')).toHaveLength(4)
    expect(wrapper.text()).toContain('Latest ROI')
  })

  it('shows 3 cards for term-deposits: date, prorated interest, APY', () => {
    const ledger = [{ date: '2026-02-28', prorated_interest: 4.5 }]
    const summary = { apy: 0.06 }
    const wrapper = mount(LatestMomentumKpi, {
      props: { ledger, summary, asset: 'term-deposits' },
      ...provideFormatter(),
    })
    expect(wrapper.findAll('.kpi-card')).toHaveLength(3)
    expect(wrapper.text()).toContain('Latest Prorated Interest')
    expect(wrapper.text()).toContain('6.00%')
  })

  it('remains hidden when there is no ledger row', () => {
    const wrapper = mount(LatestMomentumKpi, {
      props: { ledger: [], summary: {}, asset: 'mutual-funds' },
      ...provideFormatter(),
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
    const wrapper = mount(LineChart, {
      props: { ledger, asset: 'mutual-funds' },
    })
    const labels = wrapper.vm.labels
    const datasets = wrapper.vm.datasets
    expect(labels).toEqual(['2026-01-31', '2026-02-28'])
    expect(datasets[0].label).toBe('Total Capital Invested')
    expect(datasets[0].data).toEqual([1000, 2000])
    expect(datasets[1].label).toBe('Current Market Value')
    expect(datasets[1].data).toEqual([1000, 2050])
  })

  it('adds new_share_purchases into Total Contribution for stocks', () => {
    const ledger = [
      { date: '2026-01-31', installment_amount: 700, new_share_purchases: 300, current_value: 1000 },
      { date: '2026-02-28', installment_amount: 700, new_share_purchases: 200, current_value: 1950 },
    ]
    const wrapper = mount(LineChart, { props: { ledger, asset: 'stocks' } })
    expect(wrapper.vm.datasets[0].label).toBe('Total Contribution')
    expect(wrapper.vm.datasets[0].data).toEqual([1000, 1900])
  })

  it('plots expected vs current value for term-deposits', () => {
    const ledger = [
      { date: '2026-01-31', current_value: 1000, expected_month_end_value: 1005 },
      { date: '2026-02-28', current_value: 2005, expected_month_end_value: 2015 },
    ]
    const wrapper = mount(LineChart, { props: { ledger, asset: 'term-deposits' } })
    expect(wrapper.vm.datasets[0].label).toBe('Expected Value')
    expect(wrapper.vm.datasets[1].label).toBe('Current Value')
  })

  it('renders no chart section when the ledger is empty', () => {
    const wrapper = mount(LineChart, { props: { ledger: [], asset: 'mutual-funds' } })
    expect(wrapper.find('.chart-block').exists()).toBe(false)
  })
})