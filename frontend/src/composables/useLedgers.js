import { reactive, watchEffect } from 'vue'

const STORAGE_KEY = 'beruang.ledgers'

const DEFAULT_MF_ENTRIES = [
  { date: '2026-05-31', installment_amount: 1100, current_value: 6500 },
  { date: '2026-06-30', installment_amount: 1100, current_value: 7700 },
]

const DEFAULT_STOCK_ENTRIES = [
  {
    symbol: 'BBCA.JK',
    date: '2026-05-31',
    installment_amount: 700,
    new_share_purchases: 300,
    dividends: 0,
    current_value: 1000,
  },
  {
    symbol: 'BBCA.JK',
    date: '2026-06-30',
    installment_amount: 700,
    new_share_purchases: 200,
    dividends: 10,
    current_value: 1950,
  },
]

const DEFAULT_TD_ENTRIES = [
  { date: '2026-05-31', installment_amount: 1000, current_value: 1000 },
  { date: '2026-06-30', installment_amount: 1000, current_value: 2005 },
]

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

const ledgers = reactive({
  'mutual-funds': stored?.['mutual-funds'] ?? DEFAULT_MF_ENTRIES.map((e) => ({ ...e })),
  stocks: stored?.stocks ?? DEFAULT_STOCK_ENTRIES.map((e) => ({ ...e })),
  'term-deposits': {
    apy: stored?.['term-deposits']?.apy ?? 0.06,
    entries: stored?.['term-deposits']?.entries ?? DEFAULT_TD_ENTRIES.map((e) => ({ ...e })),
  },
  results: stored?.results ?? {
    'mutual-funds': null,
    stocks: null,
    'term-deposits': null,
  },
})

watchEffect(() => {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...ledgers }))
  } catch {
    // storage may be unavailable; ignore
  }
})

export function useLedgers() {
  function getEntries(asset) {
    if (asset === 'term-deposits') {
      return ledgers['term-deposits'].entries
    }
    return ledgers[asset]
  }

  function setEntries(asset, entries) {
    if (asset === 'term-deposits') {
      ledgers['term-deposits'].entries = entries
    } else {
      ledgers[asset] = entries
    }
  }

  function getApy() {
    return ledgers['term-deposits'].apy
  }

  function setApy(value) {
    ledgers['term-deposits'].apy = value
  }

  function getResult(asset) {
    return ledgers.results[asset]
  }

  function setResult(asset, value) {
    ledgers.results[asset] = value
  }

  function clearResult(asset) {
    ledgers.results[asset] = null
  }

  function resetAll() {
    ledgers['mutual-funds'] = DEFAULT_MF_ENTRIES.map((e) => ({ ...e }))
    ledgers.stocks = DEFAULT_STOCK_ENTRIES.map((e) => ({ ...e }))
    ledgers['term-deposits'] = {
      apy: 0.06,
      entries: DEFAULT_TD_ENTRIES.map((e) => ({ ...e })),
    }
    ledgers.results = {
      'mutual-funds': null,
      stocks: null,
      'term-deposits': null,
    }
  }

  function restoreAll(payload) {
    ledgers['mutual-funds'] = (payload?.['mutual-funds'] ?? []).map((e) => ({ ...e }))
    ledgers.stocks = (payload?.stocks ?? []).map((e) => ({ ...e }))
    const td = payload?.['term-deposits'] ?? {}
    ledgers['term-deposits'] = {
      apy: typeof td.apy === 'number' ? td.apy : 0.06,
      entries: (td.entries ?? []).map((e) => ({ ...e })),
    }
    ledgers.results = {
      'mutual-funds': null,
      stocks: null,
      'term-deposits': null,
    }
  }

  return {
    ledgers,
    getEntries,
    setEntries,
    getApy,
    setApy,
    getResult,
    setResult,
    clearResult,
    resetAll,
    restoreAll,
  }
}
