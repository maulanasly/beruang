import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import PriceHistoryChart from './components/PriceHistoryChart.vue'
import { mountWith, resetSettings } from './test/helpers.js'

vi.mock('vue-chartjs', () => ({
  Line: { template: '<div class="line-stub" />' },
}))

function makeResponse(body, ok) {
  return { ok, json: async () => body, status: ok ? 200 : 502 }
}

function pointsResponse(overrides = {}) {
  return makeResponse(
    {
      symbol: 'BBCA.JK',
      name: 'Bank Central Asia',
      period: '1y',
      currency: 'IDR',
      points: [
        { date: '2026-05-01', close: 9050 },
        { date: '2026-05-02', close: 9125 },
      ],
      ...overrides,
    },
    true,
  )
}

beforeEach(() => {
  vi.unstubAllGlobals()
  resetSettings()
})

describe('PriceHistoryChart', () => {
  it('shows a hint when no symbol is entered and does not fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountWith(PriceHistoryChart, {
      props: { symbol: '', apiBaseUrl: '' },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Enter a stock code')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('renders the price line chart with period buttons for a valid symbol', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pointsResponse()))

    const wrapper = mountWith(PriceHistoryChart, {
      props: { symbol: 'BBCA.JK', apiBaseUrl: '' },
    })
    await flushPromises()

    expect(wrapper.find('.line-stub').exists()).toBe(true)
    expect(wrapper.text()).toContain('Price History')
    const buttons = wrapper.findAll('.mini').map((b) => b.text())
    expect(buttons).toEqual(['1M', '3M', '6M', '1Y', '5Y'])
    expect(wrapper.find('.yield-tag').exists()).toBe(false)
  })

  it('renders a dividend-yield tag when the response carries one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(pointsResponse({ dividend_yield: 0.0561 })),
    )

    const wrapper = mountWith(PriceHistoryChart, {
      props: { symbol: 'BBCA.JK', apiBaseUrl: '' },
    })
    await flushPromises()

    const tag = wrapper.find('.yield-tag')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toContain('Div yield')
    expect(tag.text()).toMatch(/5\.61%/)
  })

  it('shows a no-data note when the response has no points', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(pointsResponse({ points: [] })),
    )

    const wrapper = mountWith(PriceHistoryChart, {
      props: { symbol: 'BBCA.JK', apiBaseUrl: '' },
    })
    await flushPromises()

    expect(wrapper.find('.line-stub').exists()).toBe(false)
    expect(wrapper.text()).toContain('No historical price data')
  })

  it('shows the fetch-failed note when the request errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse({ detail: 'boom' }, false)),
    )

    const wrapper = mountWith(PriceHistoryChart, {
      props: { symbol: 'BBCA.JK', apiBaseUrl: '' },
    })
    await flushPromises()

    expect(wrapper.find('.line-stub').exists()).toBe(false)
    expect(wrapper.text()).toContain('Unable to load price history.')
  })

  it('reloads with the selected period when a period button is clicked', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(pointsResponse({ period: '6mo' }))
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountWith(PriceHistoryChart, {
      props: { symbol: 'BBCA.JK', apiBaseUrl: '' },
    })
    await flushPromises()

    const sixMonthButton = wrapper
      .findAll('.mini')
      .find((b) => b.text() === '6M')
    await sixMonthButton.trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const url = decodeURIComponent(String(fetchMock.mock.calls[1][0]))
    expect(url).toContain('period=6mo')
  })

  it('debounces reloads while the symbol keeps changing', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(pointsResponse())
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountWith(PriceHistoryChart, {
      props: { symbol: '', apiBaseUrl: '' },
    })
    await flushPromises()

    await wrapper.setProps({ symbol: 'BB' })
    await wrapper.setProps({ symbol: 'BBC' })
    await wrapper.setProps({ symbol: 'BBCA' })
    expect(fetchMock).not.toHaveBeenCalled()

    vi.advanceTimersByTime(400)
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
