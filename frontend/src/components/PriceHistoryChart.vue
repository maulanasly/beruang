<script setup>
import { computed, inject, onBeforeUnmount, onMounted, watch } from 'vue'
import { Line } from 'vue-chartjs'
import {
  CategoryScale,
  Chart,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'
import { useI18n } from 'vue-i18n'
import InfoTip from './InfoTip.vue'
import { PRICE_PERIODS, usePriceHistory } from '../composables/usePriceHistory'
import { useSettings } from '../composables/useSettings'

Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
)

const props = defineProps({
  symbol: { type: String, default: '' },
  apiBaseUrl: { type: String, default: '' },
})

const { t } = useI18n()
const formatter = inject('formatter')
const settings = useSettings()
const priceHistory = usePriceHistory(props.apiBaseUrl)

let debounceTimer = null

function scheduleLoad() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    priceHistory.symbol.value = props.symbol
    priceHistory.load()
  }, 400)
}

onMounted(() => {
  priceHistory.symbol.value = props.symbol
  if (String(props.symbol || '').trim().length >= 3) {
    priceHistory.load()
  }
})

onBeforeUnmount(() => clearTimeout(debounceTimer))

watch(() => props.symbol, scheduleLoad)

const validSymbol = computed(() => String(props.symbol || '').trim().length >= 3)
const hasPoints = computed(() => priceHistory.points.value.length > 0)

function selectPeriod(value) {
  if (priceHistory.period.value === value) return
  priceHistory.period.value = value
  priceHistory.load()
}

const chartData = computed(() => ({
  labels: priceHistory.points.value.map((point) => String(point.date)),
  datasets: [
    {
      label: priceHistory.name.value || props.symbol,
      data: priceHistory.points.value.map((point) => Number(point.close)),
      borderColor: '#2563eb',
      backgroundColor: '#2563eb',
      fill: false,
      tension: 0.25,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 2,
    },
  ],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    tooltip: {
      callbacks: {
        label: (context) =>
          formatter.formatCurrency(Number(context.parsed.y), priceHistory.currency.value),
      },
    },
  },
  scales: {
    x: { grid: { display: false } },
    y: {
      ticks: {
        callback: (value) => Number(value).toLocaleString(settings.locale),
      },
    },
  },
}))
</script>

<template>
  <section class="price-history">
    <div class="rows-head">
      <h2>
        {{ t('priceHistory.title') }}
        <InfoTip :text="t('glossary.priceHistory')" />
      </h2>
      <span
        v-if="priceHistory.dividendYield.value !== null"
        class="yield-tag"
      >
        {{ t('market.dividendYield') }}
        {{ formatter.formatCellValue('dividend_yield', priceHistory.dividendYield.value) }}
      </span>
      <div v-if="validSymbol" class="io-actions">
        <button
          v-for="option in PRICE_PERIODS"
          :key="option.value"
          class="mini"
          type="button"
          :class="{ 'btn-active': priceHistory.period.value === option.value }"
          @click="selectPeriod(option.value)"
        >
          {{ t(option.labelKey) }}
        </button>
      </div>
    </div>

    <p v-if="!validSymbol" class="io-status">{{ t('priceHistory.emptySymbol') }}</p>
    <p v-else-if="priceHistory.loading.value" class="io-status">
      {{ t('priceHistory.loading') }}
    </p>
    <p v-else-if="priceHistory.error.value" class="error-text">
      {{ t('priceHistory.fetchFailed') }}
    </p>
    <p v-else-if="!hasPoints" class="io-status">{{ t('priceHistory.noData') }}</p>
    <div v-else class="chart-canvas price-history-canvas">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </section>
</template>
