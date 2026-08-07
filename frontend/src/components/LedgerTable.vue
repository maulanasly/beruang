<script setup>
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { MOM_COLUMNS } from '../composables/columns'
import { useMarket } from '../composables/useMarket'
import InfoTip from './InfoTip.vue'

const props = defineProps({
  ledger: { type: Array, default: () => [] },
  asset: { type: String, default: 'mutual-funds' },
  titleSuffix: { type: String, default: '' },
})

const { t } = useI18n()
const formatter = inject('formatter')
const { displaySymbol } = useMarket()

const COLUMN_I18N_KEYS = {
  date: 'column.date',
  installment_amount: 'column.installment',
  current_value: 'column.currentValue',
  symbol: 'column.stockCode',
  new_share_purchases: 'column.newPurchases',
  dividends: 'column.dividends',
  month_start_value: 'column.startValue',
  mom_return: 'column.momReturn',
  prorated_interest: 'column.proratedInterest',
  expected_month_end_value: 'column.expectedValue',
  capital_invested: 'column.capitalInvested',
}

const COLUMN_HINT_KEYS = {
  symbol: 'glossary.stockCode',
  new_share_purchases: 'glossary.newPurchases',
  dividends: 'glossary.dividends',
  mom_return: 'glossary.moM',
  prorated_interest: 'glossary.prorated',
  capital_invested: 'glossary.capitalInvested',
}

function columnLabel(key) {
  return t(COLUMN_I18N_KEYS[key] || key)
}

function columnHint(key) {
  const hintKey = COLUMN_HINT_KEYS[key]
  return hintKey ? t(hintKey) : ''
}

const columns = computed(() => {
  const firstRow = props.ledger?.[0]
  if (!firstRow || typeof firstRow !== 'object') return []
  return Object.keys(firstRow)
})

const latestRowIndex = computed(() =>
  props.ledger.length ? props.ledger.length - 1 : -1,
)

function isNumericColumn(column) {
  return props.ledger.some((row) => typeof row?.[column] === 'number')
}

function isMomColumn(column) {
  return MOM_COLUMNS.has(column)
}

function isPositiveMom(row, column) {
  return (
    MOM_COLUMNS.has(column) &&
    typeof row?.[column] === 'number' &&
    row[column] > 0
  )
}

function isNegativeMom(row, column) {
  return (
    MOM_COLUMNS.has(column) &&
    typeof row?.[column] === 'number' &&
    row[column] < 0
  )
}

function cellClass(row, column) {
  return {
    num: typeof row?.[column] === 'number',
    'mom-positive': isPositiveMom(row, column),
    'mom-negative': isNegativeMom(row, column),
  }
}

function cellText(column, value) {
  if (column === 'symbol') return displaySymbol(value)
  return formatter.formatCellValue(column, value)
}

const rowsWithCumulative = computed(() => {
  let running = 0
  return props.ledger.map((row) => {
    const installment = Number(row.installment_amount) || 0
    const purchases = Number(row.new_share_purchases) || 0
    running += installment + purchases
    return { ...row, capital_invested: running }
  })
})

const columnsWithCumulative = computed(() => {
  if (!columns.value.length) return []
  const keys = [...columns.value]
  const insertAt = keys.indexOf('current_value') + 1 || keys.length
  keys.splice(insertAt, 0, 'capital_invested')
  return keys
})
</script>

<template>
  <div class="ledger-block">
    <h2>{{ t('common.ledger') }}<span v-if="titleSuffix" class="section-symbol">{{ titleSuffix }}</span></h2>
    <p v-if="!ledger.length" class="ledger-empty">{{ t('ledger.empty') }}</p>
    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th
              v-for="column in columnsWithCumulative"
              :key="`head-${column}`"
              :class="{ num: isNumericColumn(column) || column === 'capital_invested' }"
            >
              {{ columnLabel(column) }}
              <InfoTip v-if="columnHint(column)" :text="columnHint(column)" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, rowIndex) in rowsWithCumulative"
            :key="`row-${rowIndex}`"
            :class="{ 'latest-row': rowIndex === latestRowIndex }"
          >
            <td
              v-for="column in columnsWithCumulative"
              :key="`cell-${rowIndex}-${column}`"
              :class="cellClass(row, column)"
            >
              {{ cellText(column, row[column]) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>