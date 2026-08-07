import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PRICE_PERIODS, usePriceHistory } from './usePriceHistory.js'
import { resetSettings } from '../test/helpers.js'

function makeResponse(body, ok) {
  return { ok, json: async () => body, status: ok ? 200 : 502 }
}

beforeEach(() => {
  vi.unstubAllGlobals()
  resetSettings()
})

describe('PRICE_PERIODS', () => {
  it('exposes the supported window options', () => {
    expect(PRICE_PERIODS.map((p) => p.value)).toEqual([
      '1mo',
      '3mo',
      '6mo',
      '1y',
      '5y',
    ])
  })
})

describe('usePriceHistory', () => {
  it('load fetches history with symbol and period params, appending the market suffix', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse(
        {
          symbol: 'BBCA.JK',
          name: 'Bank Central Asia',
          period: '1y',
          currency: 'IDR',
          dividend_yield: 0.0561,
          points: [{ date: '2026-05-01', close: 9050 }],
        },
        true,
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const history = usePriceHistory('')
    history.symbol.value = 'BBCA'
    await history.load()

    const url = decodeURIComponent(String(fetchMock.mock.calls[0][0]))
    expect(url).toContain('/api/v1/market-data/price/history')
    expect(url).toContain('symbol=BBCA.JK')
    expect(url).toContain('period=1y')
    expect(history.points.value).toEqual([{ date: '2026-05-01', close: 9050 }])
    expect(history.name.value).toBe('Bank Central Asia')
    expect(history.currency.value).toBe('IDR')
    expect(history.dividendYield.value).toBe(0.0561)
    expect(history.loaded.value).toBe(true)
  })

  it('does not double the suffix when the symbol already carries it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse({ points: [] }, true))
    vi.stubGlobal('fetch', fetchMock)

    const history = usePriceHistory('')
    history.symbol.value = 'TLKM.JK'
    await history.load()

    const url = decodeURIComponent(String(fetchMock.mock.calls[0][0]))
    expect(url).toContain('symbol=TLKM.JK')
  })

  it('leaves bare symbols unchanged on markets without a suffix', async () => {
    resetSettings({ market: 'US' })
    const fetchMock = vi.fn().mockResolvedValue(makeResponse({ points: [] }, true))
    vi.stubGlobal('fetch', fetchMock)

    const history = usePriceHistory('')
    history.symbol.value = 'AAPL'
    await history.load()

    const url = decodeURIComponent(String(fetchMock.mock.calls[0][0]))
    expect(url).toContain('symbol=AAPL')
  })

  it('clears state without fetching for symbols shorter than 3 chars', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const history = usePriceHistory('')
    history.symbol.value = 'AB'
    await history.load()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(history.points.value).toEqual([])
    expect(history.loaded.value).toBe(false)
  })

  it('surfaces upstream errors and clears points', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse({ detail: 'rate limited' }, false)),
    )

    const history = usePriceHistory('')
    history.symbol.value = 'BBCA.JK'
    history.points.value = [{ date: '2026-05-01', close: 9050 }]
    history.dividendYield.value = 0.0561
    await history.load()

    expect(history.points.value).toEqual([])
    expect(history.dividendYield.value).toBeNull()
    expect(history.error.value).toBe('rate limited')
    expect(history.loaded.value).toBe(false)
  })
})
