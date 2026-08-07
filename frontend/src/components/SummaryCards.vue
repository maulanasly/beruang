<script setup>
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import InfoTip from './InfoTip.vue'

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

const SUMMARY_HINT_KEYS = {
  xirr: 'glossary.xirr',
  roi: 'glossary.roi',
  apy: 'glossary.apy',
  monthly_rate: 'glossary.moM',
  projected_fv_constant_installment: 'glossary.apy',
}

function labelFor(key) {
  return t(SUMMARY_LABEL_KEYS[key] || key.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
}

function hintFor(key) {
  const hintKey = SUMMARY_HINT_KEYS[key]
  return hintKey ? t(hintKey) : ''
}

const entries = computed(() => {
  if (!props.summary || typeof props.summary !== 'object') return []
  return Object.entries(props.summary).map(([key, value]) => ({
    key,
    label: labelFor(key),
    value,
    hint: hintFor(key),
  }))
})
</script>

<template>
  <div class="summary-grid">
    <article v-for="item in entries" :key="item.key" class="summary-card">
      <p class="summary-label">
        {{ item.label }}
        <InfoTip v-if="item.hint" :text="item.hint" />
      </p>
      <p class="summary-value">{{ formatter.formatCellValue(item.key, item.value) }}</p>
    </article>
  </div>
</template>
