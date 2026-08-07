import { computed } from 'vue'
import { useSettings } from './useSettings'

/**
 * Stock origin markets. Each market maps to the exchange suffix used by the
 * data source (e.g. IDX symbols carry a ".JK" suffix in config and API data).
 * The suffix stays in the underlying data; it is only stripped for display.
 */
export const MARKET_OPTIONS = [
  { value: 'IDX', label: 'Indonesia (IDX)', suffix: '.JK' },
  { value: 'US', label: 'United States (NYSE/NASDAQ)', suffix: '' },
]

export function useMarket() {
  const settings = useSettings()

  const market = computed(
    () =>
      MARKET_OPTIONS.find((option) => option.value === settings.market) ||
      MARKET_OPTIONS[0],
  )

  function displaySymbol(symbol) {
    if (typeof symbol !== 'string') return symbol
    const suffix = market.value.suffix
    if (!suffix) return symbol
    return symbol.endsWith(suffix) ? symbol.slice(0, -suffix.length) : symbol
  }

  return { market, displaySymbol }
}
