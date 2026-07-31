<script setup>
import { computed, reactive, ref } from 'vue'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

const activeAsset = ref('mutual-funds')
const isLoading = ref(false)
const error = ref('')
const errorLines = ref([])
const result = ref(null)
const showRaw = ref(false)
const selectedLocale = ref('en-US')
const selectedCurrency = ref('USD')

const localeOptions = [
  { label: 'English (US)', value: 'en-US' },
  { label: 'Bahasa Indonesia', value: 'id-ID' },
]

const currencyOptions = [
  { label: 'US Dollar (USD)', value: 'USD' },
  { label: 'Indonesian Rupiah (IDR)', value: 'IDR' },
]

const forms = reactive({
  'mutual-funds': {
    entries: [
      { date: '2026-05-31', installment_amount: 1100, current_value: 6500 },
      { date: '2026-06-30', installment_amount: 1100, current_value: 7700 },
    ],
  },
  stocks: {
    entries: [
      {
        date: '2026-05-31',
        installment_amount: 700,
        new_share_purchases: 300,
        dividends: 0,
        current_value: 1000,
      },
      {
        date: '2026-06-30',
        installment_amount: 700,
        new_share_purchases: 200,
        dividends: 10,
        current_value: 1950,
      },
    ],
  },
  'term-deposits': {
    apy: 0.06,
    entries: [
      { date: '2026-05-31', installment_amount: 1000, current_value: 1000 },
      { date: '2026-06-30', installment_amount: 1000, current_value: 2005 },
    ],
  },
})

const assetFieldConfig = {
  'mutual-funds': [
    { key: 'date', label: 'Date', type: 'date' },
    {
      key: 'installment_amount',
      label: 'Installment Amount',
      type: 'number',
      min: 0,
      step: '0.01',
    },
    {
      key: 'current_value',
      label: 'Current Value',
      type: 'number',
      min: 0,
      step: '0.01',
    },
  ],
  stocks: [
    { key: 'date', label: 'Date', type: 'date' },
    {
      key: 'installment_amount',
      label: 'Installment Amount',
      type: 'number',
      min: 0,
      step: '0.01',
    },
    {
      key: 'new_share_purchases',
      label: 'New Share Purchases',
      type: 'number',
      min: 0,
      step: '0.01',
    },
    {
      key: 'dividends',
      label: 'Dividends',
      type: 'number',
      min: 0,
      step: '0.01',
    },
    {
      key: 'current_value',
      label: 'Current Value',
      type: 'number',
      min: 0,
      step: '0.01',
    },
  ],
  'term-deposits': [
    { key: 'date', label: 'Date', type: 'date' },
    {
      key: 'installment_amount',
      label: 'Installment Amount',
      type: 'number',
      min: 0,
      step: '0.01',
    },
    {
      key: 'current_value',
      label: 'Current Value',
      type: 'number',
      min: 0,
      step: '0.01',
    },
  ],
}

const endpoint = computed(() => `${API_BASE_URL}/api/v1/${activeAsset.value}/returns`)
const activeEntryFields = computed(() => assetFieldConfig[activeAsset.value] || [])
const entryGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${activeEntryFields.value.length + 1}, minmax(0, 1fr))`,
}))

const summaryEntries = computed(() => {
  if (!result.value?.summary || typeof result.value.summary !== 'object') {
    return []
  }

  return Object.entries(result.value.summary).map(([key, value]) => ({
    key,
    label: key
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase()),
    value,
  }))
})

const ledgerColumns = computed(() => {
  const firstRow = result.value?.ledger?.[0]
  if (!firstRow || typeof firstRow !== 'object') {
    return []
  }

  return Object.keys(firstRow)
})

const percentKeys = new Set(['xirr', 'roi', 'mom_return', 'apy', 'monthly_rate'])
const currencyKeyHints = [
  'value',
  'installment',
  'contribution',
  'purchase',
  'dividend',
  'interest',
  'fv',
]

const currencyFormatter = computed(
  () =>
    new Intl.NumberFormat(selectedLocale.value, {
      style: 'currency',
      currency: selectedCurrency.value,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
)

const decimalFormatter = computed(
  () =>
    new Intl.NumberFormat(selectedLocale.value, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    }),
)

const percentFormatter = computed(
  () =>
    new Intl.NumberFormat(selectedLocale.value, {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
)

function normalizeKey(key) {
  return String(key || '').toLowerCase()
}

function isPercentKey(key) {
  return percentKeys.has(normalizeKey(key))
}

function isCurrencyKey(key) {
  const normalized = normalizeKey(key)
  return currencyKeyHints.some((hint) => normalized.includes(hint))
}

function isDateKey(key) {
  return normalizeKey(key) === 'date'
}

function formatCellValue(key, value) {
  if (value === null || value === undefined) {
    return '-'
  }

  if (isDateKey(key)) {
    return String(value)
  }

  if (typeof value === 'number') {
    if (isPercentKey(key)) {
      return percentFormatter.value.format(value)
    }

    if (isCurrencyKey(key)) {
      return currencyFormatter.value.format(value)
    }

    return decimalFormatter.value.format(value)
  }

  return String(value)
}

function isNumericColumn(column) {
  const rows = result.value?.ledger || []
  return rows.some((row) => typeof row?.[column] === 'number')
}

function createEmptyEntry(asset) {
  if (asset === 'stocks') {
    return {
      date: '',
      installment_amount: 0,
      new_share_purchases: 0,
      dividends: 0,
      current_value: 0,
    }
  }

  return {
    date: '',
    installment_amount: 0,
    current_value: 0,
  }
}

function addEntryRow() {
  forms[activeAsset.value].entries.push(createEmptyEntry(activeAsset.value))
}

function removeEntryRow(index) {
  if (forms[activeAsset.value].entries.length <= 1) {
    return
  }
  forms[activeAsset.value].entries.splice(index, 1)
}

function normalizeEntries(asset, entries) {
  const fields = assetFieldConfig[asset] || []

  return entries.map((entry) => {
    const normalized = {}

    fields.forEach((field) => {
      if (field.type === 'number') {
        normalized[field.key] = Number(entry[field.key] ?? 0)
      } else {
        normalized[field.key] = entry[field.key]
      }
    })

    return normalized
  })
}

function formatApiError(detail) {
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
    return {
      title: detail,
      lines: [],
    }
  }

  return {
    title: 'Request failed. Please review your input and try again.',
    lines: [],
  }
}

async function calculate() {
  error.value = ''
  errorLines.value = []
  result.value = null
  showRaw.value = false
  isLoading.value = true

  try {
    const form = forms[activeAsset.value]
    if (!Array.isArray(form.entries) || form.entries.length === 0) {
      error.value = 'At least one ledger row is required.'
      return
    }

    if (form.entries.some((entry) => !entry.date)) {
      error.value = 'Every row must include a date.'
      return
    }

    const payload = {
      entries: normalizeEntries(activeAsset.value, form.entries),
    }

    if (activeAsset.value === 'term-deposits') {
      payload.apy = Number(form.apy)
    }

    const response = await fetch(endpoint.value, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const body = await response.json()

    if (!response.ok) {
      const formatted = formatApiError(body?.detail)
      error.value = formatted.title
      errorLines.value = formatted.lines
      return
    }

    result.value = body
  } catch (requestError) {
    error.value = requestError.message
    errorLines.value = []
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <main class="page">
    <section class="panel">
      <header class="hero">
        <p class="eyebrow">Beruang Frontend</p>
        <h1>Investment Return API Playground</h1>
        <p class="subtitle">Use this Vue client to hit FastAPI endpoints for mutual funds, stocks, and term deposits.</p>
      </header>

      <div class="row">
        <label for="asset">Asset Class</label>
        <select id="asset" v-model="activeAsset">
          <option value="mutual-funds">Mutual Funds</option>
          <option value="stocks">Stocks</option>
          <option value="term-deposits">Term Deposits</option>
        </select>
      </div>

      <div class="row row-2up">
        <div>
          <label for="locale">Locale</label>
          <select id="locale" v-model="selectedLocale">
            <option v-for="option in localeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
        <div>
          <label for="currency">Currency</label>
          <select id="currency" v-model="selectedCurrency">
            <option v-for="option in currencyOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>

      <div class="row" v-if="activeAsset === 'term-deposits'">
        <label for="apy">APY</label>
        <input
          id="apy"
          v-model.number="forms['term-deposits'].apy"
          type="number"
          step="0.0001"
          min="-1"
          max="1"
        />
      </div>

      <div class="row">
        <div class="rows-head">
          <label>Ledger Rows</label>
          <button class="mini" type="button" @click="addEntryRow">+ Add Row</button>
        </div>

        <div class="entry-editor">
          <div class="entry-grid entry-grid-header" :style="entryGridStyle">
            <span v-for="field in activeEntryFields" :key="`head-${field.key}`">{{ field.label }}</span>
            <span>Action</span>
          </div>

          <div
            v-for="(entry, index) in forms[activeAsset].entries"
            :key="`entry-${activeAsset}-${index}`"
            class="entry-grid"
            :style="entryGridStyle"
          >
            <input
              v-for="field in activeEntryFields"
              :key="`field-${index}-${field.key}`"
              v-model="entry[field.key]"
              :type="field.type"
              :min="field.min"
              :step="field.step"
            />
            <button
              class="mini danger"
              type="button"
              :disabled="forms[activeAsset].entries.length <= 1"
              @click="removeEntryRow(index)"
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      <button class="action" :disabled="isLoading" @click="calculate">
        {{ isLoading ? 'Calculating...' : 'Calculate Returns' }}
      </button>

      <p class="endpoint">POST {{ endpoint }}</p>

      <div v-if="error" class="output error">
        <p class="error-title">{{ error }}</p>
        <ul v-if="errorLines.length" class="error-list">
          <li v-for="line in errorLines" :key="line">{{ line }}</li>
        </ul>
      </div>
      <section v-if="result" class="result-block">
        <div class="summary-grid">
          <article v-for="item in summaryEntries" :key="item.key" class="summary-card">
            <p class="summary-label">{{ item.label }}</p>
            <p class="summary-value">{{ formatCellValue(item.key, item.value) }}</p>
          </article>
        </div>

        <div class="ledger-block">
          <h2>Ledger</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th
                    v-for="column in ledgerColumns"
                    :key="`head-${column}`"
                    :class="{ num: isNumericColumn(column) }"
                  >
                    {{ column }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, rowIndex) in result.ledger" :key="`row-${rowIndex}`">
                  <td
                    v-for="column in ledgerColumns"
                    :key="`cell-${rowIndex}-${column}`"
                    :class="{ num: typeof row[column] === 'number' }"
                  >
                    {{ formatCellValue(column, row[column]) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <button class="ghost" type="button" @click="showRaw = !showRaw">
          {{ showRaw ? 'Hide Raw JSON' : 'Show Raw JSON' }}
        </button>

        <pre v-if="showRaw" class="output ok">{{ JSON.stringify(result, null, 2) }}</pre>
      </section>
    </section>
  </main>
</template>
