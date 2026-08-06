import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MarketHelper from './MarketHelper.vue'
import { useFormatter } from '../composables/useFormatter'
import { useSettings } from '../composables/useSettings'

beforeEach(() => {
  const settings = useSettings()
  settings.locale = 'en-US'
  settings.currency = 'USD'
})

const formatter = useFormatter()

function mountWith(overrides = {}) {
  const wrapper = mount(MarketHelper, {
    props: {
      symbols: [{ symbol: 'BBCA.JK', name: 'Bank Central Asia' }],
      selectedSymbol: 'BBCA.JK',
      targetRowIndex: 0,
      entries: [{ date: '2026-01-31', installment_amount: 700, current_value: 1000 }],
      loading: false,
      universeError: '',
      quoteLoading: false,
      quoteStatus: '',
      lastQuote: null,
      ...overrides,
    },
    global: {
      provide: { formatter },
    },
  })
  return wrapper
}

describe('MarketHelper', () => {
  it('hides the Last Fetched card before any quote is fetched', () => {
    const wrapper = mountWith()
    expect(wrapper.find('.last-quote').exists()).toBe(false)
  })

  it('renders the fetched price formatted with the quote currency', () => {
    const wrapper = mountWith({
      lastQuote: { price: 9100, symbol: 'BBCA.JK', currency: 'IDR' },
    })
    expect(wrapper.find('.last-quote').exists()).toBe(true)
    expect(wrapper.find('.last-quote-value').text()).toMatch(/9,100/)
    expect(wrapper.find('.last-quote-symbol').text()).toBe('BBCA.JK')
    // en-US + IDR renders as "IDR\u00aA0..." or "IDR 9,100.00"; assert thousands sep.
    expect(wrapper.find('.last-quote-value').text()).toMatch(/9,100\.00/)
  })

  it('emits apply when the fetch button is clicked', async () => {
    const wrapper = mountWith()
    const applyButton = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Apply Latest Price'))
    await applyButton.trigger('click')
    expect(wrapper.emitted('apply')).toBeTruthy()
  })

  it('shows the universe error note when supplied', () => {
    const wrapper = mountWith({ universeError: 'rate limited' })
    expect(wrapper.text()).toContain('rate limited')
    expect(wrapper.find('.market-note.error-text').exists()).toBe(true)
  })
})