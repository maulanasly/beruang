<script setup>
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import InfoTip from './InfoTip.vue'
import { annualize, chainLink } from '../composables/useTwr'

const props = defineProps({
  ledger: { type: Array, default: () => [] },
  summary: { type: Object, default: () => ({}) },
  asset: { type: String, required: true },
})

const { t } = useI18n()
const formatter = inject('formatter')

const latest = computed(() => props.ledger?.[props.ledger.length - 1] ?? null)

const twr = computed(() => {
  const rows = props.ledger || []
  const returns = rows.map((row) => {
    if (props.asset === 'term-deposits') {
      const start = Number(row.month_start_value) || 0
      const interest = Number(row.prorated_interest) || 0
      return start > 0 ? interest / start : null
    }
    return typeof row.mom_return === 'number' ? row.mom_return : null
  })
  const total = chainLink(returns)
  return annualize(total, rows[0]?.date, rows[rows.length - 1]?.date)
})

const twrCard = computed(() => ({
  label: t('kpi.latestTwr'),
  value: formatter.formatCellValue('xirr', twr.value),
  hint: t('glossary.twr'),
}))

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
      twrCard.value,
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
      {
        label: t('kpi.latestAnnualDividend'),
        value: formatter.formatCellValue(
          'estimated_annual_dividend',
          summary.estimated_annual_dividend,
        ),
        hint: t('glossary.dividendYield'),
      },
      twrCard.value,
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
    twrCard.value,
  ]
})
</script>

<template>
  <section v-if="latest" class="kpi-block">
    <p class="kpi-caption">{{ t('kpi.thisMonthUpdate') }}</p>
    <div
      class="kpi-grid"
      :class="props.asset === 'stocks' ? 'kpi-grid-6' : 'kpi-grid-4'"
    >
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
