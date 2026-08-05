import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AssetCalculator from './AssetCalculator.vue'

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

function makeResponse(body, ok) {
  return { ok, json: async () => body, status: ok ? 200 : 422 }
}

describe('AssetCalculator', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('seeds mutual-funds seed rows and renders the entry grid', () => {
    const wrapper = mount(AssetCalculator, {
      props: { activeAsset: 'mutual-funds' },
      global: { stubs: { MarketHelper: true } },
    })
    const inputs = wrapper.findAll('input')
    // 2 seed rows × 3 fields (date, installment_amount, current_value)
    expect(inputs).toHaveLength(6)
    expect(wrapper.text()).toContain('POST')
  })

  it('emits calculated with the API body on a successful POST', async () => {
    const body = {
      summary: { total_installments: 2200, ending_value: 7700, xirr: 0.4 },
      ledger: [{ date: '2026-05-31' }, { date: '2026-06-30' }],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(body, true)))

    const wrapper = mount(AssetCalculator, {
      props: { activeAsset: 'mutual-funds' },
      global: { stubs: { MarketHelper: true } },
    })

    await wrapper.get('button.action').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('calculated')).toBeTruthy()
    expect(wrapper.emitted('calculated')[0][0]).toEqual(body)
  })

  it('rejects submission when a row is missing its date and emits error', async () => {
    const wrapper = mount(AssetCalculator, {
      props: { activeAsset: 'mutual-funds' },
      global: { stubs: { MarketHelper: true } },
    })
    await wrapper.get('input[type="date"]').setValue('') // blank the first row's date
    await wrapper.find('button.action').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('calculated')).toBeFalsy()
    expect(wrapper.emitted('error')).toBeTruthy()
    expect(wrapper.text()).toMatch(/Every row must include a date/)
  })

  it('renders validation errors from the API in the error block', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse(
          { detail: [{ loc: ['body', 'entries'], msg: 'min length' }] },
          false,
        ),
      ),
    )

    const wrapper = mount(AssetCalculator, {
      props: { activeAsset: 'mutual-funds' },
      global: { stubs: { MarketHelper: true } },
    })

    await wrapper.get('button.action').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('calculated')).toBeFalsy()
    expect(wrapper.find('.output.error').exists()).toBe(true)
    expect(wrapper.text()).toMatch(/Validation failed/)
    expect(wrapper.text()).toMatch(/body.entries: min length/)
  })

  it('adds and removes entry rows while keeping at least one row', async () => {
    const wrapper = mount(AssetCalculator, {
      props: { activeAsset: 'mutual-funds' },
      global: { stubs: { MarketHelper: true } },
    })
    // .entry-grid includes the header row + one grid per data row.
    const seedDataRows = wrapper.findAll('.entry-grid').length - 1
    expect(seedDataRows).toBe(2)

    // Add Row inserts a fresh empty row.
    await wrapper.get('button.mini:not(.danger)').trigger('click')
    expect(wrapper.findAll('.entry-grid').length - 1).toBe(seedDataRows + 1)

    // Remove the first data row; we drop back to the seed count.
    await wrapper.get('button.mini.danger').trigger('click')
    expect(wrapper.findAll('.entry-grid').length - 1).toBe(seedDataRows)

    // Remove once more: from the seed of 2 -> 1, leaving the Remove button disabled
    // (the form refuses to drop its last remaining row).
    await wrapper.get('button.mini.danger').trigger('click')
    expect(wrapper.findAll('.entry-grid').length - 1).toBe(1)

    const removeButton = wrapper.get('button.mini.danger')
    expect(removeButton.attributes('disabled')).toBeDefined()
  })

  it('renders the APY input only for term-deposits', () => {
    const td = mount(AssetCalculator, {
      props: { activeAsset: 'term-deposits' },
      global: { stubs: { MarketHelper: true } },
    })
    expect(td.find('#apy').exists()).toBe(true)

    const mf = mount(AssetCalculator, {
      props: { activeAsset: 'mutual-funds' },
      global: { stubs: { MarketHelper: true } },
    })
    expect(mf.find('#apy').exists()).toBe(false)
  })
})