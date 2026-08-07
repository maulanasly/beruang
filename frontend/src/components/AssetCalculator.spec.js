import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AssetCalculator from './AssetCalculator.vue'
import { resetSettings, resetLedgers, provideOverlays } from '../test/helpers.js'

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

function makeResponse(body, ok) {
  return { ok, json: async () => body, status: ok ? 200 : 422 }
}

function mountCalc(asset, extra = {}) {
  return mount(AssetCalculator, {
    props: { activeAsset: asset },
    ...provideOverlays(extra),
  })
}

describe('AssetCalculator', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse({ items: [] }, true)),
    )
    resetSettings()
    resetLedgers()
  })

  it('seeds mutual-funds seed rows and renders the entry grid', () => {
    const wrapper = mountCalc('mutual-funds')
    const inputs = wrapper.findAll('input')
    expect(inputs).toHaveLength(6)
    expect(wrapper.text()).toContain('POST')
  })

  it('emits calculated with the API body on a successful POST', async () => {
    const body = {
      summary: { total_installments: 2200, ending_value: 7700, xirr: 0.4 },
      ledger: [{ date: '2026-05-31' }, { date: '2026-06-30' }],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(body, true)))

    const wrapper = mountCalc('mutual-funds')
    await wrapper.get('button.action').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('calculated')).toBeTruthy()
    expect(wrapper.emitted('calculated')[0][0]).toEqual(body)
  })

  it('rejects submission when a row is missing its date and emits error', async () => {
    const wrapper = mountCalc('mutual-funds')
    await wrapper.get('input[type="date"]').setValue('')
    await wrapper.get('button.action').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('calculated')).toBeFalsy()
    expect(wrapper.emitted('error')).toBeTruthy()
    expect(wrapper.text()).toMatch(/date/i)
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

    const wrapper = mountCalc('mutual-funds')
    await wrapper.get('button.action').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('calculated')).toBeFalsy()
    expect(wrapper.find('.output.error').exists()).toBe(true)
    expect(wrapper.text()).toMatch(/body.entries: min length/)
  })

  it('adds and removes entry rows while keeping at least one row', async () => {
    const wrapper = mountCalc('mutual-funds')
    const seedDataRows = wrapper.findAll('.entry-grid').length - 1
    expect(seedDataRows).toBe(2)

    await wrapper.get('button.mini:not(.danger)').trigger('click')
    expect(wrapper.findAll('.entry-grid').length - 1).toBe(seedDataRows + 1)

    await wrapper.get('button.mini.danger').trigger('click')
    expect(wrapper.findAll('.entry-grid').length - 1).toBe(seedDataRows)

    await wrapper.get('button.mini.danger').trigger('click')
    expect(wrapper.findAll('.entry-grid').length - 1).toBe(1)

    const removeButton = wrapper.get('button.mini.danger')
    expect(removeButton.attributes('disabled')).toBeDefined()
  })

  it('renders the APY input only for term-deposits', () => {
    const td = mountCalc('term-deposits')
    expect(td.find('#apy').exists()).toBe(true)

    const mf = mountCalc('mutual-funds')
    expect(mf.find('#apy').exists()).toBe(false)
  })

  it('shows a Stock Code column on stock rows but not on mutual-fund rows', () => {
    const stocks = mountCalc('stocks')
    const headerText = stocks.find('.entry-grid-header').text()
    expect(headerText).toContain('Stock Code')
    const firstRowSymbolInput = stocks.findAll('input')[0]
    expect(firstRowSymbolInput.element.value).toBe('BBCA.JK')
  })

  it('strips frontend-only fields (symbol) from the POST payload', async () => {
    let capturedPayload = null
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_, opts) => {
        capturedPayload = JSON.parse(opts.body)
        return Promise.resolve(makeResponse({ summary: {}, ledger: [] }, true))
      }),
    )

    const wrapper = mountCalc('stocks')
    await wrapper.get('button.action').trigger('click')
    await flushPromises()

    expect(capturedPayload.entries[0]).not.toHaveProperty('symbol')
    expect(capturedPayload.entries[0]).toHaveProperty('date')
  })

  it('merges the symbol back onto the returned ledger rows', async () => {
    const body = {
      summary: { xirr: 0.5 },
      ledger: [{ date: '2026-05-31' }, { date: '2026-06-30' }],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(body, true)))

    const wrapper = mountCalc('stocks')
    await wrapper.get('button.action').trigger('click')
    await flushPromises()

    const emitted = wrapper.emitted('calculated')
    expect(emitted).toBeTruthy()
    const emittedLedger = emitted[0][0].ledger
    expect(emittedLedger[0].symbol).toBe('BBCA.JK')
    expect(emittedLedger[1].symbol).toBe('BBCA.JK')
  })
})