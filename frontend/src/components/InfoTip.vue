<script setup>
defineProps({
  text: { type: String, default: '' },
})
</script>

<template>
  <span class="info-tip" role="note" :title="text" :data-tip="text" tabindex="0">ⓘ</span>
</template>
