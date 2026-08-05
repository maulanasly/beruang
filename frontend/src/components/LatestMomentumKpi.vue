<script setup>
import { computed, inject } from 'vue'

const props = defineProps({
  ledger: { type: Array, default: () => [] },
  summary: { type: Object, default: () => ({}) },
  asset: { type: String, required: true },
})

const formatter = inject('formatter')

const latest = computed(() => props.ledger?.[props.ledger.length - 1] ?? null)

const cards = computed(() => {
  const row = latest.value
  const summary = props.summary || {}
  if (!row) return []

  if (props.asset === 'term-deposits') {
    return [
      {
        label: 'Latest Entry Date',
        value: formatter.formatCellValue('date', row.date),
      },
      {
        label: 'Latest Prorated Interest',
        value: formatter.formatCellValue('prorated_interest', row.prorated_interest),
      },
      {
        label: 'Current APY',
        value: formatter.formatCellValue('apy', summary.apy),
      },
    ]
  }

  if (props.asset === 'stocks') {
    return [
      {
        label: 'Latest Entry Date',
        value: formatter.formatCellValue('date', row.date),
      },
      {
        label: 'Latest MoM',
        value: formatter.formatCellValue('mom_return', row.mom_return),
      },
      {
        label: 'Latest ROI',
        value: formatter.formatCellValue('roi', summary.roi),
      },
      {
        label: 'Latest XIRR',
        value: formatter.formatCellValue('xirr', summary.xirr),
      },
    ]
  }

  return [
    {
      label: 'Latest Entry Date',
      value: formatter.formatCellValue('date', row.date),
    },
    {
      label: 'Latest MoM',
      value: formatter.formatCellValue('mom_return', row.mom_return),
    },
    {
      label: 'Latest XIRR',
      value: formatter.formatCellValue('xirr', summary.xirr),
    },
  ]
})
</script>

<template>
  <section v-if="latest" class="kpi-block">
    <p class="kpi-caption">This Month Update</p>
    <div class="kpi-grid" :class="{ 'kpi-grid-4': cards.length === 4 }">
      <article v-for="(card, index) in cards" :key="card.label" class="kpi-card">
        <p class="kpi-label">{{ card.label }}</p>
        <p class="kpi-value">{{ card.value }}</p>
      </article>
    </div>
  </section>
</template>