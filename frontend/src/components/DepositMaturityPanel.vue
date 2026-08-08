<script setup>
import { computed, inject, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import InfoTip from './InfoTip.vue'

const props = defineProps({
  summary: { type: Object, default: () => ({}) },
  ledger: { type: Array, default: () => [] },
})

const { t } = useI18n()
const formatter = inject('formatter')

const open = ref(false)

const rows = computed(() =>
  (props.ledger || []).filter(
    (row) => row && typeof row === 'object' && row.maturity_status,
  ),
)

const hasData = computed(() => rows.value.length > 0)

const totalMaturityValue = computed(() =>
  rows.value.reduce((sum, row) => sum + (Number(row.maturity_value) || 0), 0),
)

function statusLabel(status) {
  if (status === 'matured') return t('depositMaturity.matured')
  return t('depositMaturity.active')
}

function daysText(row) {
  const days = Number(row.days_to_maturity)
  if (row.maturity_status === 'matured') {
    return t('depositMaturity.maturedDaysAgo', { days: Math.abs(days) })
  }
  if (days <= 0) return t('depositMaturity.maturesToday')
  return t('depositMaturity.daysLeft', { days })
}

function rolloverSuggestion(row) {
  const days = Number(row.days_to_maturity)
  if (row.maturity_status === 'matured') {
    return t('depositMaturity.rolloverMatured')
  }
  if (days <= 30) {
    return t('depositMaturity.rolloverSoon', {
      value: formatter.formatCellValue('value', row.maturity_value),
    })
  }
  return t('depositMaturity.holding')
}

const summaryCards = computed(() => {
  if (!hasData.value) return []
  const cards = []
  if (props.summary?.next_maturity_date) {
    cards.push({
      key: 'nextMaturity',
      label: t('depositMaturity.nextMaturity'),
      value: String(props.summary.next_maturity_date),
    })
  }
  if (typeof props.summary?.total_accrued_interest === 'number') {
    cards.push({
      key: 'accrued',
      label: t('depositMaturity.totalAccruedInterest'),
      value: formatter.formatCellValue(
        'interest',
        props.summary.total_accrued_interest,
      ),
    })
  }
  if (typeof props.summary?.rollover_value === 'number') {
    cards.push({
      key: 'rollover',
      label: t('depositMaturity.rolloverValue'),
      value: formatter.formatCellValue('value', props.summary.rollover_value),
    })
  }
  if (typeof props.summary?.apy === 'number') {
    cards.push({
      key: 'apy',
      label: t('depositMaturity.rate'),
      value: formatter.formatCellValue('apy', props.summary.apy),
    })
  }
  return cards
})
</script>

<template>
  <section class="row dividend-focus deposit-maturity">
    <div class="rows-head">
      <label class="dividend-focus-title">
        <button
          class="dividend-focus-toggle"
          type="button"
          :aria-expanded="open"
          @click="open = !open"
        >
          <span class="chevron" :class="{ 'chevron-open': open }">▸</span>
          {{ t('depositMaturity.title') }}
        </button>
        <InfoTip :text="t('glossary.depositMaturity')" />
      </label>
    </div>

    <div v-if="open" class="dividend-focus-body">
      <p v-if="!hasData" class="io-status">
        {{ t('depositMaturity.noData') }}
      </p>
      <template v-else>
        <div class="summary-grid deposit-maturity-summary">
          <article
            v-for="card in summaryCards"
            :key="card.key"
            class="summary-card"
          >
            <p class="summary-label">{{ card.label }}</p>
            <p class="summary-value">{{ card.value }}</p>
          </article>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="num">{{ t('column.date') }}</th>
                <th class="num">{{ t('depositMaturity.maturityDate') }}</th>
                <th class="num">{{ t('depositMaturity.daysToMaturity') }}</th>
                <th>{{ t('depositMaturity.status') }}</th>
                <th class="num">{{ t('depositMaturity.maturityValue') }}</th>
                <th class="num">{{ t('depositMaturity.accruedInterest') }}</th>
                <th>{{ t('depositMaturity.rollover') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in rows" :key="index">
                <td class="num">{{ formatter.formatCellValue('date', row.date) }}</td>
                <td class="num">{{ formatter.formatCellValue('date', row.maturity_date) }}</td>
                <td class="num">{{ daysText(row) }}</td>
                <td>
                  <span
                    class="status-chip"
                    :class="{
                      'status-matured': row.maturity_status === 'matured',
                      'status-active': row.maturity_status === 'active',
                    }"
                  >
                    {{ statusLabel(row.maturity_status) }}
                  </span>
                </td>
                <td class="num">{{ formatter.formatCellValue('value', row.maturity_value) }}</td>
                <td class="num">{{ formatter.formatCellValue('interest', row.accrued_interest) }}</td>
                <td>{{ rolloverSuggestion(row) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </section>
</template>
