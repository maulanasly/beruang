<script setup>
import { computed, inject, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AssetCalculator from '../components/AssetCalculator.vue'
import SummaryCards from '../components/SummaryCards.vue'
import LatestMomentumKpi from '../components/LatestMomentumKpi.vue'
import LedgerTable from '../components/LedgerTable.vue'
import LineChart from '../components/LineChart.vue'
import LedgerIo from '../components/LedgerIo.vue'
import { useLedgers } from '../composables/useLedgers'
import { useMarket } from '../composables/useMarket'

const props = defineProps({
  asset: { type: String, required: true },
})

const { t } = useI18n()
const ledgers = useLedgers()
const calculatorRef = ref(null)
const { displaySymbol } = useMarket()

function onImport(entries) {
  ledgers.setEntries(props.asset, entries)
  ledgers.clearResult(props.asset)
}

const result = computed(() => ledgers.getResult(props.asset))
const resultSummary = computed(() => result.value?.summary ?? null)
const resultLedger = computed(() => result.value?.ledger ?? [])

const resultSymbolLabel = computed(() => {
  if (props.asset !== 'stocks') return ''
  const symbols = resultLedger.value
    .map((row) => row?.symbol)
    .filter((s) => s && typeof s === 'string')
  const unique = [...new Set(symbols)]
  if (unique.length === 0) return ''
  if (unique.length === 1) return displaySymbol(unique[0])
  return t('stock.codesCount', { count: unique.length })
})
</script>

<template>
  <AssetCalculator
    :ref="(el) => (calculatorRef = el)"
    :active-asset="asset"
    :result-summary="resultSummary"
    @calculated="(v) => ledgers.setResult(asset, v)"
    @reset="() => ledgers.clearResult(asset)"
  />

  <section v-if="result" class="result-block">
    <div class="kpi-row">
      <LatestMomentumKpi
        :ledger="resultLedger"
        :summary="resultSummary"
        :asset="asset"
      />
    </div>

    <LineChart :ledger="resultLedger" :asset="asset" />

    <div class="summary-section">
      <h2>{{ t('common.summary') }}<span v-if="resultSymbolLabel" class="section-symbol">{{ resultSymbolLabel }}</span></h2>
      <SummaryCards :summary="resultSummary" />
    </div>

    <LedgerTable
      :ledger="resultLedger"
      :asset="asset"
      :title-suffix="resultSymbolLabel"
    />
  </section>

  <LedgerIo
    :asset="asset"
    :entries="ledgers.getEntries(asset)"
    @import="onImport"
  />
</template>