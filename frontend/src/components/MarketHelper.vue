<script setup>
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMarket } from '../composables/useMarket'
import PriceHistoryChart from './PriceHistoryChart.vue'

const props = defineProps({
  symbols: { type: Array, default: () => [] },
  selectedSymbol: { type: String, default: '' },
  targetRowIndex: { type: Number, default: 0 },
  entries: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  universeError: { type: String, default: '' },
  quoteLoading: { type: Boolean, default: false },
  quoteStatus: { type: String, default: '' },
  lastQuote: { type: Object, default: null },
  syncing: { type: Boolean, default: false },
  searching: { type: Boolean, default: false },
  apiBaseUrl: { type: String, default: '' },
})

const emit = defineEmits([
  'update:selected-symbol',
  'update:target-row-index',
  'refresh',
  'apply',
  'sync-all',
  'search',
])

const { t } = useI18n()
const formatter = inject('formatter')
const { displaySymbol } = useMarket()

const formattedPrice = computed(() => {
  const quote = props.lastQuote
  if (!quote || typeof quote.price !== 'number') return '-'
  return formatter.formatCurrency(quote.price, quote.currency)
})

const query = ref(props.selectedSymbol)
const showSuggestions = ref(false)
let searchTimer = null

watch(
  () => props.selectedSymbol,
  (value) => {
    query.value = value
  },
)

function onQueryInput(event) {
  const value = event.target.value
  query.value = value
  emit('update:selected-symbol', value)
  showSuggestions.value = true

  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    if (value.trim()) emit('search', value)
  }, 300)
}

function onFocus() {
  showSuggestions.value = true
}

function selectSuggestion(item) {
  query.value = item.symbol
  emit('update:selected-symbol', item.symbol)
  showSuggestions.value = false
}

function onBlur() {
  setTimeout(() => {
    showSuggestions.value = false
  }, 120)
}

onBeforeUnmount(() => clearTimeout(searchTimer))
</script>

<template>
  <div class="row market-helper">
    <div class="rows-head">
      <label>{{ t('market.liveIdxPrice') }}</label>
      <button
        class="mini"
        type="button"
        :disabled="loading"
        @click="emit('refresh')"
      >
        {{ loading ? t('market.refreshing') : t('market.refresh') }}
      </button>
    </div>

    <p class="market-note">{{ t('market.helperNote') }}</p>

    <div class="row row-2up market-grid">
      <div>
        <label for="idx-symbol">{{ t('form.stockCode') }}</label>
        <div class="stock-picker">
          <input
            id="idx-symbol"
            class="stock-picker-input"
            :value="query"
            :placeholder="t('market.searchPlaceholder')"
            :disabled="loading"
            autocomplete="off"
            @input="onQueryInput"
            @focus="onFocus"
            @blur="onBlur"
          />
          <ul
            v-if="showSuggestions && symbols.length"
            class="stock-suggestions"
          >
            <li
              v-for="item in symbols"
              :key="item.symbol"
              @mousedown.prevent="selectSuggestion(item)"
            >
              <span class="stock-suggestion-symbol">{{ displaySymbol(item.symbol) }}</span>
              <span class="stock-suggestion-name">{{ item.name }}</span>
            </li>
          </ul>
          <p v-if="searching" class="market-note">{{ t('market.searching') }}</p>
        </div>
      </div>
      <div>
        <label for="target-row">{{ t('market.targetLedgerRow') }}</label>
        <select
          id="target-row"
          :value="targetRowIndex"
          @change="emit('update:target-row-index', Number($event.target.value))"
        >
          <option
            v-for="(entry, index) in entries"
            :key="`row-target-${index}`"
            :value="index"
          >
            {{ t('market.row') }} {{ index + 1 }}{{ entry.date ? ` (${entry.date})` : '' }}
          </option>
        </select>
      </div>
    </div>

    <div class="quote-row">
      <button
        class="mini"
        type="button"
        :disabled="quoteLoading || !selectedSymbol"
        @click="emit('apply')"
      >
        {{ quoteLoading ? t('market.fetchingQuote') : t('market.applyLatestPrice') }}
      </button>
      <button
        class="mini"
        type="button"
        :disabled="syncing || !symbols.length"
        @click="emit('sync-all')"
      >
        {{ syncing ? t('market.syncingPrices') : t('market.syncAllPrices') }}
      </button>
      <div v-if="lastQuote" class="last-quote">
        <span class="last-quote-label">{{ t('market.lastFetched') }}</span>
        <span class="last-quote-value">{{ formattedPrice }}</span>
        <span class="last-quote-symbol">{{ displaySymbol(lastQuote.symbol) }}</span>
        <span
          v-if="typeof lastQuote.dividend_yield === 'number'"
          class="last-quote-yield"
        >
          {{ t('market.dividendYield') }}
          {{ formatter.formatCellValue('dividend_yield', lastQuote.dividend_yield) }}
        </span>
      </div>
    </div>

    <p v-if="universeError" class="market-note error-text">{{ universeError }}</p>
    <p v-if="quoteStatus" class="market-note">{{ quoteStatus }}</p>

    <PriceHistoryChart
      :symbol="selectedSymbol"
      :api-base-url="apiBaseUrl"
    />
  </div>
</template>