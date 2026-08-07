import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useStockUniverse } from './useStockUniverse'
import { resetSettings } from '../test/helpers.js'

function makeResponse(body, ok) {
  return { ok, json: async () => body, status: ok ? 200 : 422 }
}

describe('useStockUniverse', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    resetSettings()
  })

  it('loadSymbols populates symbols and seeds selectedSymbol', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse(
          {
            items: [
              { symbol: 'BBCA.JK', name: 'Bank Central Asia' },
              { symbol: 'BBRI.JK', name: 'Bank Rakyat' },
            ],
          },
          true,
        ),
      ),
    )

    const uni = useStockUniverse('')
    await uni.loadSymbols()

    expect(uni.symbols.value).toHaveLength(2)
    expect(uni.selectedSymbol.value).toBe('BBCA.JK')
    expect(uni.loading.value).toBe(false)
    expect(uni.universeError.value).toBe('')
  })

  it('loadSymbols surfaces upstream errors into universeError and clears symbols', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse({ detail: 'rate limited' }, false)),
    )

    const uni = useStockUniverse('')
    uni.symbols.value = [{ symbol: 'OLD.JK', name: 'stale' }]
    await uni.loadSymbols()

    expect(uni.symbols.value).toEqual([])
    expect(uni.universeError.value).toBe('rate limited')
  })

  it('fetchQuote returns numeric price for a selected symbol', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({ symbol: 'BBCA.JK', name: 'BCA', price: 9100, currency: 'IDR' }, true),
      ),
    )

    const uni = useStockUniverse('')
    uni.selectedSymbol.value = 'BBCA.JK'
    const quote = await uni.fetchQuote()

    expect(quote).toEqual({ price: 9100, symbol: 'BBCA.JK', currency: 'IDR' })
    expect(uni.quoteLoading.value).toBe(false)
  })

  it('fetchAndStoreQuote stores the quote on lastQuote', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse({ symbol: 'BBCA.JK', name: 'BCA', price: 9125, currency: 'IDR' }, true),
      ),
    )

    const uni = useStockUniverse('')
    uni.selectedSymbol.value = 'BBCA.JK'
    expect(uni.lastQuote.value).toBeNull()

    const quote = await uni.fetchAndStoreQuote()
    expect(quote).toEqual({ price: 9125, symbol: 'BBCA.JK', currency: 'IDR' })
    expect(uni.lastQuote.value).toEqual({
      price: 9125,
      symbol: 'BBCA.JK',
      currency: 'IDR',
    })
  })

  it('fetchQuote refuses to call without a selected symbol and throws', async () => {
    const uni = useStockUniverse('')
    await expect(uni.fetchQuote()).rejects.toThrow('Choose a stock code')
    expect(uni.quoteStatus.value).toMatch(/Choose a stock code/)
  })

  it('syncTargetRowIndex clamps an out-of-range index back down', () => {
    const uni = useStockUniverse('')
    uni.targetRowIndex.value = 5
    uni.syncTargetRowIndex(2)
    expect(uni.targetRowIndex.value).toBe(2)
  })

  it('fetchQuote writes upstream failures into quoteStatus and rethrows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse({ detail: 'upstream down' }, false)),
    )

    const uni = useStockUniverse('')
    uni.selectedSymbol.value = 'BBCA.JK'
    await expect(uni.fetchQuote()).rejects.toThrow('upstream down')
    expect(uni.quoteStatus.value).toBe('upstream down')
  })

  it('syncAllQuotes fetches one quote per unique symbol, appending the market suffix', async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(
        makeResponse({ symbol: 'BBCA.JK', price: 9100, currency: 'IDR' }, true),
      )
      .mockResolvedValueOnce(
        makeResponse({ symbol: 'BBRI.JK', price: 4700, currency: 'IDR' }, true),
      )
    vi.stubGlobal('fetch', fetchMock)

    const uni = useStockUniverse('')
    const entries = [
      { symbol: 'BBCA', date: '2026-05-31', current_value: 1 },
      { symbol: 'BBCA', date: '2026-06-30', current_value: 2 },
      { symbol: 'BBRI', date: '2026-06-30', current_value: 3 },
    ]

    const { updated, failed } = await uni.syncAllQuotes(entries)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toContain('symbol=BBCA.JK')
    expect(fetchMock.mock.calls[1][0]).toContain('symbol=BBRI.JK')
    expect(updated).toEqual([
      { symbol: 'BBCA', price: 9100, currency: 'IDR', count: 2 },
      { symbol: 'BBRI', price: 4700, currency: 'IDR', count: 1 },
    ])
    expect(failed).toEqual([])
    expect(uni.syncing.value).toBe(false)
    expect(uni.quoteStatus.value).toMatch(/Updated prices/)
  })

  it('syncAllQuotes reports failed symbols separately and keeps results keyed by original symbol', async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(makeResponse({ symbol: 'BBCA.JK', price: 9100, currency: 'IDR' }, true))
      .mockResolvedValueOnce(makeResponse({ detail: 'rate limited' }, false))
    vi.stubGlobal('fetch', fetchMock)

    const uni = useStockUniverse('')
    const entries = [{ symbol: 'BBCA', current_value: 1 }, { symbol: 'GOTO', current_value: 2 }]

    const { updated, failed } = await uni.syncAllQuotes(entries)

    expect(updated).toEqual([{ symbol: 'BBCA', price: 9100, currency: 'IDR', count: 1 }])
    expect(failed).toEqual([{ symbol: 'GOTO', reason: 'rate limited' }])
    expect(uni.syncing.value).toBe(false)
  })

  it('syncAllQuotes short-circuits when no row has a symbol', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const uni = useStockUniverse('')
    const result = await uni.syncAllQuotes([{ date: '2026-05-31', current_value: 1 }])

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toEqual({ updated: [], failed: [] })
    expect(uni.quoteStatus.value).toMatch(/Add a stock code/)
  })

  it('syncAllQuotes leaves symbols already carrying the suffix untouched', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse({ symbol: 'BBCA.JK', price: 9100, currency: 'IDR' }, true),
    )
    vi.stubGlobal('fetch', fetchMock)

    const uni = useStockUniverse('')
    await uni.syncAllQuotes([{ symbol: 'BBCA.JK', current_value: 1 }])

    expect(fetchMock.mock.calls[0][0]).toContain('symbol=BBCA.JK')
  })
})