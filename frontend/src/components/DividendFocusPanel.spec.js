import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import DividendFocusPanel from './DividendFocusPanel.vue'
import { mountWith, resetSettings } from '../test/helpers.js'

function makeResponse(body, ok) {
  return { ok, json: async () => body, status: ok ? 200 : 502 }
}

const YIELD_ITEMS = {
  as_of: '2026-08-08',
  items: [
    { symbol: 'TLKM.JK', name: 'Telkom Indonesia', price: 3850, currency: 'IDR', dividend_yield: 0.084 },
    { symbol: 'BBCA.JK', name: 'Bank Central Asia', price: 10250, currency: 'IDR', dividend_yield: 0.042 },
  ],
}

beforeEach(() => {
  resetSettings()
  vi.unstubAllGlobals()
})

function mountPanel(overrides = {}) {
  return mountWith(DividendFocusPanel, {
    props: {
      apiBaseUrl: '',
      summary: {},
      ...overrides,
    },
  })
}

describe('DividendFocusPanel', () => {
  it('is collapsed by default', () => {
    const wrapper = mountPanel()
    expect(wrapper.find('.dividend-focus-body').exists()).toBe(false)
    expect(wrapper.text()).toContain('Dividend Focus')
  })

  it('loads and renders the top dividend yield rows when opened', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(YIELD_ITEMS, true)))
    const wrapper = mountPanel()

    await wrapper.find('.dividend-focus-toggle').trigger('click')
    await flushPromises()

    expect(wrapper.find('.dividend-focus-body').isVisible()).toBe(true)
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(wrapper.text()).toContain('TLKM')
    expect(wrapper.text()).toContain('8.40%')
    expect(wrapper.text()).toContain('As of 2026-08-08')
  })

  it('emits apply with the symbol and dividend_yield when a row is applied', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(YIELD_ITEMS, true)))
    const wrapper = mountPanel()

    await wrapper.find('.dividend-focus-toggle').trigger('click')
    await flushPromises()

    const firstApply = wrapper.findAll('button').find((b) => b.text().includes('Apply to Row'))
    await firstApply.trigger('click')

    expect(wrapper.emitted('apply')).toBeTruthy()
    expect(wrapper.emitted('apply')[0][0]).toEqual({
      symbol: 'TLKM.JK',
      dividend_yield: 0.084,
    })
  })

  it('shows an error message when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({ detail: 'boom' }, false)))
    const wrapper = mountPanel()

    await wrapper.find('.dividend-focus-toggle').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Unable to load dividend yield data.')
  })

  it('renders the dividend snapshot when the summary carries estimates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(YIELD_ITEMS, true)))
    const wrapper = mountPanel({
      summary: {
        estimated_annual_dividend: 117,
        estimated_monthly_dividend: 9.75,
      },
    })
    await wrapper.find('.dividend-focus-toggle').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Your Dividend Snapshot')
    expect(wrapper.text()).toContain('117.00')
    expect(wrapper.text()).toContain('9.75')
  })

  it('hints when the summary has no dividend estimates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(YIELD_ITEMS, true)))
    const wrapper = mountPanel({ summary: {} })
    await wrapper.find('.dividend-focus-toggle').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Add dividend yield entries')
  })

  it('provides a refresh action that re-fetches data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(YIELD_ITEMS, true))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mountPanel()

    await wrapper.find('.dividend-focus-toggle').trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const refreshButton = wrapper.findAll('button').find((b) => b.text().includes('Refresh'))
    await refreshButton.trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
