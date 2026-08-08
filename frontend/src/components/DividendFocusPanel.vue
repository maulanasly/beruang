<script setup>
import { computed, inject, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import InfoTip from './InfoTip.vue'
import { useDividendFocus } from '../composables/useDividendFocus'
import { useMarket } from '../composables/useMarket'

const props = defineProps({
  apiBaseUrl: { type: String, default: '' },
  summary: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['apply'])

const { t } = useI18n()
const formatter = inject('formatter')
const { displaySymbol } = useMarket()
const dividendFocus = useDividendFocus(props.apiBaseUrl)

const open = ref(false)
let hasLoaded = false

const items = computed(() => dividendFocus.items.value)

const hasSnapshot = computed(() => {
  const summary = props.summary || {}
  return (
    typeof summary.estimated_annual_dividend === 'number' ||
    typeof summary.estimated_monthly_dividend === 'number'
  )
})

watch(open, (isOpen) => {
  if (isOpen && !hasLoaded) {
    hasLoaded = true
    dividendFocus.loadDividendFocus()
  }
})

function refresh() {
  dividendFocus.refresh()
}

function apply(item) {
  emit('apply', { symbol: item.symbol, dividend_yield: item.dividend_yield })
}
</script>

<template>
  <section class="row dividend-focus">
    <div class="rows-head">
      <label class="dividend-focus-title">
        <button
          class="dividend-focus-toggle"
          type="button"
          :aria-expanded="open"
          @click="open = !open"
        >
          <span class="chevron" :class="{ 'chevron-open': open }">▸</span>
          {{ t('dividendFocus.title') }}
        </button>
        <InfoTip :text="t('glossary.dividendFocus')" />
      </label>
      <button
        v-if="open"
        class="mini"
        type="button"
        :disabled="dividendFocus.loading.value || dividendFocus.refreshing.value"
        @click="refresh"
      >
        {{ t('dividendFocus.refresh') }}
      </button>
    </div>

    <div v-if="open" class="dividend-focus-body">
      <p v-if="dividendFocus.loading.value" class="io-status">
        {{ t('dividendFocus.loading') }}
      </p>
      <p v-else-if="dividendFocus.error.value" class="error-text">
        {{ t('dividendFocus.fetchFailed') }}
      </p>
      <p v-else-if="!items.length" class="io-status">
        {{ t('dividendFocus.empty') }}
      </p>
      <template v-else>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="num">{{ t('dividendFocus.rank') }}</th>
                <th>{{ t('column.stockCode') }}</th>
                <th>{{ t('dividendFocus.name') }}</th>
                <th class="num">{{ t('dividendFocus.price') }}</th>
                <th class="num">{{ t('column.dividendYield') }}</th>
                <th>{{ t('common.action') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in items" :key="item.symbol">
                <td class="num">{{ index + 1 }}</td>
                <td>{{ displaySymbol(item.symbol) }}</td>
                <td>{{ item.name }}</td>
                <td class="num">{{ formatter.formatCurrency(item.price, item.currency) }}</td>
                <td class="num">{{ formatter.formatCellValue('dividend_yield', item.dividend_yield) }}</td>
                <td>
                  <button
                    class="mini"
                    type="button"
                    @click="apply(item)"
                  >
                    {{ t('dividendFocus.apply') }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="dividendFocus.asOf.value" class="market-note">
          {{ t('dividendFocus.asOf', { date: dividendFocus.asOf.value }) }}
        </p>
      </template>

      <div class="summary-grid dividend-focus-snapshot">
        <article v-if="hasSnapshot" class="summary-card">
          <p class="summary-label">{{ t('dividendFocus.snapshotTitle') }}</p>
          <p class="summary-value">
            {{ formatter.formatCellValue('estimated_annual_dividend', props.summary.estimated_annual_dividend) }}
          </p>
          <p class="summary-sub">
            {{ t('dividendFocus.snapshotMonthly') }}:
            {{ formatter.formatCellValue('estimated_monthly_dividend', props.summary.estimated_monthly_dividend) }}
          </p>
        </article>
        <p v-else class="io-status">{{ t('dividendFocus.snapshotNone') }}</p>
      </div>
    </div>
  </section>
</template>
