<script setup>
import { computed, onMounted } from 'vue'
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
import {
  INDEX_OPTIONS,
  INDEX_PERIODS,
  buildComparison,
  useBenchmark,
} from '../composables/useBenchmark'
import { useSettings } from '../composables/useSettings'

Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
)

const props = defineProps({
  labels: { type: Array, default: () => [] },
  values: { type: Array, default: () => [] },
})

const { t } = useI18n()
const settings = useSettings()
const benchmark = useBenchmark()

const comparison = computed(() =>
  buildComparison(props.labels, props.values, benchmark.points.value),
)

const hasEnoughDates = computed(
  () =>
    (props.labels || []).filter(
      (date, index) => String(date) && Number(props.values?.[index]) > 0,
    ).length >= 2,
)

function selectSymbol(event) {
  benchmark.symbol.value = event.target.value
  benchmark.load()
}

function selectPeriod(value) {
  if (benchmark.period.value === value) return
  benchmark.period.value = value
  benchmark.load()
}

onMounted(() => {
  benchmark.load()
})

const chartData = computed(() => {
  const data = comparison.value
  if (!data) return { labels: [], datasets: [] }
  return {
    labels: data.labels,
    datasets: data.datasets.map((dataset) => ({
      label: t(dataset.labelKey),
      data: dataset.data,
      borderColor: dataset.borderColor,
      backgroundColor: dataset.borderColor,
      fill: false,
      tension: 0.25,
      pointRadius: 3,
      pointHoverRadius: 5,
      borderWidth: 2,
    })),
  }
})

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    tooltip: { mode: 'index', intersect: false },
  },
  scales: {
    x: { grid: { display: false } },
    y: {
      beginAtZero: false,
      ticks: {
        callback: (value) => `${Number(value).toLocaleString(settings.locale)}%`,
      },
    },
  },
}))
</script>

<template>
  <section class="chart-block">
    <div class="rows-head">
      <h2>
        {{ t('benchmark.title') }}
        <InfoTip :text="t('glossary.benchmark')" />
      </h2>
      <div class="io-actions">
        <select
          :value="benchmark.symbol.value"
          :aria-label="t('benchmark.indexSelect')"
          @change="selectSymbol"
        >
          <option
            v-for="option in INDEX_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ t(option.labelKey) }}
          </option>
        </select>
        <button
          v-for="option in INDEX_PERIODS"
          :key="option.value"
          class="mini"
          type="button"
          :class="{ 'btn-active': benchmark.period.value === option.value }"
          @click="selectPeriod(option.value)"
        >
          {{ t(option.labelKey) }}
        </button>
      </div>
    </div>

    <p v-if="benchmark.loading.value" class="io-status">{{ t('benchmark.loading') }}</p>
    <p v-else-if="benchmark.error.value" class="error-text">{{ t('benchmark.fetchFailed') }}</p>
    <p v-else-if="!hasEnoughDates" class="io-status">{{ t('benchmark.tooFewPoints') }}</p>
    <p v-else-if="comparison === null" class="io-status">
      {{ t('benchmark.noOverlap') }}
    </p>
    <div v-else class="chart-canvas">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </section>
</template>
