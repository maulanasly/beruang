import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useDividendFocus } from './useDividendFocus'
import { resetSettings } from '../test/helpers.js'

function makeResponse(body, ok) {
  return { ok, json: async () => body, status: ok ? 200 : 422 }
}

describe('useDividendFocus', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    resetSettings()
  })

  it('loads dividend yields into items and asOf', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse(
          {
            as_of: '2026-08-08',
            items: [
              { symbol: 'TLKM.JK', name: 'Telkom', price: 3850, currency: 'IDR', dividend_yield: 0.084 },
              { symbol: 'BBCA.JK', name: 'BCA', price: 10250, currency: 'IDR', dividend_yield: 0.042 },
            ],
          },
          true,
        ),
      ),
    )

    const focus = useDividendFocus('')
    await focus.loadDividendFocus()

    expect(focus.items.value).toHaveLength(2)
    expect(focus.asOf.value).toBe('2026-08-08')
    expect(focus.loading.value).toBe(false)
    expect(focus.error.value).toBe('')
  })

  it('surfaces errors and clears items on refresh', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse({ detail: 'rate limited' }, false)),
    )

    const focus = useDividendFocus('')
    focus.items.value = [{ symbol: 'OLD.JK' }]
    await focus.refresh()

    expect(focus.items.value).toEqual([])
    expect(focus.error.value).toBe('rate limited')
  })

  it('skips re-fetch when data is already loaded', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        makeResponse(
          { as_of: '2026-08-08', items: [{ symbol: 'TLKM.JK' }] },
          true,
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const focus = useDividendFocus('')
    await focus.loadDividendFocus()
    await focus.loadDividendFocus()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refresh forces a re-fetch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        makeResponse(
          { as_of: '2026-08-08', items: [{ symbol: 'TLKM.JK' }] },
          true,
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const focus = useDividendFocus('')
    await focus.loadDividendFocus()
    await focus.refresh()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
