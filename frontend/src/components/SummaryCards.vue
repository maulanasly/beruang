<script setup>
import { computed, inject } from 'vue'

const props = defineProps({
  summary: { type: Object, default: () => ({}) },
})

const formatter = inject('formatter')

const entries = computed(() => {
  if (!props.summary || typeof props.summary !== 'object') return []
  return Object.entries(props.summary).map(([key, value]) => ({
    key,
    label: key
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase()),
    value,
  }))
})
</script>

<template>
  <div class="summary-grid">
    <article v-for="item in entries" :key="item.key" class="summary-card">
      <p class="summary-label">{{ item.label }}</p>
      <p class="summary-value">{{ formatter.formatCellValue(item.key, item.value) }}</p>
    </article>
  </div>
</template>