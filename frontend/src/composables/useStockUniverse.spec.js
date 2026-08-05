import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useStockUniverse } from './useStockUniverse'

function makeResponse(body, ok) {
  return { ok, json: async () => body, status: ok ? 200 : 422 }
}

describe('useStockUniverse', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
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

  it('fetchQuote refuses to call without a selected symbol and throws', async () => {
    const uni = useStockUniverse('')
    await expect(uni.fetchQuote()).rejects.toThrow('Choose a stock symbol')
    expect(uni.quoteStatus.value).toMatch(/Choose a stock symbol/)
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
})