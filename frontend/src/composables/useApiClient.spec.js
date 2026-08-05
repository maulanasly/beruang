import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useApiClient, formatApiError } from './useApiClient'

function makeResponse(body, ok) {
  return {
    ok,
    json: async () => body,
    status: ok ? 200 : 422,
  }
}

describe('formatApiError', () => {
  it('formats validation detail arrays into loc: msg lines', () => {
    const detail = [
      { loc: ['body', 'entries', 0, 'date'], msg: 'invalid date' },
      { loc: ['body', 'apy'], msg: 'required' },
    ]
    const out = formatApiError(detail)
    expect(out.title).toMatch(/Validation failed/)
    expect(out.lines).toEqual(['body.entries.0.date: invalid date', 'body.apy: required'])
  })

  it('passes a non-empty string detail through as the title', () => {
    expect(formatApiError('boom')).toEqual({ title: 'boom', lines: [] })
  })

  it('falls back to a generic title for missing/empty detail', () => {
    expect(formatApiError(undefined).title).toMatch(/Request failed/)
    expect(formatApiError('   ').title).toMatch(/Request failed/)
  })
})

describe('useApiClient.calculateReturns', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('stores a successful body on result and returns it', async () => {
    const body = { summary: { xirr: 0.5 }, ledger: [{ date: '2026-01-31' }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(body, true)))

    const client = useApiClient()
    const out = await client.calculateReturns('/api/v1/mutual-funds/returns', { entries: [] })

    expect(out).toEqual(body)
    expect(client.result.value).toEqual(body)
    expect(client.error.value).toBe('')
    expect(client.isLoading.value).toBe(false)
  })

  it('flattens validation errors into error + errorLines', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeResponse(
          {
            detail: [{ loc: ['body', 'entries'], msg: 'min length' }],
          },
          false,
        ),
      ),
    )

    const client = useApiClient()
    const out = await client.calculateReturns('/x', { entries: [] })

    expect(out).toBeNull()
    expect(client.result.value).toBeNull()
    expect(client.error.value).toMatch(/Validation failed/)
    expect(client.errorLines.value).toEqual(['body.entries: min length'])
  })

  it('captures network failures into error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const client = useApiClient()
    const out = await client.calculateReturns('/x', {})

    expect(out).toBeNull()
    expect(client.error.value).toBe('network down')
    expect(client.errorLines.value).toEqual([])
  })

  it('toggles isLoading around the request', async () => {
    let resolve
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () => new Promise((res) => { resolve = res }),
      ),
    )

    const client = useApiClient()
    const pending = client.calculateReturns('/x', {})
    expect(client.isLoading.value).toBe(true)
    resolve(makeResponse({ ok: true }, true))
    await pending
    expect(client.isLoading.value).toBe(false)
  })
})