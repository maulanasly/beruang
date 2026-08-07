import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettings } from './useSettings'

const STORAGE_KEY = 'beruang.settings'

beforeEach(() => {
  localStorage.clear()
  // Reset the shared reactive object to defaults before each test.
  const settings = useSettings()
  settings.locale = 'en-US'
  settings.currency = 'USD'
  settings.market = 'IDX'
})

describe('useSettings', () => {
  it('exposes a reactive locale, currency and market', () => {
    const settings = useSettings()
    expect(settings.locale).toBe('en-US')
    expect(settings.currency).toBe('USD')
    expect(settings.market).toBe('IDX')
  })

  it('returns the same singleton across calls', () => {
    expect(useSettings()).toBe(useSettings())
  })

  it('persists changes to localStorage', () => {
    const settings = useSettings()
    settings.locale = 'id-ID'
    settings.currency = 'IDR'
    settings.market = 'US'
    // reactive writes flush via watchEffect; allow a microtask
    return Promise.resolve().then(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
      expect(stored.locale).toBe('id-ID')
      expect(stored.currency).toBe('IDR')
      expect(stored.market).toBe('US')
    })
  })

  it('hydrates from localStorage on module init', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ locale: 'id-ID', currency: 'IDR', market: 'US' }),
    )
    // Force a re-import so the module-level loadStored() runs with our fixture.
    vi.resetModules()
    const mod = await import('./useSettings')
    const settings = mod.useSettings()
    expect(settings.locale).toBe('id-ID')
    expect(settings.currency).toBe('IDR')
    expect(settings.market).toBe('US')
  })

  it('updates <html lang> to match the locale primary subtag', async () => {
    const settings = useSettings()
    settings.locale = 'id-ID'
    await Promise.resolve()
    expect(document.documentElement.lang).toBe('id')
  })
})