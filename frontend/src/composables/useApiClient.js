import { ref } from 'vue'

export function formatApiError(detail) {
  if (Array.isArray(detail)) {
    const lines = detail.map((item) => {
      const loc = Array.isArray(item?.loc) ? item.loc.join('.') : 'body'
      const msg = item?.msg || 'Validation error'
      return `${loc}: ${msg}`
    })

    return {
      title: 'Validation failed. Please fix the following fields.',
      lines,
    }
  }

  if (typeof detail === 'string' && detail.trim()) {
    return { title: detail, lines: [] }
  }

  return {
    title: 'Request failed. Please review your input and try again.',
    lines: [],
  }
}

/**
 * Encapsulates the POST-to-returns flow with shared loading/error state.
 * `endpoint` must be a fully-qualified URL.
 */
export function useApiClient() {
  const isLoading = ref(false)
  const error = ref('')
  const errorLines = ref([])
  const result = ref(null)

  async function calculateReturns(endpoint, payload) {
    error.value = ''
    errorLines.value = []
    result.value = null
    isLoading.value = true

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const body = await response.json()

      if (!response.ok) {
        const formatted = formatApiError(body?.detail)
        error.value = formatted.title
        errorLines.value = formatted.lines
        return null
      }

      result.value = body
      return body
    } catch (requestError) {
      error.value = requestError.message
      errorLines.value = []
      return null
    } finally {
      isLoading.value = false
    }
  }

  function reset() {
    error.value = ''
    errorLines.value = []
    result.value = null
  }

  return { isLoading, error, errorLines, result, calculateReturns, reset }
}