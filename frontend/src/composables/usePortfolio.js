import { computed } from 'vue'
import { useLedgers } from './useLedgers'

const ASSET_ORDER = ['mutual-funds', 'stocks', 'term-deposits']

export const ASSET_COLORS = {
  'mutual-funds': '#2563eb',
  stocks: '#f25f3a',
  'term-deposits': '#10b981',
}

function sumInstallments(entries, withPurchases = false) {
  return entries.reduce((total, entry) => {
    total += Number(entry?.installment_amount) || 0
    if (withPurchases) {
      total += Number(entry?.new_share_purchases) || 0
    }
    return total
  }, 0)
}

export function usePortfolio() {
  const ledgers = useLedgers()

  const assets = computed(() =>
    ASSET_ORDER.map((asset) => {
      const entries = ledgers.getEntries(asset)
      const invested =
        asset === 'stocks'
          ? sumInstallments(entries, true)
          : sumInstallments(entries)
      const last = entries[entries.length - 1]
      const value = last ? Number(last.current_value) || 0 : 0
      const pnl = value - invested
      const roi = invested > 0 ? pnl / invested : null
      const result = ledgers.getResult(asset)

      const LABEL_KEYS = {
        'mutual-funds': 'nav.mutualFunds',
        stocks: 'nav.stocks',
        'term-deposits': 'nav.termDeposits',
      }

      return {
        asset,
        labelKey: LABEL_KEYS[asset],
        invested,
        value,
        pnl,
        roi,
        latestDate: last?.date ?? null,
        xirr: result?.summary?.xirr ?? null,
        roiResult: result?.summary?.roi ?? null,
        apy: result?.summary?.apy ?? null,
      }
    }),
  )

  const totalInvested = computed(() =>
    assets.value.reduce((sum, a) => sum + a.invested, 0),
  )
  const totalValue = computed(() => assets.value.reduce((sum, a) => sum + a.value, 0))
  const totalPnl = computed(() => totalValue.value - totalInvested.value)
  const overallRoi = computed(() =>
    totalInvested.value > 0 ? totalPnl.value / totalInvested.value : null,
  )

  const weightedXirr = computed(() => {
    const withXirr = assets.value.filter(
      (a) => a.value > 0 && typeof a.xirr === 'number',
    )
    if (!withXirr.length) return null
    const totalWeight = withXirr.reduce((sum, a) => sum + a.value, 0)
    if (totalWeight <= 0) return null
    return (
      withXirr.reduce((sum, a) => sum + a.xirr * a.value, 0) / totalWeight
    )
  })

  const hasData = computed(() => totalValue.value > 0 || totalInvested.value > 0)

  const proportionSeries = computed(() =>
    assets.value
      .filter((a) => a.value > 0)
      .map((a) => ({
        labelKey: a.labelKey,
        value: a.value,
        color: ASSET_COLORS[a.asset],
      })),
  )

  const lineLabels = computed(() => {
    const dates = new Set()
    ASSET_ORDER.forEach((asset) => {
      ledgers.getEntries(asset).forEach((entry) => {
        if (entry?.date) dates.add(String(entry.date))
      })
    })
    return [...dates].sort()
  })

  const lineDatasets = computed(() =>
    assets.value.map((a) => ({
      labelKey: a.labelKey,
      data: lineLabels.value.map((date) => {
        const row = ledgers
          .getEntries(a.asset)
          .find((entry) => String(entry?.date) === date)
        return row ? Number(row.current_value) || 0 : null
      }),
      borderColor: ASSET_COLORS[a.asset],
    })),
  )

  return {
    assets,
    totalInvested,
    totalValue,
    totalPnl,
    overallRoi,
    weightedXirr,
    hasData,
    proportionSeries,
    lineLabels,
    lineDatasets,
  }
}
