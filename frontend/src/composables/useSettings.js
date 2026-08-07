import { reactive, watchEffect } from 'vue'

const STORAGE_KEY = 'beruang.settings'

const DEFAULT_LOCALE =
  typeof navigator !== 'undefined' && navigator.language?.startsWith('id')
    ? 'id-ID'
    : 'en-US'
const DEFAULT_CURRENCY = 'IDR' // beruang tracks IDX instruments
const DEFAULT_MARKET = 'IDX'

function loadStored() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const stored = loadStored()

const settings = reactive({
  locale: stored?.locale || DEFAULT_LOCALE,
  currency: stored?.currency || DEFAULT_CURRENCY,
  market: stored?.market || DEFAULT_MARKET,
})

watchEffect(() => {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings }))
  } catch {
    // storage may be unavailable (private mode, disabled); ignore
  }
})

/** Update <html lang> so browser UI / a11y / :lang() CSS all follow. */
watchEffect(() => {
  if (typeof document === 'undefined') return
  document.documentElement.lang = String(settings.locale).split('-')[0]
})

export function useSettings() {
  return settings
}