import { ref } from 'vue'
import i18n from '../i18n/index.js'

export function useDividendFocus(baseUrl = '') {
  const items = ref([])
  const asOf = ref(null)
  const loading = ref(false)
  const error = ref('')
  const refreshing = ref(false)

  async function loadDividendFocus(limit = 10) {
    if (items.value.length && !refreshing.value) return

    loading.value = !refreshing.value
    refreshing.value = false
    error.value = ''

    try {
      const params = new URLSearchParams({ limit: String(limit) })
      const response = await fetch(
        `${baseUrl}/api/v1/market-data/idx/dividend-yields?${params}`,
      )
      const body = await response.json()

      if (!response.ok) {
        throw new Error(body?.detail || 'Failed to load dividend yields.')
      }

      items.value = Array.isArray(body?.items) ? body.items : []
      asOf.value = body?.as_of || null
    } catch (loadError) {
      error.value = loadError.message
      items.value = []
      asOf.value = null
    } finally {
      loading.value = false
    }
  }

  function refresh() {
    refreshing.value = true
    return loadDividendFocus()
  }

  return {
    items,
    asOf,
    loading,
    error,
    refreshing,
    loadDividendFocus,
    refresh,
  }
}
