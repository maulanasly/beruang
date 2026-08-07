import { reactive, watchEffect } from 'vue'

export const GOALS_ASSETS = ['mutual-funds', 'stocks', 'term-deposits']

const STORAGE_KEY = 'beruang.goals'

const DEFAULT_GOALS = () => ({
  overall: { target: 0, targetDate: '' },
  assets: {
    'mutual-funds': { target: 0 },
    stocks: { target: 0 },
    'term-deposits': { target: 0 },
  },
})

function sanitizeStored(raw) {
  const goals = DEFAULT_GOALS()
  if (!raw || typeof raw !== 'object') return goals

  const overallTarget = Number(raw.overall?.target)
  if (Number.isFinite(overallTarget) && overallTarget > 0) {
    goals.overall.target = overallTarget
  }
  const targetDate = String(raw.overall?.targetDate ?? '')
  if (targetDate) {
    goals.overall.targetDate = targetDate
  }

  GOALS_ASSETS.forEach((asset) => {
    const value = Number(raw.assets?.[asset]?.target)
    if (Number.isFinite(value) && value > 0) {
      goals.assets[asset].target = value
    }
  })

  return goals
}

function loadStored() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const goals = reactive(sanitizeStored(loadStored()))

watchEffect(() => {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...goals }))
  } catch {
    // storage may be unavailable; ignore
  }
})

export function useGoals() {
  function getOverall() {
    return goals.overall
  }

  function getAssetTarget(asset) {
    return goals.assets[asset]?.target ?? 0
  }

  function setOverall(target, targetDate = '') {
    goals.overall.target = Number(target) > 0 ? Number(target) : 0
    goals.overall.targetDate = String(targetDate || '')
  }

  function setAssetTarget(asset, target) {
    if (!(asset in goals.assets)) return
    goals.assets[asset].target = Number(target) > 0 ? Number(target) : 0
  }

  function resetGoals() {
    const clean = DEFAULT_GOALS()
    goals.overall = clean.overall
    goals.assets = clean.assets
  }

  return {
    goals,
    getOverall,
    getAssetTarget,
    setOverall,
    setAssetTarget,
    resetGoals,
  }
}
