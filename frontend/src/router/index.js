import { createRouter, createWebHistory } from 'vue-router'
import { useSettings } from '../composables/useSettings'

const routes = [
  { path: '/', redirect: '/mutual-funds' },
  {
    path: '/mutual-funds',
    name: 'mutual-funds',
    component: () => import('../views/MutualFundsView.vue'),
  },
  {
    path: '/stocks',
    name: 'stocks',
    component: () => import('../views/StocksView.vue'),
  },
  {
    path: '/term-deposits',
    name: 'term-deposits',
    component: () => import('../views/TermDepositsView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

const settings = useSettings()

router.afterEach((to) => {
  const titles = {
    'mutual-funds': 'Mutual Funds',
    stocks: 'Stocks',
    'term-deposits': 'Term Deposits',
  }
  document.title = `${titles[to.name] || 'Beruang'} — Beruang`
})

export default router