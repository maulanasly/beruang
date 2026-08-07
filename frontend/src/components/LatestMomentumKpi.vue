<script setup>
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import InfoTip from './InfoTip.vue'

const props = defineProps({
  ledger: { type: Array, default: () => [] },
  summary: { type: Object, default: () => ({}) },
  asset: { type: String, required: true },
})

const { t } = useI18n()
const formatter = inject('formatter')

const latest = computed(() => props.ledger?.[props.ledger.length - 1] ?? null)

const cards = computed(() => {
  const row = latest.value
  const summary = props.summary || {}
  if (!row) return []

  const dateLabel = t('kpi.latestEntryDate')

  if (props.asset === 'term-deposits') {
    return [
      { label: dateLabel, value: formatter.formatCellValue('date', row.date) },
      {
        label: t('kpi.latestProratedInterest'),
        value: formatter.formatCellValue('prorated_interest', row.prorated_interest),
        hint: t('glossary.prorated'),
      },
      {
        label: t('kpi.currentApy'),
        value: formatter.formatCellValue('apy', summary.apy),
        hint: t('glossary.apy'),
      },
    ]
  }

  if (props.asset === 'stocks') {
    return [
      { label: dateLabel, value: formatter.formatCellValue('date', row.date) },
      {
        label: t('kpi.latestMom'),
        value: formatter.formatCellValue('mom_return', row.mom_return),
        hint: t('glossary.moM'),
      },
      {
        label: t('kpi.latestRoi'),
        value: formatter.formatCellValue('roi', summary.roi),
        hint: t('glossary.roi'),
      },
      {
        label: t('kpi.latestXirr'),
        value: formatter.formatCellValue('xirr', summary.xirr),
        hint: t('glossary.xirr'),
      },
    ]
  }

  return [
    { label: dateLabel, value: formatter.formatCellValue('date', row.date) },
    {
      label: t('kpi.latestMom'),
      value: formatter.formatCellValue('mom_return', row.mom_return),
      hint: t('glossary.moM'),
    },
    {
      label: t('kpi.latestXirr'),
      value: formatter.formatCellValue('xirr', summary.xirr),
      hint: t('glossary.xirr'),
    },
  ]
})
</script>

<template>
  <section v-if="latest" class="kpi-block">
    <p class="kpi-caption">{{ t('kpi.thisMonthUpdate') }}</p>
    <div class="kpi-grid" :class="{ 'kpi-grid-4': cards.length === 4 }">
      <article v-for="(card, index) in cards" :key="card.label" class="kpi-card">
        <p class="kpi-label">
          {{ card.label }}
          <InfoTip v-if="card.hint" :text="card.hint" />
        </p>
        <p class="kpi-value">{{ card.value }}</p>
      </article>
    </div>
  </section>
</template>
