<script setup>
import { computed } from 'vue'
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
import { useI18n } from 'vue-i18n'

Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
)

const props = defineProps({
  labels: { type: Array, default: () => [] },
  datasets: { type: Array, default: () => [] },
})

const settings = useSettings()
const { t } = useI18n()

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.datasets.map((dataset) => ({
    label: t(dataset.labelKey),
    data: dataset.data,
    borderColor: dataset.borderColor,
    backgroundColor: hexToRgba(dataset.borderColor, 0.12),
    fill: true,
    tension: 0.25,
    pointRadius: 3,
    pointHoverRadius: 5,
    borderWidth: 2,
  })),
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

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
</script>

<template>
  <section v-if="datasets.length && labels.length" class="chart-block">
    <h2>{{ t('overview.valueByAsset') }}</h2>
    <div class="chart-canvas">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </section>
</template>
