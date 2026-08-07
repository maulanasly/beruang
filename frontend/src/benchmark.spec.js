import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import BenchmarkChart from './components/BenchmarkChart.vue'
import { mountWith, resetLedgers, resetSettings } from './test/helpers.js'

vi.mock('vue-chartjs', () => ({
  Line: { template: '<div class="line-stub" />' },
}))

const OVERLAPPING_POINTS = [
  { date: '2026-04-30', close: 7000 },
  { date: '2026-05-01', close: 7100 },
  { date: '2026-05-31', close: 7200 },
]

function makeIndexResponse(points) {
  return {
    ok: true,
    json: async () => ({
      symbol: '^JKSE',
      name: 'IDX Composite (IHSG)',
      period: '1y',
      points,
    }),
  }
}

beforeEach(() => {
  resetSettings()
  resetLedgers()
  vi.unstubAllGlobals()
})

function mountChart(values = [5000, 6000]) {
  return mountWith(BenchmarkChart, {
    props: {
      labels: ['2026-05-01', '2026-06-01'],
      values,
    },
  })
}

describe('BenchmarkChart', () => {
  it('renders the title, index selector, and period buttons', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeIndexResponse(OVERLAPPING_POINTS)))
    const wrapper = mountChart()
    await flushPromises()

    expect(wrapper.text()).toContain('Portfolio vs Index')
    expect(wrapper.text()).toContain('IDX Composite (IHSG)')
    expect(wrapper.text()).toContain('1M')
    expect(wrapper.text()).toContain('1Y')
  })

  it('renders the comparison chart once benchmark data overlaps', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeIndexResponse(OVERLAPPING_POINTS)))
    const wrapper = mountChart()
    expect(wrapper.find('.line-stub').exists()).toBe(false)
    await flushPromises()
    expect(wrapper.find('.line-stub').exists()).toBe(true)
  })

  it('shows a no-overlap message when index history does not overlap entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeIndexResponse([
          { date: '2026-07-01', close: 7400 },
          { date: '2026-07-02', close: 7500 },
        ]),
      ),
    )
    const wrapper = mountChart()
    await flushPromises()

    expect(wrapper.text()).toContain('does not overlap')
    expect(wrapper.find('.line-stub').exists()).toBe(false)
  })

  it('shows a fetch error message when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ detail: 'boom' }) }),
    )
    const wrapper = mountChart()
    await flushPromises()

    expect(wrapper.text()).toContain('Unable to load index data.')
    expect(wrapper.find('.line-stub').exists()).toBe(false)
  })

  it('shows a hint when the portfolio has fewer than two usable dates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeIndexResponse(OVERLAPPING_POINTS)))
    const wrapper = mountWith(BenchmarkChart, {
      props: {
        labels: ['2026-05-01'],
        values: [5000],
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('at least two dates')
    expect(wrapper.find('.line-stub').exists()).toBe(false)
  })

  it('re-fetches with the selected period when a period button is clicked', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeIndexResponse(OVERLAPPING_POINTS))
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountChart()
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const monthButton = wrapper.findAll('button').find((b) => b.text() === '1M')
    await monthButton.trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const url = decodeURIComponent(String(fetchMock.mock.calls[1][0]))
    expect(url).toContain('period=1mo')
  })
})
