<script setup>
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  summary: { type: Object, default: () => ({}) },
})

const { t } = useI18n()
const formatter = inject('formatter')

const SUMMARY_LABEL_KEYS = {
  total_installments: 'column.installment',
  ending_value: 'column.currentValue',
  xirr: 'kpi.latestXirr',
  total_contribution: 'column.installment',
  roi: 'kpi.latestRoi',
  apy: 'kpi.currentApy',
  monthly_rate: 'column.momReturn',
  projected_fv_constant_installment: 'column.expectedValue',
}

function labelFor(key) {
  return t(SUMMARY_LABEL_KEYS[key] || key.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
}

const entries = computed(() => {
  if (!props.summary || typeof props.summary !== 'object') return []
  return Object.entries(props.summary).map(([key, value]) => ({
    key,
    label: labelFor(key),
    value,
  }))
})
</script>

<template>
  <div class="summary-grid">
    <article v-for="item in entries" :key="item.key" class="summary-card">
      <p class="summary-label">{{ item.label }}</p>
      <p class="summary-value">{{ formatter.formatCellValue(item.key, item.value) }}</p>
    </article>
  </div>
</template>