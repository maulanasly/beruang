import { computed } from 'vue'
import { useLedgers } from './useLedgers'
import { useMonthlyReturns } from './useMonthlyReturns'

export const TWR_ASSETS = ['mutual-funds', 'stocks', 'term-deposits']

/**
 * Chain-links cash-flow-adjusted sub-period returns into a time-weighted
 * total return: (1 + r1)(1 + r2)... - 1. Returns null when fewer than two
 * valid returns exist.
 */
export function chainLink(returns) {
  const valid = (returns || []).filter(
    (value) => typeof value === 'number' && Number.isFinite(value),
  )
  if (valid.length < 2) return null
  return valid.reduce((acc, value) => acc * (1 + value), 1) - 1
}

/**
 * Annualizes a total return over a calendar span using a 365-day year.
 * Returns null when the total or the window is invalid.
 */
export function annualize(total, startDate, endDate) {
  if (total === null || total === undefined || !Number.isFinite(total)) {
    return null
  }
  const start = Date.parse(startDate)
  const end = Date.parse(endDate)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null
  }
  const days = (end - start) / 86400000
  if (days <= 0) return null
  return (1 + total) ** (365 / days) - 1
}

/**
 * Time-weighted return estimates. The portfolio figure chain-links the
 * uniform monthly aggregate (see useMonthlyReturns) so it is comparable with
 * a market index, while per-asset figures chain-link each asset's own
 * cash-flow adjusted monthly returns.
 */
export function useTwr() {
  const ledgers = useLedgers()
  const monthly = useMonthlyReturns()

  const assets = computed(() =>
    TWR_ASSETS.map((asset) => {
      const dates = (ledgers.getEntries(asset) || [])
        .map((entry) => String(entry?.date || ''))
        .filter(Boolean)
        .sort()
      const total = chainLink(monthly.data.value.byAsset[asset])
      return {
        asset,
        total,
        annualized: annualize(total, dates[0], dates[dates.length - 1]),
      }
    }),
  )

  const portfolioTotal = computed(() =>
    chainLink(monthly.data.value.portfolio),
  )

  const portfolioTwr = computed(() => {
    const months = monthly.data.value.months
    return annualize(
      portfolioTotal.value,
      months[0],
      months[months.length - 1],
    )
  })

  return { assets, portfolioTotal, portfolioTwr }
}
