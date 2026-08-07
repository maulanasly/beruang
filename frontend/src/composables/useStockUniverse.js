import { ref } from 'vue'
import i18n from '../i18n/index.js'
import { useMarket } from './useMarket'

/**
 * Loads the Kompas 100 starter symbols and fetches a live quote for the
 * selected symbol. Used by the stocks asset class only.
 */
export function useStockUniverse(baseUrl = '') {
  const symbols = ref([])
  const selectedSymbol = ref('')
  const targetRowIndex = ref(0)
  const loading = ref(false)
  const universeError = ref('')
  const quoteLoading = ref(false)
  const quoteStatus = ref('')
  const lastQuote = ref(null)
  const syncing = ref(false)
  const searching = ref(false)
  const { market, displaySymbol } = useMarket()

  function syncTargetRowIndex(maxIndex) {
    if (targetRowIndex.value > maxIndex) {
      targetRowIndex.value = Math.max(0, maxIndex)
    }
  }

  async function loadSymbols() {
    loading.value = true
    universeError.value = ''

    try {
      const response = await fetch(`${baseUrl}/api/v1/market-data/idx/kompas100`)
      const body = await response.json()

      if (!response.ok) {
        throw new Error(body?.detail || 'Failed to load IDX stock list.')
      }

      symbols.value = Array.isArray(body?.items) ? body.items : []
      if (!selectedSymbol.value && symbols.value.length) {
        selectedSymbol.value = symbols.value[0].symbol
      }
    } catch (loadError) {
      universeError.value = loadError.message
      symbols.value = []
    } finally {
      loading.value = false
    }
  }

  async function searchSymbols(query) {
    const trimmed = String(query || '').trim()
    if (!trimmed) return
    searching.value = true
    universeError.value = ''

    try {
      const params = new URLSearchParams({ q: trimmed })
      const response = await fetch(
        `${baseUrl}/api/v1/market-data/idx/search?${params}`,
      )
      const body = await response.json()

      if (!response.ok) {
        throw new Error(body?.detail || 'Failed to search IDX stocks.')
      }

      symbols.value = Array.isArray(body?.items) ? body.items : []
    } catch (searchError) {
      universeError.value = searchError.message
      symbols.value = []
    } finally {
      searching.value = false
    }
  }

  async function fetchQuote() {
    quoteStatus.value = ''

    if (!selectedSymbol.value) {
      quoteStatus.value = i18n.global.t('market.chooseStockCode')
      throw new Error(quoteStatus.value)
    }

    quoteLoading.value = true
    try {
      const params = new URLSearchParams({ symbol: selectedSymbol.value })
      const response = await fetch(
        `${baseUrl}/api/v1/market-data/quote?${params}`,
      )
      const body = await response.json()

      if (!response.ok) {
        throw new Error(body?.detail || 'Unable to fetch latest quote.')
      }

      return {
        price: Number(body.price),
        symbol: body.symbol,
        currency: body.currency,
        dividend_yield:
          body.dividend_yield === null || body.dividend_yield === undefined
            ? null
            : Number(body.dividend_yield),
      }
    } catch (quoteError) {
      quoteStatus.value = quoteError.message
      throw quoteError
    } finally {
      quoteLoading.value = false
    }
  }

  /**
   * Fetch a quote and remember it on `lastQuote` so the UI can render a
   * formatted "Last Fetched Price" card. Returns the quote for callers that
   * also want to apply it to a ledger row.
   */
  async function fetchAndStoreQuote() {
    const quote = await fetchQuote()
    lastQuote.value = quote
    return quote
  }

  /**
   * Fetch live quotes for every unique symbol found across the given ledger
   * entries. Symbols that already carry the configured market suffix are
   * queried as-is; others get the suffix appended so the data source can
   * resolve them (e.g. `BBCA` becomes `BBCA.JK` on the IDX market).
   *
   * Returns per-symbol results keyed by the original entry symbol:
   * `{ updated: [{ symbol, price, currency, count }], failed: [{ symbol, reason }] }`.
   */
  async function syncAllQuotes(entries) {
    const rows = Array.isArray(entries) ? entries : []
    const unique = [
      ...new Set(
        rows
          .map((row) => row?.symbol)
          .filter((symbol) => typeof symbol === 'string' && symbol.trim() !== '')
          .map((symbol) => symbol.trim()),
      ),
    ]

    if (unique.length === 0) {
      quoteStatus.value = i18n.global.t('market.syncNoSymbols')
      return { updated: [], failed: [] }
    }

    syncing.value = true
    quoteStatus.value = ''
    const suffix = market.value.suffix || ''

    try {
      const results = await Promise.allSettled(
        unique.map((symbol) => {
          const query = symbol.endsWith(suffix) ? symbol : `${symbol}${suffix}`
          return fetch(`${baseUrl}/api/v1/market-data/quote?symbol=${encodeURIComponent(query)}`)
            .then(async (response) => {
              const body = await response.json()
              if (!response.ok) {
                throw new Error(body?.detail || 'Quote request failed.')
              }
              return { symbol, ...body }
            })
        }),
      )

      const updated = []
      const failed = []
      results.forEach((result, index) => {
        const symbol = unique[index]
        if (result.status === 'fulfilled') {
          updated.push({
            symbol,
            price: Number(result.value.price),
            currency: result.value.currency,
            dividend_yield:
              result.value.dividend_yield === null ||
              result.value.dividend_yield === undefined
                ? null
                : Number(result.value.dividend_yield),
            count: rows.filter((row) => row?.symbol?.trim() === symbol).length,
          })
        } else {
          failed.push({ symbol, reason: result.reason?.message || 'Unknown error' })
        }
      })

      const yields = updated
        .filter((row) => typeof row.dividend_yield === 'number')
        .map(
          (row) =>
            `${displaySymbol(row.symbol)} ${(row.dividend_yield * 100).toFixed(2)}%`,
        )

      quoteStatus.value = i18n.global.t('market.syncSummary', {
        updated: updated.length,
        failed: failed.length,
      })
      if (yields.length) {
        quoteStatus.value += ' · ' + i18n.global.t('market.syncYields', {
          yields: yields.join(', '),
        })
      }
      return { updated, failed }
    } finally {
      syncing.value = false
    }
  }

  return {
    symbols,
    selectedSymbol,
    targetRowIndex,
    loading,
    universeError,
    quoteLoading,
    quoteStatus,
    lastQuote,
    syncing,
    searching,
    syncTargetRowIndex,
    loadSymbols,
    searchSymbols,
    fetchQuote,
    fetchAndStoreQuote,
    syncAllQuotes,
  }
}