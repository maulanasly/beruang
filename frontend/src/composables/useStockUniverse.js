import { ref } from 'vue'

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

  async function fetchQuote() {
    quoteStatus.value = ''

    if (!selectedSymbol.value) {
      quoteStatus.value = 'Choose a stock symbol first.'
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

  return {
    symbols,
    selectedSymbol,
    targetRowIndex,
    loading,
    universeError,
    quoteLoading,
    quoteStatus,
    lastQuote,
    syncTargetRowIndex,
    loadSymbols,
    fetchQuote,
    fetchAndStoreQuote,
  }
}