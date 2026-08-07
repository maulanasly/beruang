<script setup>
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMonthlyReturns } from '../composables/useMonthlyReturns'
import { ASSET_COLORS } from '../composables/usePortfolio'
import InfoTip from './InfoTip.vue'

const ASSET_ROWS = [
  { asset: 'mutual-funds', labelKey: 'nav.mutualFunds' },
  { asset: 'stocks', labelKey: 'nav.stocks' },
  { asset: 'term-deposits', labelKey: 'nav.termDeposits' },
]

const { t } = useI18n()
const formatter = inject('formatter')
const monthly = useMonthlyReturns()

const rows = computed(() => {
  const { months, byAsset, portfolio } = monthly.data.value
  return months.map((month, index) => ({
    date: month,
    assets: ASSET_ROWS.map(({ asset }) => byAsset[asset]?.[index] ?? null),
    portfolio: portfolio[index] ?? null,
    latest: index === months.length - 1,
  }))
})

function cellClass(value) {
  return {
    num: value !== null && value !== undefined,
    'mom-positive': typeof value === 'number' && value > 0,
    'mom-negative': typeof value === 'number' && value < 0,
  }
}

function cellText(value) {
  return value === null || value === undefined
    ? '—'
    : formatter.formatCellValue('mom_return', value)
}
</script>

<template>
  <section v-if="monthly.hasData.value" class="monthly-returns">
    <h2>
      {{ t('monthlyReturns.title') }}
      <InfoTip :text="t('glossary.moM')" />
    </h2>
    <p class="market-note">{{ t('monthlyReturns.subtitle') }}</p>

    <p v-if="monthly.insufficient.value" class="ledger-empty">
      {{ t('monthlyReturns.insufficient') }}
    </p>

    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{{ t('monthlyReturns.month') }}</th>
            <th
              v-for="row in ASSET_ROWS"
              :key="`head-${row.asset}`"
              class="num"
            >
              <span class="mr-dot" :style="{ background: ASSET_COLORS[row.asset] }" />
              {{ t(row.labelKey) }}
            </th>
            <th class="num">
              <span class="mr-dot" style="background: #102a43" />
              {{ t('monthlyReturns.portfolio') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="`row-${row.date}`"
            :class="{ 'latest-row': row.latest }"
          >
            <td>{{ row.date }}</td>
            <td
              v-for="(value, index) in row.assets"
              :key="`cell-${row.date}-${index}`"
              :class="cellClass(value)"
            >
              {{ cellText(value) }}
            </td>
            <td :class="cellClass(row.portfolio)">
              {{ cellText(row.portfolio) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
