<script setup>
import { provide } from 'vue'
import AppShell from './layouts/AppShell.vue'
import { useFormatter } from './composables/useFormatter'

const formatter = useFormatter()
provide('formatter', formatter)
</script>

<template>
  <AppShell />
</template>