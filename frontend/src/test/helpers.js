import { mount } from '@vue/test-utils'
import i18n from '../i18n/index.js'
import { useSettings } from '../composables/useSettings'
import { useLedgers } from '../composables/useLedgers'
import { useFormatter } from '../composables/useFormatter'

export function resetSettings(overrides = {}) {
  const settings = useSettings()
  settings.locale = overrides.locale || 'en-US'
  settings.currency = overrides.currency || 'USD'
}

export function resetLedgers() {
  const ledgers = useLedgers()
  ledgers.resetAll()
}

export const formatter = useFormatter()

export function provideOverlays(extra = {}) {
  return {
    global: {
      plugins: [i18n],
      provide: { formatter, ...extra },
    },
  }
}

export function mountWith(component, options = {}) {
  const { props, global = {}, ...rest } = options
  const mergedPlugins = [i18n, ...(global.plugins || [])]
  const mergedProvide = { formatter, ...(global.provide || {}) }
  return mount(component, {
    props,
    ...provideOverlays(),
    ...rest,
    global: {
      ...global,
      plugins: mergedPlugins,
      provide: mergedProvide,
    },
  })
}
