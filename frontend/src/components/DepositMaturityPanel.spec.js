import { beforeEach, describe, expect, it } from 'vitest'
import DepositMaturityPanel from './DepositMaturityPanel.vue'
import { mountWith, resetSettings } from '../test/helpers.js'

beforeEach(() => {
  resetSettings()
})

function mountPanel(overrides = {}) {
  return mountWith(DepositMaturityPanel, {
    props: {
      summary: {},
      ledger: [],
      ...overrides,
    },
  })
}

const LEDGER = [
  {
    date: '2026-01-31',
    installment_amount: 1000,
    current_value: 1000,
    term_months: 12,
    maturity_date: '2027-01-31',
    days_to_maturity: 215,
    maturity_status: 'active',
    maturity_value: 1060,
    accrued_interest: 30,
  },
  {
    date: '2025-01-31',
    installment_amount: 5000,
    current_value: 5000,
    term_months: 12,
    maturity_date: '2026-01-31',
    days_to_maturity: -189,
    maturity_status: 'matured',
    maturity_value: 5300,
    accrued_interest: 300,
  },
]

const SUMMARY = {
  apy: 0.06,
  next_maturity_date: '2027-01-31',
  total_accrued_interest: 330,
  rollover_value: 5300,
}

describe('DepositMaturityPanel', () => {
  it('is collapsed by default', () => {
    const wrapper = mountPanel()
    expect(wrapper.find('.dividend-focus-body').exists()).toBe(false)
    expect(wrapper.text()).toContain('Maturity & Rollover Tracker')
  })

  it('hints when there is no calculated result', async () => {
    const wrapper = mountPanel()
    await wrapper.find('.dividend-focus-toggle').trigger('click')
    expect(wrapper.text()).toContain('Calculate returns to see')
  })

  it('renders maturity rows and status chips when opened with data', async () => {
    const wrapper = mountPanel({ ledger: LEDGER, summary: SUMMARY })
    await wrapper.find('.dividend-focus-toggle').trigger('click')

    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(wrapper.text()).toContain('Matured')
    expect(wrapper.text()).toContain('Active')
    expect(wrapper.text()).toContain('215 days left')
    expect(wrapper.text()).toContain('Matured 189 days ago')
  })

  it('renders summary cards from the returned summary', async () => {
    const wrapper = mountPanel({ ledger: LEDGER, summary: SUMMARY })
    await wrapper.find('.dividend-focus-toggle').trigger('click')

    expect(wrapper.text()).toContain('Next Maturity')
    expect(wrapper.text()).toContain('2027-01-31')
    expect(wrapper.text()).toContain('Total Accrued Interest')
    expect(wrapper.text()).toContain('Rollover Value')
    expect(wrapper.text()).toContain('6.00%')
  })

  it('flags matured and near-maturity rows as rollover candidates', async () => {
    const wrapper = mountPanel({ ledger: LEDGER, summary: SUMMARY })
    await wrapper.find('.dividend-focus-toggle').trigger('click')

    expect(wrapper.text()).toContain('Matured')
    expect(wrapper.text()).toContain('roll over principal + interest or withdraw')
  })

  it('shows the rollover amount for deposits maturing within 30 days', async () => {
    const nearLedger = [
      {
        date: '2026-07-01',
        installment_amount: 2000,
        current_value: 2000,
        term_months: 12,
        maturity_date: '2026-08-01',
        days_to_maturity: 10,
        maturity_status: 'active',
        maturity_value: 2120,
        accrued_interest: 10,
      },
    ]
    const wrapper = mountPanel({
      ledger: nearLedger,
      summary: { ...SUMMARY, rollover_value: 2120 },
    })
    await wrapper.find('.dividend-focus-toggle').trigger('click')

    expect(wrapper.text()).toContain('Maturing soon')
    expect(wrapper.text()).toContain('2,120.00')
  })

  it('does not render the table when the ledger has no maturity rows', async () => {
    const wrapper = mountPanel({ ledger: [{ date: '2026-01-31' }] })
    await wrapper.find('.dividend-focus-toggle').trigger('click')
    expect(wrapper.findAll('tbody tr')).toHaveLength(0)
    expect(wrapper.text()).toContain('Calculate returns to see')
  })
})
