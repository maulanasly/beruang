import { ref } from 'vue'

export const INDEX_OPTIONS = [
  { value: '^JKSE', labelKey: 'benchmark.idxComposite' },
  { value: '^LQ45', labelKey: 'benchmark.lq45' },
]

export const INDEX_PERIODS = [
  { value: '1mo', labelKey: 'benchmark.period1mo' },
  { value: '3mo', labelKey: 'benchmark.period3mo' },
  { value: '6mo', labelKey: 'benchmark.period6mo' },
  { value: '1y', labelKey: 'benchmark.period1y' },
  { value: '5y', labelKey: 'benchmark.period5y' },
]

/**
 * Aligns a portfolio value series against daily index closes and normalizes
 * both to 100 at the first portfolio date, so growth is directly comparable.
 *
 * `labels` and `values` are the portfolio's per-date market values. Returns
 * `null` when there is no overlap or fewer than two meaningful portfolio dates.
 */
export function buildComparison(labels, values, indexPoints) {
  const dates = (labels || []).map((date, index) => ({
    date: String(date),
    value: Number(values?.[index]),
  })).filter((point) => point.value > 0 && point.date)

  if (dates.length < 2 || !Array.isArray(indexPoints) || indexPoints.length === 0) {
    return null
  }

  const firstDate = dates[0].date
  const baseIndex = latestCloseOnOrBefore(indexPoints, firstDate)
  if (baseIndex === null) {
    return null
  }

  const series = dates.map((point) => ({
    date: point.date,
    portfolio: (point.value / dates[0].value) * 100,
    index: (latestCloseOnOrBefore(indexPoints, point.date) ?? baseIndex) / baseIndex * 100,
  }))

  return {
    labels: series.map((point) => point.date),
    datasets: [
      {
        labelKey: 'benchmark.portfolioSeries',
        data: series.map((point) => point.portfolio),
        borderColor: '#2563eb',
      },
      {
        labelKey: 'benchmark.indexSeries',
        data: series.map((point) => point.index),
        borderColor: '#8b5cf6',
      },
    ],
  }
}

function latestCloseOnOrBefore(indexPoints, date) {
  let latest = null
  for (const point of indexPoints) {
    if (String(point.date) <= date) {
      latest = Number(point.close)
    } else {
      break
    }
  }
  return latest
}

/**
 * Fetches benchmark index history from the backend. Used by the overview page
 * to compare portfolio growth against an index over a selectable window.
 */
export function useBenchmark(baseUrl = '') {
  const points = ref([])
  const symbol = ref(INDEX_OPTIONS[0].value)
  const period = ref(INDEX_PERIODS[3].value)
  const loading = ref(false)
  const error = ref('')
  const loaded = ref(false)

  async function load() {
    loading.value = true
    error.value = ''

    try {
      const params = new URLSearchParams({ symbol: symbol.value, period: period.value })
      const response = await fetch(
        `${baseUrl}/api/v1/market-data/index/history?${params}`,
      )
      const body = await response.json()

      if (!response.ok) {
        throw new Error(body?.detail || 'Unable to load index history.')
      }

      points.value = Array.isArray(body?.points) ? body.points : []
      loaded.value = true
    } catch (loadError) {
      error.value = loadError.message
      points.value = []
      loaded.value = false
    } finally {
      loading.value = false
    }
  }

  return {
    points,
    symbol,
    period,
    loading,
    error,
    loaded,
    load,
  }
}
