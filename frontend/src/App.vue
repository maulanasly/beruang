<script setup>
import { computed, provide, ref } from 'vue'
import AssetCalculator from './components/AssetCalculator.vue'
import SummaryCards from './components/SummaryCards.vue'
import LatestMomentumKpi from './components/LatestMomentumKpi.vue'
import LedgerTable from './components/LedgerTable.vue'
import LineChart from './components/LineChart.vue'
import { useFormatter } from './composables/useFormatter'
import { useSettings } from './composables/useSettings'
import { LOCALE_OPTIONS, CURRENCY_OPTIONS } from './composables/i18nOptions'

const activeAsset = ref('mutual-funds')
const result = ref(null)
const showRaw = ref(false)

const settings = useSettings()
const localeOptions = LOCALE_OPTIONS
const currencyOptions = CURRENCY_OPTIONS

const formatter = useFormatter()
provide('formatter', formatter)

const resultSummary = computed(() => result.value?.summary ?? null)
const resultLedger = computed(() => result.value?.ledger ?? [])

const resultSymbolLabel = computed(() => {
  if (activeAsset.value !== 'stocks') return ''
  const symbols = resultLedger.value
    .map((row) => row?.symbol)
    .filter((s) => s && typeof s === 'string')
  const unique = [...new Set(symbols)]
  if (unique.length === 0) return ''
  if (unique.length === 1) return unique[0]
  return `${unique.length} stock codes`
})

function onCalculated(value) {
  result.value = value
  showRaw.value = false
}

function onError() {
  result.value = null
}

function onReset() {
  result.value = null
  showRaw.value = false
}
</script>

<template>
  <main class="page">
    <section class="panel">
      <header class="hero">
        <p class="eyebrow">Beruang Frontend</p>
        <h1>Investment Return API Playground</h1>
        <p class="subtitle">
          Use this Vue client to hit FastAPI endpoints for mutual funds,
          stocks, and term deposits.
        </p>
      </header>

      <div class="row">
        <label for="asset">Asset Class</label>
        <select id="asset" v-model="activeAsset">
          <option value="mutual-funds">Mutual Funds</option>
          <option value="stocks">Stocks</option>
          <option value="term-deposits">Term Deposits</option>
        </select>
      </div>

      <div class="row row-2up">
        <div>
          <label for="locale">Locale</label>
          <select id="locale" v-model="settings.locale">
            <option
              v-for="option in localeOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>
        <div>
          <label for="currency">Currency</label>
          <select id="currency" v-model="settings.currency">
            <option
              v-for="option in currencyOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>

      <AssetCalculator
        :active-asset="activeAsset"
        @calculated="onCalculated"
        @error="onError"
        @reset="onReset"
      />

      <section v-if="result" class="result-block">
        <div class="kpi-row">
          <LatestMomentumKpi
            :ledger="resultLedger"
            :summary="resultSummary"
            :asset="activeAsset"
          />
        </div>

        <LineChart :ledger="resultLedger" :asset="activeAsset" />

        <div class="summary-section">
          <h2>Summary<span v-if="resultSymbolLabel" class="section-symbol">{{ resultSymbolLabel }}</span></h2>
          <SummaryCards :summary="resultSummary" />
        </div>

        <LedgerTable
          :ledger="resultLedger"
          :asset="activeAsset"
          :title-suffix="resultSymbolLabel"
        />

        <button class="ghost" type="button" @click="showRaw = !showRaw">
          {{ showRaw ? 'Hide Raw JSON' : 'Show Raw JSON' }}
        </button>

        <pre v-if="showRaw" class="output ok">{{ JSON.stringify(result, null, 2) }}</pre>
      </section>
    </section>
  </main>
</template>