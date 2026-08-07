import { createI18n } from 'vue-i18n'
import enUS from '../locales/en-US.js'
import idID from '../locales/id-ID.js'
import { useSettings } from '../composables/useSettings'

const settings = useSettings()

const i18n = createI18n({
  legacy: false,
  locale: settings.locale,
  fallbackLocale: 'en-US',
  messages: {
    'en-US': enUS,
    'id-ID': idID,
  },
})

// sync i18n locale with settings.locale
import { watchEffect } from 'vue'
watchEffect(() => {
  i18n.global.locale.value = settings.locale
})

export default i18n