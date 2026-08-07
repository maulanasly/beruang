import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildComparison, useBenchmark } from './useBenchmark.js'

function makeResponse(body, ok) {
  return { ok, json: async () => body, status: ok ? 200 : 502 }
}

describe('buildComparison', () => {
  const indexPoints = [
    { date: '2026-04-30', close: 7000 },
    { date: '2026-05-01', close: 7100 },
    { date: '2026-05-31', close: 7200 },
    { date: '2026-06-01', close: 7300 },
  ]

  it('normalizes portfolio and index to 100 at the first portfolio date', () => {
    const result = buildComparison(
      ['2026-05-01', '2026-06-01'],
      [5000, 6000],
      indexPoints,
    )
    expect(result).not.toBeNull()
    expect(result.labels).toEqual(['2026-05-01', '2026-06-01'])
    expect(result.datasets[0]).toMatchObject({
      labelKey: 'benchmark.portfolioSeries',
      data: [100, 120],
    })
    expect(result.datasets[1]).toMatchObject({
      labelKey: 'benchmark.indexSeries',
      data: [100, expect.closeTo((7300 / 7100) * 100, 5)],
    })
  })

  it('aligns each portfolio date to the latest index close on or before it', () => {
    const result = buildComparison(
      ['2026-05-15', '2026-06-01'],
      [5000, 6000],
      indexPoints,
    )
    const index = result.datasets[1].data
    expect(index[0]).toBe(100)
    expect(index[1]).toBeCloseTo((7300 / 7100) * 100, 5)
  })

  it('returns null with fewer than two usable portfolio dates', () => {
    expect(buildComparison(['2026-05-01'], [5000], indexPoints)).toBeNull()
    expect(buildComparison(['2026-05-01', '2026-06-01'], [5000, 0], indexPoints)).toBeNull()
  })

  it('returns null when index history does not overlap', () => {
    const future = [
      { date: '2026-07-01', close: 7400 },
      { date: '2026-07-02', close: 7500 },
    ]
    expect(buildComparison(['2026-05-01', '2026-06-01'], [5000, 6000], future)).toBeNull()
  })

  it('returns null when index history is empty', () => {
    expect(buildComparison(['2026-05-01', '2026-06-01'], [5000, 6000], [])).toBeNull()
  })
})

describe('useBenchmark', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('load fetches index history with symbol and period params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse(
        {
          symbol: '^JKSE',
          name: 'IDX Composite (IHSG)',
          period: '1y',
          points: [{ date: '2026-05-01', close: 7100 }],
        },
        true,
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const benchmark = useBenchmark('')
    await benchmark.load()

    const url = decodeURIComponent(String(fetchMock.mock.calls[0][0]))
    expect(url).toContain('/api/v1/market-data/index/history')
    expect(url).toContain('symbol=^JKSE')
    expect(url).toContain('period=1y')
    expect(benchmark.points.value).toEqual([{ date: '2026-05-01', close: 7100 }])
    expect(benchmark.loading.value).toBe(false)
    expect(benchmark.error.value).toBe('')
  })

  it('load surfaces upstream errors and clears points', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse({ detail: 'rate limited' }, false)),
    )

    const benchmark = useBenchmark('')
    benchmark.points.value = [{ date: '2026-05-01', close: 7100 }]
    await benchmark.load()

    expect(benchmark.points.value).toEqual([])
    expect(benchmark.error.value).toBe('rate limited')
    expect(benchmark.loaded.value).toBe(false)
  })
})
