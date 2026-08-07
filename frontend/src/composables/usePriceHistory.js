import { ref } from 'vue'
import { useMarket } from './useMarket'

export const PRICE_PERIODS = [
  { value: '1mo', labelKey: 'benchmark.period1mo' },
  { value: '3mo', labelKey: 'benchmark.period3mo' },
  { value: '6mo', labelKey: 'benchmark.period6mo' },
  { value: '1y', labelKey: 'benchmark.period1y' },
  { value: '5y', labelKey: 'benchmark.period5y' },
]

/**
 * Fetches daily closing price history for a single stock from the backend.
 * The configured market suffix is appended when missing so the data source
 * can resolve bare tickers (e.g. `BBCA` becomes `BBCA.JK` on IDX).
 */
export function usePriceHistory(baseUrl = '') {
  const points = ref([])
  const name = ref('')
  const currency = ref('')
  const symbol = ref('')
  const dividendYield = ref(null)
  const period = ref('1y')
  const loading = ref(false)
  const error = ref('')
  const loaded = ref(false)
  const { market } = useMarket()

  function reset() {
    points.value = []
    name.value = ''
    currency.value = ''
    dividendYield.value = null
    error.value = ''
    loaded.value = false
  }

  async function load() {
    const raw = String(symbol.value || '').trim().toUpperCase()
    if (raw.length < 3) {
      reset()
      return
    }

    const suffix = market.value.suffix || ''
    const query = raw.endsWith(suffix) ? raw : `${raw}${suffix}`

    loading.value = true
    error.value = ''

    try {
      const params = new URLSearchParams({ symbol: query, period: period.value })
      const response = await fetch(
        `${baseUrl}/api/v1/market-data/price/history?${params}`,
      )
      const body = await response.json()

      if (!response.ok) {
        throw new Error(body?.detail || 'Unable to load price history.')
      }

      points.value = Array.isArray(body?.points) ? body.points : []
      name.value = body?.name || query
      currency.value = body?.currency || ''
      dividendYield.value =
        body?.dividend_yield === null || body?.dividend_yield === undefined
          ? null
          : Number(body.dividend_yield)
      loaded.value = true
    } catch (loadError) {
      error.value = loadError.message
      points.value = []
      name.value = ''
      currency.value = ''
      dividendYield.value = null
      loaded.value = false
    } finally {
      loading.value = false
    }
  }

  return {
    points,
    name,
    currency,
    dividendYield,
    symbol,
    period,
    loading,
    error,
    loaded,
    load,
  }
}
