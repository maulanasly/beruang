<script setup>
import { computed, inject } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { usePortfolio } from '../composables/usePortfolio'
import { useTwr } from '../composables/useTwr'
import PortfolioDonut from '../components/PortfolioDonut.vue'
import PortfolioChart from '../components/PortfolioChart.vue'
import BenchmarkChart from '../components/BenchmarkChart.vue'
import InfoTip from '../components/InfoTip.vue'
import PortfolioIo from '../components/PortfolioIo.vue'
import GoalsPanel from '../components/GoalsPanel.vue'
import MonthlyReturnsTable from '../components/MonthlyReturnsTable.vue'

const { t } = useI18n()
const formatter = inject('formatter')
const portfolio = usePortfolio()
const twr = useTwr()

const benchmarkValues = computed(() =>
  portfolio.lineLabels.value.map((_, index) =>
    portfolio.lineDatasets.value.reduce(
      (sum, dataset) => sum + (Number(dataset.data[index]) || 0),
      0,
    ),
  ),
)

const kpiCards = [
  { key: 'totalInvested', value: portfolio.totalInvested, keyName: 'invested', hint: 'glossary.capitalInvested' },
  { key: 'totalValue', value: portfolio.totalValue, keyName: 'value' },
  { key: 'totalPnl', value: portfolio.totalPnl, keyName: 'pnl', hint: 'glossary.pnl' },
  { key: 'weightedXirr', value: portfolio.weightedXirr, keyName: 'xirr', hint: 'glossary.weightedXirr' },
  { key: 'twr', value: twr.portfolioTwr, keyName: 'xirr', hint: 'glossary.twr' },
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
      <p class="market-note">{{ t('overview.subtitle') }}</p>
      <div class="kpi-grid">
        <article
          v-for="card in kpiCards"
          :key="card.key"
          class="kpi-card"
        >
          <p class="kpi-label">
            {{ t(`overview.${card.key}`) }}
            <InfoTip v-if="card.hint" :text="t(card.hint)" />
          </p>
          <p class="kpi-value">{{ formatValue(card.keyName, card.value.value) }}</p>
        </article>
      </div>
    </div>

    <PortfolioDonut :series="portfolio.proportionSeries.value" />

    <div class="summary-section">
      <h2>
        {{ t('overview.perAsset') }}
        <InfoTip :text="t('glossary.roi')" />
      </h2>
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

    <BenchmarkChart
      :labels="portfolio.lineLabels.value"
      :values="benchmarkValues"
    />

    <MonthlyReturnsTable />
  </section>

  <section v-else class="result-block">
    <p class="ledger-empty">{{ t('overview.noData') }}</p>
    <p class="ledger-empty">
      <RouterLink class="ghost" to="/mutual-funds">{{ t('nav.mutualFunds') }}</RouterLink>
      <RouterLink class="ghost" to="/stocks">{{ t('nav.stocks') }}</RouterLink>
      <RouterLink class="ghost" to="/term-deposits">{{ t('nav.termDeposits') }}</RouterLink>
    </p>
  </section>

  <GoalsPanel />

  <PortfolioIo />
</template>
