<script setup>
import { computed, onMounted, reactive, watch } from 'vue'
import MarketHelper from './MarketHelper.vue'
import { useApiClient } from '../composables/useApiClient'
import { useStockUniverse } from '../composables/useStockUniverse'

const props = defineProps({
  activeAsset: { type: String, required: true },
})

const emit = defineEmits(['calculated', 'error', 'reset'])

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

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

const activeEntryFields = computed(() => assetFieldConfig[props.activeAsset] || [])

const entryGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${activeEntryFields.value.length + 1}, minmax(0, 1fr))`,
}))

const endpoint = computed(
  () => `${API_BASE_URL}/api/v1/${props.activeAsset}/returns`,
)

const { isLoading, error, errorLines, calculateReturns } = useApiClient()
const stockUniverse = useStockUniverse(API_BASE_URL)

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
  return { date: '', installment_amount: 0, current_value: 0 }
}

function addEntryRow() {
  forms[props.activeAsset].entries.push(createEmptyEntry(props.activeAsset))
}

function removeEntryRow(index) {
  if (forms[props.activeAsset].entries.length <= 1) return
  forms[props.activeAsset].entries.splice(index, 1)
  if (props.activeAsset === 'stocks') {
    stockUniverse.syncTargetRowIndex(forms.stocks.entries.length - 1)
  }
}

function normalizeEntries(asset, entries) {
  const fields = assetFieldConfig[asset] || []
  return entries.map((entry) => {
    const normalized = {}
    fields.forEach((field) => {
      normalized[field.key] =
        field.type === 'number' ? Number(entry[field.key] ?? 0) : entry[field.key]
    })
    return normalized
  })
}

async function applyQuoteToRow() {
  stockUniverse.quoteStatus.value = ''
  if (!stockUniverse.selectedSymbol.value) {
    stockUniverse.quoteStatus.value = 'Choose a stock symbol first.'
    return
  }
  stockUniverse.syncTargetRowIndex(forms.stocks.entries.length - 1)
  try {
    const quote = await stockUniverse.fetchQuote()
    const rowIndex = stockUniverse.targetRowIndex.value
    const entries = forms.stocks.entries
    if (entries[rowIndex]) {
      entries[rowIndex].current_value = quote.price
    }
    stockUniverse.quoteStatus.value =
      `Updated row ${rowIndex + 1} using ${quote.symbol} (${quote.currency}).`
  } catch {
    // status already set inside fetchQuote
  }
}

async function calculate() {
  error.value = ''
  errorLines.value = []
  emit('reset')

  const form = forms[props.activeAsset]
  if (!Array.isArray(form.entries) || form.entries.length === 0) {
    error.value = 'At least one ledger row is required.'
    emit('error', error.value)
    return
  }

  if (form.entries.some((entry) => !entry.date)) {
    error.value = 'Every row must include a date.'
    emit('error', error.value)
    return
  }

  const payload = { entries: normalizeEntries(props.activeAsset, form.entries) }
  if (props.activeAsset === 'term-deposits') {
    payload.apy = Number(form.apy)
  }

  const result = await calculateReturns(endpoint.value, payload)
  if (result) {
    emit('calculated', result)
  } else {
    emit('error', error.value)
  }
}

// Stock universe must populate on mount; lazy-load only when entering stocks.
onMounted(() => {
  stockUniverse.loadSymbols()
})

watch(
  () => props.activeAsset,
  (next) => {
    if (next === 'stocks') {
      stockUniverse.syncTargetRowIndex(forms.stocks.entries.length - 1)
    }
  },
)

defineExpose({ calculate, isLoading })
</script>

<template>
  <div v-if="activeAsset === 'term-deposits'" class="row">
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

  <MarketHelper
    v-if="activeAsset === 'stocks'"
    :symbols="stockUniverse.symbols.value"
    :selected-symbol="stockUniverse.selectedSymbol.value"
    :target-row-index="stockUniverse.targetRowIndex.value"
    :entries="forms.stocks.entries"
    :loading="stockUniverse.loading.value"
    :universe-error="stockUniverse.universeError.value"
    :quote-loading="stockUniverse.quoteLoading.value"
    :quote-status="stockUniverse.quoteStatus.value"
    @update:selected-symbol="stockUniverse.selectedSymbol.value = $event"
    @update:target-row-index="stockUniverse.targetRowIndex.value = $event"
    @refresh="stockUniverse.loadSymbols"
    @apply="applyQuoteToRow"
  />

  <div class="row">
    <div class="rows-head">
      <label>Ledger Rows</label>
      <button class="mini" type="button" @click="addEntryRow">+ Add Row</button>
    </div>

    <div class="entry-editor">
      <div class="entry-grid entry-grid-header" :style="entryGridStyle">
        <span
          v-for="field in activeEntryFields"
          :key="`head-${field.key}`"
        >{{ field.label }}</span>
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
</template>