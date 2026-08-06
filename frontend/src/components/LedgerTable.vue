<script setup>
import { computed, inject } from 'vue'
import { columnLabel, MOM_COLUMNS } from '../composables/columns'

const props = defineProps({
  ledger: { type: Array, default: () => [] },
  asset: { type: String, default: 'mutual-funds' },
  titleSuffix: { type: String, default: '' },
})

const formatter = inject('formatter')

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

function isNegativeMom(row, column) {
  return (
    MOM_COLUMNS.has(column) &&
    typeof row?.[column] === 'number' &&
    row[column] < 0
  )
}

function isPositiveMom(row, column) {
  return (
    MOM_COLUMNS.has(column) &&
    typeof row?.[column] === 'number' &&
    row[column] > 0
  )
}

function cellClass(row, column) {
  return {
    num: typeof row?.[column] === 'number',
    'mom-positive': isPositiveMom(row, column),
    'mom-negative': isNegativeMom(row, column),
  }
}

// Total amount contributed per row, used to render an inline
// "Capital Invested" column so beginners can scan contribution vs current
// value without bouncing to the chart.
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
  // Insert the running capital column right after the current_value column
  // so it sits visually beside Current Value for side-by-side reading.
  const keys = [...columns.value]
  const insertAt = keys.indexOf('current_value') + 1 || keys.length
  keys.splice(insertAt, 0, 'capital_invested')
  return keys
})
</script>

<template>
  <div class="ledger-block">
    <h2>Ledger<span v-if="titleSuffix" class="section-symbol">{{ titleSuffix }}</span></h2>
    <p v-if="!ledger.length" class="ledger-empty">
      Fill the rows above and click <strong>Calculate Returns</strong> to see
      your monthly ledger here.
    </p>
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
              {{ formatter.formatCellValue(column, row[column]) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>