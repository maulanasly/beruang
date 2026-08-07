import { beforeEach, describe, expect, it } from 'vitest'
import MarketHelper from './MarketHelper.vue'
import { mountWith, resetSettings } from '../test/helpers.js'

beforeEach(() => resetSettings())

function mountWithDefaults(overrides = {}) {
  return mountWith(MarketHelper, {
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
  })
}

describe('MarketHelper', () => {
  it('hides the Last Fetched card before any quote is fetched', () => {
    const wrapper = mountWithDefaults()
    expect(wrapper.find('.last-quote').exists()).toBe(false)
  })

  it('renders the fetched price formatted with the quote currency', () => {
    const wrapper = mountWithDefaults({
      lastQuote: { price: 9100, symbol: 'BBCA.JK', currency: 'IDR' },
    })
    expect(wrapper.find('.last-quote').exists()).toBe(true)
    expect(wrapper.find('.last-quote-value').text()).toMatch(/9,100/)
    expect(wrapper.find('.last-quote-symbol').text()).toBe('BBCA')
    expect(wrapper.find('.last-quote-value').text()).toMatch(/9,100\.00/)
  })

  it('strips the market suffix from the option labels', () => {
    const wrapper = mountWithDefaults()
    const options = wrapper.findAll('#idx-symbol option')
    expect(options[1].text()).toBe('BBCA - Bank Central Asia')
    expect(options[1].element.value).toBe('BBCA.JK')
  })

  it('keeps the full symbol when no suffix is configured', () => {
    resetSettings({ market: 'US' })
    const wrapper = mountWithDefaults({
      symbols: [{ symbol: 'AAPL', name: 'Apple' }],
      selectedSymbol: 'AAPL',
    })
    const options = wrapper.findAll('#idx-symbol option')
    expect(options[1].text()).toBe('AAPL - Apple')
  })

  it('emits apply when the fetch button is clicked', async () => {
    const wrapper = mountWithDefaults()
    const applyButton = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Apply Latest Price'))
    await applyButton.trigger('click')
    expect(wrapper.emitted('apply')).toBeTruthy()
  })

  it('shows the universe error note when supplied', () => {
    const wrapper = mountWithDefaults({ universeError: 'rate limited' })
    expect(wrapper.text()).toContain('rate limited')
    expect(wrapper.find('.market-note.error-text').exists()).toBe(true)
  })
})