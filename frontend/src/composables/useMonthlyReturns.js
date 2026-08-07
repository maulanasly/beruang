import { computed } from 'vue'
import { useLedgers } from './useLedgers'

export const MONTHLY_RETURNS_ASSETS = ['mutual-funds', 'stocks', 'term-deposits']

function contributionsFor(asset, entry) {
  const installment = Number(entry?.installment_amount) || 0
  if (asset === 'stocks') {
    return installment + (Number(entry?.new_share_purchases) || 0)
  }
  return installment
}

function dividendsFor(asset, entry) {
  return asset === 'stocks' ? Number(entry?.dividends) || 0 : 0
}

function seriesFor(asset, entries) {
  const byDate = new Map()
  ;(entries || [])
    .filter((entry) => entry && entry.date != null)
    .forEach((entry) => {
      byDate.set(String(entry.date), entry)
    })
  const sorted = [...byDate.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  )

  return sorted.map((entry, index) => {
    const previous = index > 0 ? sorted[index - 1] : null
    const monthStartValue = previous ? Number(previous.current_value) || 0 : 0
    const currentValue = Number(entry.current_value) || 0
    const contributions = contributionsFor(asset, entry)
    const dividends = dividendsFor(asset, entry)
    return {
      date: String(entry.date),
      monthStartValue,
      currentValue,
      contributions,
      dividends,
      mom:
        monthStartValue > 0
          ? (currentValue - contributions + dividends - monthStartValue) /
            monthStartValue
          : null,
    }
  })
}

export function buildMonthlyReturns(entriesByAsset) {
  const series = {}
  const months = new Set()
  MONTHLY_RETURNS_ASSETS.forEach((asset) => {
    series[asset] = seriesFor(asset, entriesByAsset?.[asset])
    series[asset].forEach((row) => months.add(row.date))
  })
  const sortedMonths = [...months].sort()

  const byAsset = {}
  MONTHLY_RETURNS_ASSETS.forEach((asset) => {
    const lookup = new Map(series[asset].map((row) => [row.date, row.mom]))
    byAsset[asset] = sortedMonths.map((month) => lookup.get(month) ?? null)
  })

  const portfolio = sortedMonths.map((month) => {
    let sumValue = 0
    let sumContributions = 0
    let sumDividends = 0
    let sumStart = 0
    MONTHLY_RETURNS_ASSETS.forEach((asset) => {
      const row = series[asset].find((item) => item.date === month)
      if (!row) return
      sumValue += row.currentValue
      sumContributions += row.contributions
      sumDividends += row.dividends
      sumStart += row.monthStartValue
    })
    if (sumStart <= 0) return null
    return (sumValue - sumContributions + sumDividends - sumStart) / sumStart
  })

  return { months: sortedMonths, byAsset, portfolio }
}

export function useMonthlyReturns() {
  const ledgers = useLedgers()

  const data = computed(() =>
    buildMonthlyReturns({
      'mutual-funds': ledgers.getEntries('mutual-funds'),
      stocks: ledgers.getEntries('stocks'),
      'term-deposits': ledgers.getEntries('term-deposits'),
    }),
  )

  const hasData = computed(() => data.value.months.length >= 1)
  const insufficient = computed(() => data.value.months.length < 2)

  return { data, hasData, insufficient }
}
