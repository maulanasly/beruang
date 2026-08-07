<script setup>
import { RouterLink, RouterView } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSettings } from '../composables/useSettings'
import {
  LOCALE_OPTIONS,
  CURRENCY_OPTIONS,
} from '../composables/i18nOptions'
import { MARKET_OPTIONS } from '../composables/useMarket'

const { t } = useI18n()
const settings = useSettings()

const navItems = [
  { to: '/overview', key: 'nav.overview' },
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
        <div class="nav-links">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="nav-link"
            active-class="nav-active"
          >
            {{ t(item.key) }}
          </RouterLink>
        </div>

        <div class="nav-settings">
          <select
            id="locale"
            v-model="settings.locale"
            :aria-label="t('settings.locale')"
            :title="t('settings.locale')"
          >
            <option
              v-for="option in LOCALE_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
          <select
            id="market"
            v-model="settings.market"
            :aria-label="t('settings.market')"
            :title="t('settings.market')"
          >
            <option
              v-for="option in MARKET_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
          <select
            id="currency"
            v-model="settings.currency"
            :aria-label="t('settings.currency')"
            :title="t('settings.currency')"
          >
            <option
              v-for="option in CURRENCY_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>
      </nav>

      <RouterView />
    </section>
  </main>
</template>