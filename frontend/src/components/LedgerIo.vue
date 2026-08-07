<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  exportLedgerCsv,
  exportLedgerCsvTemplate,
  exportLedgerJson,
  parseLedgerCsv,
  parseLedgerJson,
} from '../composables/useLedgerIo'

const props = defineProps({
  asset: { type: String, required: true },
  entries: { type: Array, default: () => [] },
})

const emit = defineEmits(['import'])

const { t } = useI18n()

const importText = ref('')
const parseResult = ref(null)
const status = ref('')

const parsedEntries = computed(() => parseResult.value?.entries ?? [])
const parseErrors = computed(() => parseResult.value?.errors ?? [])

function triggerDownload(content, mimeType, extension) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `beruang-${props.asset}-${new Date().toISOString().slice(0, 10)}.${extension}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function exportCsv() {
  triggerDownload(exportLedgerCsv(props.asset, props.entries), 'text/csv', 'csv')
}

function exportJson() {
  triggerDownload(
    exportLedgerJson(props.asset, props.entries),
    'application/json',
    'json',
  )
}

function downloadTemplate() {
  triggerDownload(
    exportLedgerCsvTemplate(props.asset),
    'text/csv',
    'csv',
  )
}

function handleFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    importText.value = String(reader.result ?? '')
    parseInput()
  }
  reader.readAsText(file)
  event.target.value = ''
}

function parseInput() {
  if (!importText.value.trim()) {
    parseResult.value = null
    return
  }
  const looksLikeJson = importText.value.trim().startsWith('{') ||
    importText.value.trim().startsWith('[')
  parseResult.value = looksLikeJson
    ? parseLedgerJson(props.asset, importText.value)
    : parseLedgerCsv(props.asset, importText.value)
  status.value = ''
}

function confirmImport() {
  if (parseErrors.value.length) return
  emit('import', parsedEntries.value)
  status.value = t('io.importedCount', { count: parsedEntries.value.length })
  parseResult.value = null
  importText.value = ''
}

function clearImport() {
  importText.value = ''
  parseResult.value = null
  status.value = ''
}
</script>

<template>
  <section class="ledger-io">
    <div class="rows-head">
      <label>{{ t('io.importTitle') }}</label>
      <div class="io-actions">
        <button class="mini" type="button" @click="downloadTemplate">{{ t('io.template') }}</button>
        <button class="mini" type="button" @click="exportCsv">{{ t('io.exportCsv') }}</button>
        <button class="mini" type="button" @click="exportJson">{{ t('io.exportJson') }}</button>
      </div>
    </div>

    <div class="row">
      <input
        type="file"
        accept=".csv,.json,text/csv,application/json"
        @change="handleFile"
      />
      <textarea
        v-model="importText"
        class="io-textarea"
        :placeholder="t('io.pasteCsv')"
        @input="parseInput"
      />
    </div>

    <div v-if="parseResult" class="io-preview">
      <p>
        <span v-if="parseErrors.length" class="error-text">
          {{ t('io.validRows', { valid: parsedEntries.length, errors: parseErrors.length }) }}
        </span>
        <span v-else>
          {{ t('io.validRows', { valid: parsedEntries.length, errors: 0 }) }}
        </span>
      </p>
      <ul v-if="parseErrors.length" class="io-errors">
        <li v-for="(error, index) in parseErrors" :key="`${error.line}-${index}`">
          {{ t(`io.${error.type}`, { line: error.line, field: error.field }) }}
        </li>
      </ul>
      <div class="io-actions">
        <button
          class="mini"
          type="button"
          :disabled="parseErrors.length > 0"
          @click="confirmImport"
        >
          {{ t('io.confirmImport') }}
        </button>
        <button class="mini" type="button" @click="clearImport">{{ t('io.cancel') }}</button>
      </div>
    </div>

    <p v-if="status" class="io-status">{{ status }}</p>
  </section>
</template>
