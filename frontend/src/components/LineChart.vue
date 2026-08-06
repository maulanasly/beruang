<script setup>
import { computed, ref, watch } from 'vue'
import { Line } from 'vue-chartjs'
import {
  CategoryScale,
  Chart,
  Filler,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'
import { useSettings } from '../composables/useSettings'

Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
)

const props = defineProps({
  ledger: { type: Array, default: () => [] },
  asset: { type: String, required: true },
})

const settings = useSettings()

const labels = computed(() => props.ledger.map((row) => row.date))

const datasets = computed(() => {
  if (!props.ledger.length) return []

  if (props.asset === 'stocks') {
    let running = 0
    const invested = props.ledger.map((row) => {
      running += (Number(row.installment_amount) || 0) +
        (Number(row.new_share_purchases) || 0)
      return running
    })
    return [
      buildSeries('Total Contribution', invested, '#2563eb'),
      buildSeries(
        'Current Market Value',
        props.ledger.map((row) => Number(row.current_value) || 0),
        '#f25f3a',
      ),
    ]
  }

  if (props.asset === 'term-deposits') {
    return [
      buildSeries(
        'Expected Value',
        props.ledger.map((row) => Number(row.expected_month_end_value) || 0),
        '#2563eb',
      ),
      buildSeries(
        'Current Value',
        props.ledger.map((row) => Number(row.current_value) || 0),
        '#f25f3a',
      ),
    ]
  }

  let running = 0
  const invested = props.ledger.map((row) => {
    running += Number(row.installment_amount) || 0
    return running
  })
  return [
    buildSeries('Total Capital Invested', invested, '#2563eb'),
    buildSeries(
      'Current Market Value',
      props.ledger.map((row) => Number(row.current_value) || 0),
      '#f25f3a',
    ),
  ]
})

function buildSeries(label, data, color) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: hexToRgba(color, 0.12),
    fill: true,
    tension: 0.25,
    pointRadius: 3,
    pointHoverRadius: 5,
    borderWidth: 2,
  }
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const chartData = computed(() => ({
  labels: labels.value,
  datasets: datasets.value,
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    tooltip: { mode: 'index', intersect: false },
  },
  scales: {
    x: { grid: { display: false } },
    y: {
      beginAtZero: true,
      ticks: {
        precision: 0,
        callback: (value) =>
          Number(value).toLocaleString(settings.locale, {
            maximumFractionDigits: 0,
          }),
      },
    },
  },
}))

// chart.js keeps internal canvas state; bump the :key to force a clean rerender
// when the asset class switches series definitions.
const renderKey = ref(0)
watch(
  () => props.asset,
  () => {
    renderKey.value += 1
  },
)
</script>

<template>
  <section v-if="ledger.length" class="chart-block">
    <h2>Capital Invested vs Current Market Value</h2>
    <div class="chart-canvas">
      <Line :key="renderKey" :data="chartData" :options="chartOptions" />
    </div>
  </section>
</template>