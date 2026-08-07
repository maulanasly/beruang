<script setup>
import { computed, inject, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import InfoTip from './InfoTip.vue'
import { useGoals } from '../composables/useGoals'
import { usePortfolio } from '../composables/usePortfolio'
import { useLedgers } from '../composables/useLedgers'

const ASSET_ROWS = [
  { asset: 'mutual-funds', labelKey: 'nav.mutualFunds' },
  { asset: 'stocks', labelKey: 'nav.stocks' },
  { asset: 'term-deposits', labelKey: 'nav.termDeposits' },
]

const { t } = useI18n()
const formatter = inject('formatter')
const goals = useGoals()
const portfolio = usePortfolio()
const ledgers = useLedgers()

const editing = ref(false)
const draft = reactive({
  overall: { target: 0, targetDate: '' },
  assets: {
    'mutual-funds': { target: 0 },
    stocks: { target: 0 },
    'term-deposits': { target: 0 },
  },
})

const overall = computed(() => goals.getOverall())
const overallTarget = computed(() => Number(overall.value.target) || 0)
const overallDate = computed(() => String(overall.value.targetDate || ''))
const overallCurrent = computed(() => portfolio.totalValue.value)
const overallRemaining = computed(() => overallTarget.value - overallCurrent.value)
const overallRatio = computed(() =>
  overallTarget.value > 0 ? overallCurrent.value / overallTarget.value : 0,
)
const overallPct = computed(() => Math.round(overallRatio.value * 100))
const overallFill = computed(() => Math.min(100, Math.max(0, overallPct.value)))
const overallReached = computed(() => overallTarget.value > 0 && overallCurrent.value >= overallTarget.value)

const monthCount = computed(() => {
  const months = new Set()
  ASSET_ROWS.forEach(({ asset }) => {
    ledgers.getEntries(asset).forEach((entry) => {
      if (entry?.date) months.add(String(entry.date).slice(0, 7))
    })
  })
  return months.size
})

const paceMonths = computed(() => {
  if (overallRemaining.value <= 0) return null
  const average =
    portfolio.totalInvested.value > 0
      ? portfolio.totalInvested.value / Math.max(1, monthCount.value)
      : 0
  if (average <= 0) return null
  return Math.ceil(overallRemaining.value / average)
})

const hasAnyGoal = computed(() => overallTarget.value > 0 ||
  ASSET_ROWS.some(({ asset }) => goals.getAssetTarget(asset) > 0))

const assetRows = computed(() =>
  ASSET_ROWS.map(({ asset, labelKey }) => {
    const target = Number(goals.getAssetTarget(asset)) || 0
    const current = portfolio.assets.value.find((item) => item.asset === asset)?.value || 0
    const ratio = target > 0 ? current / target : 0
    const pct = Math.round(ratio * 100)
    return {
      asset,
      labelKey,
      target,
      current,
      pct,
      fill: Math.min(100, Math.max(0, pct)),
      reached: target > 0 && current >= target,
    }
  }),
)

function edit() {
  draft.overall.target = overallTarget.value
  draft.overall.targetDate = overallDate.value
  ASSET_ROWS.forEach(({ asset }) => {
    draft.assets[asset].target = Number(goals.getAssetTarget(asset)) || 0
  })
  editing.value = true
}

function save() {
  goals.setOverall(draft.overall.target, draft.overall.targetDate)
  ASSET_ROWS.forEach(({ asset }) => {
    goals.setAssetTarget(asset, draft.assets[asset].target)
  })
  editing.value = false
}

function cancel() {
  editing.value = false
}
</script>

<template>
  <section class="goals-panel">
    <div class="rows-head">
      <label>
        {{ t('goals.title') }}
        <InfoTip :text="t('glossary.goals')" />
      </label>
      <div class="io-actions">
        <button v-if="!editing" class="mini" type="button" @click="edit">
          {{ t('goals.edit') }}
        </button>
        <template v-else>
          <button class="mini" type="button" @click="save">{{ t('goals.save') }}</button>
          <button class="mini" type="button" @click="cancel">{{ t('goals.cancel') }}</button>
        </template>
      </div>
    </div>

    <p v-if="!hasAnyGoal && !editing" class="io-status">{{ t('goals.noGoals') }}</p>

    <article v-if="editing || overallTarget > 0" class="goal-card">
      <template v-if="editing">
        <div class="goal-edit-row">
          <label class="goal-label" for="goal-overall-target">{{ t('goals.overall') }}</label>
          <input
            id="goal-overall-target"
            v-model.number="draft.overall.target"
            type="number"
            min="0"
            :placeholder="t('goals.target')"
          />
          <label class="goal-label" for="goal-overall-date">{{ t('goals.targetDate') }}</label>
          <input
            id="goal-overall-date"
            v-model="draft.overall.targetDate"
            type="date"
          />
        </div>
      </template>
      <template v-else>
        <p class="goal-label">
          {{ t('goals.overall') }}
          <span v-if="overallDate" class="goal-sub">· {{ t('goals.targetDate') }}: {{ overallDate }}</span>
        </p>
        <div class="goal-progress">
          <div class="goal-progress-fill" :style="{ width: `${overallFill}%` }" />
        </div>
        <p class="goal-stats">
          <span>{{ formatter.formatCellValue('value', overallCurrent) }} / {{ formatter.formatCellValue('value', overallTarget) }}</span>
          <span>{{ overallPct }}%</span>
        </p>
        <p class="goal-sub">
          {{ t('goals.remaining') }} {{ formatter.formatCellValue('value', overallRemaining) }}
          <template v-if="paceMonths">· {{ t('goals.paceMonths', { months: paceMonths }) }}</template>
        </p>
        <p v-if="overallReached" class="goal-reached">{{ t('goals.reached') }}</p>
      </template>
    </article>

    <div class="goal-rows">
      <div v-for="row in assetRows" :key="row.asset" class="goal-row">
        <div class="goal-row-head">
          <span class="goal-label">{{ t(row.labelKey) }}</span>
          <span class="goal-current">{{ formatter.formatCellValue('value', row.current) }}</span>
          <input
            v-if="editing"
            v-model.number="draft.assets[row.asset].target"
            type="number"
            min="0"
            class="goal-input"
            :placeholder="t('goals.target')"
          />
          <span v-else-if="row.target > 0" class="goal-pct">{{ row.pct }}%</span>
          <span v-else class="goal-pct">—</span>
        </div>
        <div v-if="!editing && row.target > 0" class="goal-progress">
          <div class="goal-progress-fill" :style="{ width: `${row.fill}%` }" />
        </div>
        <p v-if="!editing && row.reached" class="goal-reached">{{ t('goals.reached') }}</p>
      </div>
    </div>
  </section>
</template>
