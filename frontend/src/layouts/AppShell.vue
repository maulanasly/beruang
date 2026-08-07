<script setup>
import { RouterLink, RouterView } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSettings } from '../composables/useSettings'
import { LOCALE_OPTIONS, CURRENCY_OPTIONS } from '../composables/i18nOptions'

const { t } = useI18n()
const settings = useSettings()

const navItems = [
  { to: '/mutual-funds', key: 'nav.mutualFunds' },
  { to: '/stocks', key: 'nav.stocks' },
  { to: '/term-deposits', key: 'nav.termDeposits' },
]
</script>

<template>
  <main class="page">
    <section class="panel">
      <header class="hero">
        <p class="eyebrow">{{ t('hero.brand') }}</p>
        <h1>{{ t('hero.title') }}</h1>
        <p class="subtitle">{{ t('hero.subtitle') }}</p>
      </header>

      <nav class="nav-bar">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          active-class="nav-active"
        >
          {{ t(item.key) }}
        </RouterLink>
      </nav>

      <div class="row row-2up settings-row">
        <div>
          <label for="locale">{{ t('settings.locale') }}</label>
          <select id="locale" v-model="settings.locale">
            <option
              v-for="option in LOCALE_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>
        <div>
          <label for="currency">{{ t('settings.currency') }}</label>
          <select id="currency" v-model="settings.currency">
            <option
              v-for="option in CURRENCY_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>

      <RouterView />
    </section>
  </main>
</template>