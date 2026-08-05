<script setup>
import { computed, inject } from 'vue'

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
})

const emit = defineEmits([
  'update:selected-symbol',
  'update:target-row-index',
  'refresh',
  'apply',
])

const formatter = inject('formatter')

const formattedPrice = computed(() => {
  const quote = props.lastQuote
  if (!quote || typeof quote.price !== 'number') return '-'
  return formatter.formatCurrencyValue(quote.price, quote.currency)
})
</script>

<template>
  <div class="row market-helper">
    <div class="rows-head">
      <label>Live IDX Price (Kompas 100 Starter)</label>
      <button
        class="mini"
        type="button"
        :disabled="loading"
        @click="emit('refresh')"
      >
        {{ loading ? 'Refreshing...' : 'Refresh List' }}
      </button>
    </div>

    <div class="row row-2up market-grid">
      <div>
        <label for="idx-symbol">Stock Code</label>
        <select
          id="idx-symbol"
          :value="selectedSymbol"
          :disabled="loading || !symbols.length"
          @change="emit('update:selected-symbol', $event.target.value)"
        >
          <option value="" disabled>Select a ticker</option>
          <option v-for="item in symbols" :key="item.symbol" :value="item.symbol">
            {{ item.symbol }} - {{ item.name }}
          </option>
        </select>
      </div>
      <div>
        <label for="target-row">Target Ledger Row</label>
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
            Row {{ index + 1 }}{{ entry.date ? ` (${entry.date})` : '' }}
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
        {{ quoteLoading ? 'Fetching Quote...' : 'Apply Latest Price to Current Value' }}
      </button>
      <div v-if="lastQuote" class="last-quote">
        <span class="last-quote-label">Last Fetched</span>
        <span class="last-quote-value">{{ formattedPrice }}</span>
        <span class="last-quote-symbol">{{ lastQuote.symbol }}</span>
      </div>
    </div>

    <p v-if="universeError" class="market-note error-text">{{ universeError }}</p>
    <p v-if="quoteStatus" class="market-note">{{ quoteStatus }}</p>
  </div>
</template>