<script setup>
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MarketHelper from './MarketHelper.vue'
import DividendFocusPanel from './DividendFocusPanel.vue'
import DepositMaturityPanel from './DepositMaturityPanel.vue'
import InfoTip from './InfoTip.vue'
import { useApiClient } from '../composables/useApiClient'
import { useStockUniverse } from '../composables/useStockUniverse'
import { useLedgers } from '../composables/useLedgers'

const props = defineProps({
  activeAsset: { type: String, required: true },
  resultSummary: { type: Object, default: () => ({}) },
  resultLedger: { type: Array, default: () => [] },
})

const emit = defineEmits(['calculated', 'error', 'reset'])

const { t } = useI18n()

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

const ASSET_KEYS = {
  'mutual-funds': 'mutualFunds',
  stocks: 'stocks',
  'term-deposits': 'termDeposits',
}

function buildFieldConfig() {
  return {
    'mutual-funds': [
      { key: 'date', labelKey: 'form.date', type: 'date' },
      {
        key: 'installment_amount',
        labelKey: 'form.installmentAmount',
        type: 'number',
        min: 0,
        step: '0.01',
      },
      {
        key: 'current_value',
        labelKey: 'form.currentValue',
        type: 'number',
        min: 0,
        step: '0.01',
      },
    ],
    stocks: [
      {
        key: 'symbol',
        labelKey: 'form.stockCode',
        type: 'text',
        frontendOnly: true,
        hintKey: 'glossary.stockCode',
      },
      { key: 'date', labelKey: 'form.date', type: 'date' },
      {
        key: 'installment_amount',
        labelKey: 'form.installmentAmount',
        type: 'number',
        min: 0,
        step: '0.01',
      },
      {
        key: 'new_share_purchases',
        labelKey: 'form.newSharePurchases',
        type: 'number',
        min: 0,
        step: '0.01',
        hintKey: 'glossary.newPurchases',
      },
      {
        key: 'dividends',
        labelKey: 'form.dividends',
        type: 'number',
        min: 0,
        step: '0.01',
        hintKey: 'glossary.dividends',
      },
      {
        key: 'dividend_yield',
        labelKey: 'form.dividendYield',
        type: 'percent',
        step: '0.01',
        hintKey: 'glossary.dividendYield',
      },
      {
        key: 'current_value',
        labelKey: 'form.currentValue',
        type: 'number',
        min: 0,
        step: '0.01',
      },
    ],
    'term-deposits': [
      { key: 'date', labelKey: 'form.date', type: 'date' },
      {
        key: 'installment_amount',
        labelKey: 'form.installmentAmount',
        type: 'number',
        min: 0,
        step: '0.01',
      },
      {
        key: 'current_value',
        labelKey: 'form.currentValue',
        type: 'number',
        min: 0,
        step: '0.01',
      },
      {
        key: 'term_months',
        labelKey: 'form.termMonths',
        type: 'number',
        min: 1,
        step: '1',
        hintKey: 'glossary.termMonths',
      },
      {
        key: 'maturity_date',
        labelKey: 'form.maturityDate',
        type: 'date',
        hintKey: 'glossary.maturityDate',
      },
    ],
  }
}

function addMonths(dateString, months) {
  if (!dateString) return ''
  const [year, month, day] = dateString.split('-').map(Number)
  const total = year * 12 + (month - 1) + Number(months)
  const nextYear = Math.floor(total / 12)
  const nextMonth = (total % 12) + 1
  const pad = (n) => String(n).padStart(2, '0')
  return `${nextYear}-${pad(nextMonth)}-${pad(day)}`
}

const assetFieldConfig = buildFieldConfig()

const ledgers = useLedgers()

function getEntries() {
  return ledgers.getEntries(props.activeAsset)
}

const activeEntryFields = computed(() => assetFieldConfig[props.activeAsset] || [])

const entryGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${activeEntryFields.value.length + 1}, minmax(0, 1fr))`,
}))

const endpoint = computed(
  () => `${API_BASE_URL}/api/v1/${props.activeAsset}/returns`,
)

const { isLoading, error, errorLines, calculateReturns } = useApiClient()
const stockUniverse = useStockUniverse(API_BASE_URL)

const apy = computed({
  get: () => ledgers.getApy(),
  set: (v) => ledgers.setApy(v),
})

function createEmptyEntry(asset) {
  if (asset === 'stocks') {
    return {
      symbol: '',
      date: '',
      installment_amount: 0,
      new_share_purchases: 0,
      dividends: 0,
      dividend_yield: null,
      current_value: 0,
    }
  }
  if (asset === 'term-deposits') {
    return {
      date: '',
      installment_amount: 0,
      current_value: 0,
      term_months: 12,
      maturity_date: '',
    }
  }
  return { date: '', installment_amount: 0, current_value: 0 }
}

function addEntryRow() {
  getEntries().push(createEmptyEntry(props.activeAsset))
}

function onTermDepositFieldInput(entry, field, event) {
  if (props.activeAsset !== 'term-deposits') return
  const key = field?.key
  const value = event.target.value
  const months = key === 'term_months' ? Number(value) : Number(entry.term_months || 12)
  const baseDate = key === 'date' ? value : entry.date
  if (key === 'term_months' || (key === 'date' && !entry.maturity_date)) {
    if (baseDate) entry.maturity_date = addMonths(baseDate, months || 12)
  }
}

function removeEntryRow(index) {
  const entries = getEntries()
  if (entries.length <= 1) return
  entries.splice(index, 1)
  if (props.activeAsset === 'stocks') {
    stockUniverse.syncTargetRowIndex(getEntries().length - 1)
  }
}

function normalizeEntries(asset, entries) {
  const fields = (assetFieldConfig[asset] || []).filter(
    (field) => !field.frontendOnly,
  )
  return entries.map((entry) => {
    const normalized = {}
    fields.forEach((field) => {
      if (field.key === 'dividend_yield') {
        const raw = entry[field.key]
        normalized[field.key] =
          raw === null || raw === undefined || raw === '' ? null : Number(raw)
      } else if (field.key === 'maturity_date') {
        const raw = entry[field.key]
        normalized[field.key] =
          raw === null || raw === undefined || raw === '' ? null : raw
      } else {
        normalized[field.key] =
          field.type === 'number' ? Number(entry[field.key] ?? 0) : entry[field.key]
      }
    })
    return normalized
  })
}

async function applyQuoteToRow() {
  stockUniverse.quoteStatus.value = ''
  if (!stockUniverse.selectedSymbol.value) {
    stockUniverse.quoteStatus.value = t('market.chooseStockCode')
    return
  }
  stockUniverse.syncTargetRowIndex(getEntries().length - 1)
  try {
    const quote = await stockUniverse.fetchAndStoreQuote()
    const rowIndex = stockUniverse.targetRowIndex.value
    const entries = getEntries()
    if (entries[rowIndex]) {
      entries[rowIndex].current_value = quote.price
      entries[rowIndex].symbol = quote.symbol
      entries[rowIndex].dividend_yield = quote.dividend_yield
    }
    stockUniverse.quoteStatus.value = t('market.updatedRow', {
      row: rowIndex + 1,
      symbol: quote.symbol,
      currency: quote.currency,
    })
  } catch {
    // status already set inside fetchQuote
  }
}

async function applyDividendFocus(item) {
  if (!item?.symbol) return
  stockUniverse.quoteStatus.value = ''
  stockUniverse.syncTargetRowIndex(getEntries().length - 1)
  const rowIndex = stockUniverse.targetRowIndex.value
  const entries = getEntries()
  if (entries[rowIndex]) {
    entries[rowIndex].symbol = item.symbol
    entries[rowIndex].dividend_yield = item.dividend_yield
  }
  stockUniverse.selectedSymbol.value = item.symbol
  try {
    const quote = await stockUniverse.fetchAndStoreQuote()
    if (entries[rowIndex]) {
      entries[rowIndex].current_value = quote.price
    }
    stockUniverse.quoteStatus.value = t('market.updatedRow', {
      row: rowIndex + 1,
      symbol: quote.symbol,
      currency: quote.currency,
    })
  } catch {
    // quote fetch may fail; symbol and yield are already applied
  }
}

async function syncAllPrices() {
  const entries = getEntries()
  const { updated, failed } = await stockUniverse.syncAllQuotes(entries)
  if (!updated.length && !failed.length) return
  for (const item of updated) {
    for (const entry of entries) {
      if (entry?.symbol?.trim() === item.symbol) {
        entry.current_value = item.price
        entry.dividend_yield = item.dividend_yield
      }
    }
  }
}

async function calculate() {
  error.value = ''
  errorLines.value = []

  const entries = getEntries()
  if (!Array.isArray(entries) || entries.length === 0) {
    error.value = t('error.atLeastOneRow')
    emit('error', error.value)
    return
  }

  if (entries.some((entry) => !entry.date)) {
    error.value = t('error.everyRowDate')
    emit('error', error.value)
    return
  }

  const payload = { entries: normalizeEntries(props.activeAsset, entries) }
  if (props.activeAsset === 'term-deposits') {
    payload.apy = Number(ledgers.getApy())
  }

  const result = await calculateReturns(endpoint.value, payload)
  if (result) {
    if (props.activeAsset === 'stocks' && Array.isArray(result.ledger)) {
      const stockFields = (assetFieldConfig.stocks || []).filter(
        (f) => f.frontendOnly,
      )
      result.ledger = result.ledger.map((row, i) => {
        const merged = { ...row }
        const source = entries[i]
        for (const field of stockFields) {
          if (source && source[field.key] != null) {
            merged[field.key] = source[field.key]
          }
        }
        return merged
      })
    }
    emit('reset')
    emit('calculated', result)
  } else {
    emit('error', error.value)
  }
}

onMounted(() => {
  stockUniverse.loadSymbols()
})

watch(
  () => props.activeAsset,
  (next) => {
    if (next === 'stocks') {
      stockUniverse.syncTargetRowIndex(getEntries().length - 1)
    }
  },
)

defineExpose({ calculate, isLoading })
</script>

<template>
  <div v-if="activeAsset === 'term-deposits'" class="row">
    <label for="apy">
      {{ t('form.apy') }}
      <InfoTip :text="t('glossary.apy')" />
    </label>
    <input
      id="apy"
      v-model.number="apy"
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
    :entries="getEntries()"
    :loading="stockUniverse.loading.value"
    :universe-error="stockUniverse.universeError.value"
    :quote-loading="stockUniverse.quoteLoading.value"
    :quote-status="stockUniverse.quoteStatus.value"
    :last-quote="stockUniverse.lastQuote.value"
    :syncing="stockUniverse.syncing.value"
    :searching="stockUniverse.searching.value"
    :api-base-url="API_BASE_URL"
    @update:selected-symbol="stockUniverse.selectedSymbol.value = $event"
    @update:target-row-index="stockUniverse.targetRowIndex.value = $event"
    @refresh="stockUniverse.loadSymbols"
    @search="stockUniverse.searchSymbols"
    @apply="applyQuoteToRow"
    @sync-all="syncAllPrices"
  />

  <DividendFocusPanel
    v-if="activeAsset === 'stocks'"
    :api-base-url="API_BASE_URL"
    :summary="props.resultSummary"
    @apply="applyDividendFocus"
  />

  <DepositMaturityPanel
    v-if="activeAsset === 'term-deposits'"
    :summary="props.resultSummary"
    :ledger="props.resultLedger"
  />

  <div class="row">
    <div class="rows-head">
      <label>{{ t('common.ledgerRows') }}</label>
      <button class="mini" type="button" @click="addEntryRow">{{ t('common.addRow') }}</button>
    </div>

    <div class="entry-editor">
      <div class="entry-grid entry-grid-header" :style="entryGridStyle">
        <span
          v-for="field in activeEntryFields"
          :key="`head-${field.key}`"
        >{{ t(field.labelKey) }}<InfoTip v-if="field.hintKey" :text="t(field.hintKey)" /></span>
        <span>{{ t('common.action') }}</span>
      </div>

      <div
        v-for="(entry, index) in getEntries()"
        :key="`entry-${activeAsset}-${index}`"
        class="entry-grid"
        :style="entryGridStyle"
      >
        <template
          v-for="field in activeEntryFields"
          :key="`field-${index}-${field.key}`"
        >
          <div class="entry-field-cell">
            <span class="mobile-label">{{ t(field.labelKey) }}</span>
            <input
              v-if="field.type !== 'percent'"
              v-model="entry[field.key]"
              :type="field.type"
              :min="field.min"
              :step="field.step"
              @input="onTermDepositFieldInput(entry, field, $event)"
            />
            <input
              v-else
              :type="'number'"
              :value="entry[field.key] == null || entry[field.key] === '' ? '' : Number(entry[field.key]) * 100"
              min="0"
              step="0.01"
              @input="entry[field.key] = $event.target.value === '' ? null : Number($event.target.value) / 100"
            />
          </div>
        </template>
        <button
          class="mini danger"
          type="button"
          :disabled="getEntries().length <= 1"
          @click="removeEntryRow(index)"
        >
          {{ t('common.remove') }}
        </button>
      </div>
    </div>
  </div>

  <button class="action" :disabled="isLoading" @click="calculate">
    {{ isLoading ? t('common.calculating') : t('common.calculateReturns') }}
  </button>

  <div v-if="error" class="output error">
    <p class="error-title">{{ error }}</p>
    <ul v-if="errorLines.length" class="error-list">
      <li v-for="line in errorLines" :key="line">{{ line }}</li>
    </ul>
  </div>
</template>