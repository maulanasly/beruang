<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLedgers } from '../composables/useLedgers'
import { useSettings } from '../composables/useSettings'
import {
  PORTFOLIO_ASSETS,
  exportPortfolioJson,
  parsePortfolioJson,
} from '../composables/usePortfolioIo'

const { t } = useI18n()
const ledgers = useLedgers()
const settings = useSettings()

const backupText = ref('')
const parseResult = ref(null)
const status = ref('')

const parsedAssets = computed(() => {
  const data = parseResult.value?.ok ? parseResult.value.data : null
  if (!data) return 0
  return PORTFOLIO_ASSETS.filter((asset) => {
    const entries =
      asset === 'term-deposits' ? data.ledgers[asset].entries : data.ledgers[asset]
    return entries.length > 0
  }).length
})

const parsedRows = computed(() => {
  const data = parseResult.value?.ok ? parseResult.value.data : null
  if (!data) return 0
  return PORTFOLIO_ASSETS.reduce(
    (sum, asset) =>
      sum +
      (asset === 'term-deposits'
        ? data.ledgers[asset].entries.length
        : data.ledgers[asset].length),
    0,
  )
})

const parseErrors = computed(() => parseResult.value?.errors ?? [])

function triggerDownload(content, mimeType, extension) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `beruang-backup-${new Date().toISOString().slice(0, 10)}.${extension}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function exportBackup() {
  triggerDownload(
    exportPortfolioJson(ledgers.ledgers, settings),
    'application/json',
    'json',
  )
}

function handleFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    backupText.value = String(reader.result ?? '')
    parseInput()
  }
  reader.readAsText(file)
  event.target.value = ''
}

function parseInput() {
  if (!backupText.value.trim()) {
    parseResult.value = null
    return
  }
  parseResult.value = parsePortfolioJson(backupText.value)
  status.value = ''
}

function confirmRestore() {
  if (!parseResult.value?.ok) return
  const { data } = parseResult.value
  ledgers.restoreAll(data.ledgers)
  if (data.settings.locale) settings.locale = data.settings.locale
  if (data.settings.currency) settings.currency = data.settings.currency
  if (data.settings.market) settings.market = data.settings.market
  status.value = t('backup.restored')
  parseResult.value = null
  backupText.value = ''
}

function clearRestore() {
  backupText.value = ''
  parseResult.value = null
  status.value = ''
}
</script>

<template>
  <section class="ledger-io">
    <div class="rows-head">
      <label>{{ t('backup.title') }}</label>
      <div class="io-actions">
        <button class="mini" type="button" @click="exportBackup">{{ t('backup.exportAll') }}</button>
      </div>
    </div>

    <div class="row">
      <input
        type="file"
        accept=".json,application/json"
        @change="handleFile"
      />
      <textarea
        v-model="backupText"
        class="io-textarea"
        :placeholder="t('backup.pasteHint')"
        @input="parseInput"
      />
    </div>

    <div v-if="parseResult" class="io-preview">
      <p>
        <span v-if="parseErrors.length" class="error-text">
          {{ t('backup.invalidCount', { errors: parseErrors.length }) }}
        </span>
        <span v-else>
          {{ t('backup.validSummary', { assets: parsedAssets, rows: parsedRows }) }}
        </span>
      </p>
      <ul v-if="parseErrors.length" class="io-errors">
        <li v-for="(item, index) in parseErrors" :key="`${item.line}-${index}`">
          {{ t(`io.${item.type}`, { line: item.line, field: item.field }) }}
        </li>
      </ul>
      <div class="io-actions">
        <button
          class="mini"
          type="button"
          :disabled="parseErrors.length > 0"
          @click="confirmRestore"
        >
          {{ t('backup.confirmRestore') }}
        </button>
        <button class="mini" type="button" @click="clearRestore">{{ t('io.cancel') }}</button>
      </div>
    </div>

    <p v-if="status" class="io-status">{{ status }}</p>
  </section>
</template>
