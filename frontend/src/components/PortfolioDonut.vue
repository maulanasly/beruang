<script setup>
import { computed, inject } from 'vue'
import { Doughnut } from 'vue-chartjs'
import { ArcElement, Chart, Legend, Tooltip } from 'chart.js'
import { useI18n } from 'vue-i18n'

Chart.register(ArcElement, Tooltip, Legend)

const props = defineProps({
  series: { type: Array, default: () => [] },
})

const { t } = useI18n()
const formatter = inject('formatter')

const chartData = computed(() => ({
  labels: props.series.map((item) => t(item.labelKey)),
  datasets: [
    {
      data: props.series.map((item) => item.value),
      backgroundColor: props.series.map((item) => item.color),
      borderWidth: 2,
      borderColor: '#ffffff',
    },
  ],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom' },
    tooltip: {
      callbacks: {
        label: (context) =>
          `${context.label}: ${formatter.formatCurrency(context.parsed)}`,
      },
    },
  },
}))
</script>

<template>
  <section v-if="series.length" class="chart-block">
    <h2>{{ t('overview.proportion') }}</h2>
    <div class="chart-canvas chart-canvas-donut">
      <Doughnut :data="chartData" :options="chartOptions" />
    </div>
  </section>
</template>
