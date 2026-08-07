import { beforeEach, describe, expect, it } from 'vitest'
import { useGoals } from './useGoals.js'
import { resetGoals } from '../test/helpers.js'

describe('useGoals', () => {
  beforeEach(() => {
    localStorage.clear()
    resetGoals()
  })

  it('starts with zero targets and no target date', () => {
    const goals = useGoals()
    expect(goals.getOverall()).toEqual({ target: 0, targetDate: '' })
    expect(goals.getAssetTarget('mutual-funds')).toBe(0)
    expect(goals.getAssetTarget('stocks')).toBe(0)
    expect(goals.getAssetTarget('term-deposits')).toBe(0)
  })

  it('setOverall stores a target and an optional date', () => {
    const goals = useGoals()
    goals.setOverall(50000000, '2027-12-31')
    expect(goals.getOverall()).toEqual({ target: 50000000, targetDate: '2027-12-31' })
  })

  it('setOverall ignores non-positive targets', () => {
    const goals = useGoals()
    goals.setOverall(-5, '')
    expect(goals.getOverall().target).toBe(0)
  })

  it('setAssetTarget stores a per-asset target and ignores unknown assets', () => {
    const goals = useGoals()
    goals.setAssetTarget('stocks', 15000000)
    goals.setAssetTarget('bonds', 999)
    expect(goals.getAssetTarget('stocks')).toBe(15000000)
    expect(goals.getAssetTarget('bonds')).toBe(0)
  })

  it('persists goals to localStorage and restores them', () => {
    const goals = useGoals()
    goals.setOverall(50000000, '2027-12-31')
    goals.setAssetTarget('stocks', 15000000)

    const fresh = useGoals()
    expect(fresh.getOverall()).toEqual({ target: 50000000, targetDate: '2027-12-31' })
    expect(fresh.getAssetTarget('stocks')).toBe(15000000)
  })

  it('resetGoals clears all targets and dates', () => {
    const goals = useGoals()
    goals.setOverall(50000000, '2027-12-31')
    goals.setAssetTarget('mutual-funds', 20000000)

    goals.resetGoals()

    expect(goals.getOverall()).toEqual({ target: 0, targetDate: '' })
    expect(goals.getAssetTarget('mutual-funds')).toBe(0)
  })
})
