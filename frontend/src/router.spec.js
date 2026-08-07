import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import AppShell from './layouts/AppShell.vue'
import { mountWith, resetSettings } from './test/helpers.js'
import i18n from './i18n/index.js'

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

function makeRouter(initialPath = '/mutual-funds') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/mutual-funds' },
      {
        path: '/mutual-funds',
        name: 'mutual-funds',
        component: { template: '<div class="view">Mutual Funds View</div>' },
      },
      {
        path: '/stocks',
        name: 'stocks',
        component: { template: '<div class="view">Stocks View</div>' },
      },
      {
        path: '/term-deposits',
        name: 'term-deposits',
        component: { template: '<div class="view">Term Deposits View</div>' },
      },
    ],
  })
  router.push(initialPath)
  return router
}

function mountShell(router) {
  const wrapper = mountWith(AppShell, {
    global: { plugins: [router] },
  })
  return wrapper
}

describe('AppShell navigation', () => {
  it('renders a nav link per asset class', async () => {
    const router = makeRouter()
    await router.isReady()
    const wrapper = mountShell(router)
    const links = wrapper.findAll('.nav-link')
    expect(links).toHaveLength(3)
    expect(links.map((l) => l.text())).toEqual([
      'Mutual Funds',
      'Stocks',
      'Term Deposits',
    ])
  })

  it('marks the active route link with nav-active', async () => {
    const router = makeRouter('/stocks')
    await router.isReady()
    const wrapper = mountShell(router)
    const active = wrapper.findAll('.nav-link.nav-active')
    expect(active).toHaveLength(1)
    expect(active[0].text()).toBe('Stocks')
  })

  it('renders the routed view for the current path', async () => {
    const router = makeRouter('/term-deposits')
    await router.isReady()
    const wrapper = mountShell(router)
    expect(wrapper.find('.view').text()).toBe('Term Deposits View')
  })

  it('navigates when a nav link is clicked', async () => {
    const router = makeRouter('/mutual-funds')
    await router.isReady()
    const wrapper = mountShell(router)
    expect(wrapper.find('.view').text()).toBe('Mutual Funds View')

    await wrapper.find('.nav-link[href="/stocks"]').trigger('click')
    await router.isReady()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('stocks')
    expect(wrapper.find('.view').text()).toBe('Stocks View')
  })
})

describe('AppShell settings', () => {
  it('lists locale and currency options and binds to settings', async () => {
    resetSettings()
    const router = makeRouter()
    await router.isReady()
    const wrapper = mountShell(router)
    expect(wrapper.find('#locale').element.value).toBe('en-US')
    expect(wrapper.find('#currency').element.value).toBe('USD')
    expect(
      wrapper.findAll('#locale option').map((o) => o.element.value),
    ).toEqual(['en-US', 'id-ID'])
  })

  it('updates settings when the locale select changes', async () => {
    resetSettings()
    const router = makeRouter()
    await router.isReady()
    const wrapper = mountShell(router)
    await wrapper.find('#locale').setValue('id-ID')
    expect(i18n.global.locale.value).toBe('id-ID')
  })
})
