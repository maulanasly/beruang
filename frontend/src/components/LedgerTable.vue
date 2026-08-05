<script setup>
import { computed, inject } from 'vue'

const props = defineProps({
  ledger: { type: Array, default: () => [] },
})

const formatter = inject('formatter')

const columns = computed(() => {
  const firstRow = props.ledger?.[0]
  if (!firstRow || typeof firstRow !== 'object') return []
  return Object.keys(firstRow)
})

function isNumericColumn(column) {
  return props.ledger.some((row) => typeof row?.[column] === 'number')
}

function cellClass(row, column) {
  return { num: typeof row?.[column] === 'number' }
}
</script>

<template>
  <div class="ledger-block">
    <h2>Ledger</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th
              v-for="column in columns"
              :key="`head-${column}`"
              :class="{ num: isNumericColumn(column) }"
            >
              {{ column }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in ledger" :key="`row-${rowIndex}`">
            <td
              v-for="column in columns"
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