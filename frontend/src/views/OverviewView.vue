<script setup>
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePortfolio } from '../composables/usePortfolio'
import PortfolioDonut from '../components/PortfolioDonut.vue'
import PortfolioChart from '../components/PortfolioChart.vue'

const { t } = useI18n()
const formatter = inject('formatter')
const portfolio = usePortfolio()

const kpiCards = [
  { key: 'totalInvested', value: portfolio.totalInvested, keyName: 'invested' },
  { key: 'totalValue', value: portfolio.totalValue, keyName: 'value' },
  { key: 'totalPnl', value: portfolio.totalPnl, keyName: 'pnl' },
  { key: 'weightedXirr', value: portfolio.weightedXirr, keyName: 'xirr' },
]

function formatValue(keyName, value) {
  if (keyName === 'xirr') {
    return value === null || value === undefined
      ? '-'
      : formatter.formatCellValue('xirr', value)
  }
  return formatter.formatCellValue('value', value)
}

function formatRoi(roi) {
  return roi === null || roi === undefined
    ? '-'
    : formatter.formatCellValue('roi', roi)
}
</script>

<template>
  <section v-if="portfolio.hasData.value" class="result-block">
    <div class="kpi-block">
      <p class="kpi-caption">{{ t('overview.portfolio') }}</p>
      <div class="kpi-grid">
        <article
          v-for="card in kpiCards"
          :key="card.key"
          class="kpi-card"
        >
          <p class="kpi-label">{{ t(`overview.${card.key}`) }}</p>
          <p class="kpi-value">{{ formatValue(card.keyName, card.value.value) }}</p>
        </article>
      </div>
    </div>

    <PortfolioDonut :series="portfolio.proportionSeries.value" />

    <div class="summary-section">
      <h2>{{ t('overview.perAsset') }}</h2>
      <div class="summary-grid">
        <article
          v-for="item in portfolio.assets.value"
          :key="item.asset"
          class="summary-card"
        >
          <p class="summary-label">
            {{ t(item.labelKey) }}
            <span class="section-symbol">{{ formatter.formatCellValue('value', item.value) }}</span>
          </p>
          <p class="summary-value">{{ formatRoi(item.roi) }}</p>
          <p class="summary-sub">{{ t('overview.invested') }} {{ formatter.formatCellValue('value', item.invested) }}</p>
        </article>
      </div>
    </div>

    <PortfolioChart
      :labels="portfolio.lineLabels.value"
      :datasets="portfolio.lineDatasets.value"
    />
  </section>

  <section v-else class="result-block">
    <p class="ledger-empty">{{ t('overview.noData') }}</p>
  </section>
</template>
