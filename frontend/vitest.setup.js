import { config } from 'vitest'
import i18n from './src/i18n/index.js'
import { useSettings } from './src/composables/useSettings.js'

// Ensure i18n and settings are initialized before any test imports
const settings = useSettings()
settings.locale = 'en-US'
settings.currency = 'USD'
