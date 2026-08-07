import { beforeEach, describe, expect, it, vi } from 'vitest'
import MarketHelper from './MarketHelper.vue'
import { mountWith, resetSettings } from '../test/helpers.js'

vi.mock('vue-chartjs', () => ({
  Line: { template: '<div class="line-stub" />' },
}))

function makeResponse(body, ok) {
  return { ok, json: async () => body, status: ok ? 200 : 502 }
}

beforeEach(() => {
  resetSettings()
  vi.unstubAllGlobals()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      makeResponse(
        { symbol: 'BBCA.JK', name: 'Bank Central Asia', currency: 'IDR', points: [] },
        true,
      ),
    ),
  )
})

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

  it('strips the market suffix from suggestion labels', async () => {
    const wrapper = mountWithDefaults()
    await wrapper.find('#idx-symbol').trigger('focus')
    const firstSuggestion = wrapper.find('.stock-suggestions li')
    expect(firstSuggestion.find('.stock-suggestion-symbol').text()).toBe('BBCA')
    expect(firstSuggestion.find('.stock-suggestion-name').text()).toBe('Bank Central Asia')
  })

  it('keeps the full symbol when no suffix is configured', async () => {
    resetSettings({ market: 'US' })
    const wrapper = mountWithDefaults({
      symbols: [{ symbol: 'AAPL', name: 'Apple' }],
      selectedSymbol: 'AAPL',
    })
    await wrapper.find('#idx-symbol').trigger('focus')
    const firstSuggestion = wrapper.find('.stock-suggestions li')
    expect(firstSuggestion.find('.stock-suggestion-symbol').text()).toBe('AAPL')
  })

  it('emits update:selected-symbol when a suggestion is picked', async () => {
    const wrapper = mountWithDefaults()
    await wrapper.find('#idx-symbol').trigger('focus')
    const firstSuggestion = wrapper.find('.stock-suggestions li')
    await firstSuggestion.trigger('mousedown')
    expect(wrapper.emitted('update:selected-symbol')).toBeTruthy()
    expect(wrapper.emitted('update:selected-symbol')[0][0]).toBe('BBCA.JK')
  })

  it('emits selected-symbol as the user types and fires a debounced search', async () => {
    vi.useFakeTimers()
    const wrapper = mountWithDefaults()
    const input = wrapper.find('#idx-symbol')
    await input.setValue('GOTO')
    expect(wrapper.emitted('update:selected-symbol')).toBeTruthy()
    expect(wrapper.emitted('update:selected-symbol')[0][0]).toBe('GOTO')

    vi.advanceTimersByTime(300)
    expect(wrapper.emitted('search')).toBeTruthy()
    expect(wrapper.emitted('search')[0][0]).toBe('GOTO')
    vi.useRealTimers()
  })

  it('emits apply when the fetch button is clicked', async () => {
    const wrapper = mountWithDefaults()
    const applyButton = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Apply Latest Price'))
    await applyButton.trigger('click')
    expect(wrapper.emitted('apply')).toBeTruthy()
  })

  it('emits sync-all when the Sync All Prices button is clicked', async () => {
    const wrapper = mountWithDefaults()
    const syncButton = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Sync All Prices'))
    await syncButton.trigger('click')
    expect(wrapper.emitted('sync-all')).toBeTruthy()
  })

  it('disables Sync All Prices while a sync is in flight', () => {
    const wrapper = mountWithDefaults({ syncing: true })
    const syncButton = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Syncing Prices'))
    expect(syncButton.attributes('disabled')).toBeDefined()
  })

  it('shows the universe error note when supplied', () => {
    const wrapper = mountWithDefaults({ universeError: 'rate limited' })
    expect(wrapper.text()).toContain('rate limited')
    expect(wrapper.find('.market-note.error-text').exists()).toBe(true)
  })

  it('renders the price history chart for the selected symbol', async () => {
    const wrapper = mountWithDefaults()
    expect(wrapper.find('.price-history').exists()).toBe(true)
    expect(wrapper.text()).toContain('Price History')
  })

  it('prompts for a symbol when none is selected', () => {
    const wrapper = mountWithDefaults({ selectedSymbol: '' })
    expect(wrapper.text()).toContain('Enter a stock code')
  })
})