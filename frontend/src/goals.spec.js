import { beforeEach, describe, expect, it } from 'vitest'
import GoalsPanel from './components/GoalsPanel.vue'
import { useGoals } from './composables/useGoals.js'
import { mountWith, resetGoals, resetLedgers, resetSettings } from './test/helpers.js'

beforeEach(() => {
  resetSettings()
  resetLedgers()
  resetGoals()
  localStorage.clear()
})

function mountPanel() {
  return mountWith(GoalsPanel)
}

describe('GoalsPanel', () => {
  it('shows an empty-state hint when no goals are set', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('Goals & Targets')
    expect(wrapper.text()).toContain('Set a target value to track your progress')
  })

  it('renders overall progress, remaining, target date, and pace estimate', () => {
    const goals = useGoals()
    goals.setOverall(20000, '2027-12-31')

    const wrapper = mountPanel()
    const text = wrapper.text()

    expect(text).toContain('Overall Portfolio Goal')
    expect(text).toContain('58%')
    expect(text).toContain('Remaining:')
    expect(text).toContain('Target date: 2027-12-31')
    // totalInvested 6100 over 2 distinct months → avg 3050; remaining 8345 → ceil 3
    expect(text).toContain('3 months to goal')
  })

  it('renders per-asset rows with progress and reached state', () => {
    const goals = useGoals()
    goals.setAssetTarget('stocks', 1950)

    const wrapper = mountPanel()
    const text = wrapper.text()

    expect(text).toContain('Stocks')
    expect(text).toContain('100%')
    expect(text).toContain('Goal reached')
  })

  it('shows a dash for asset rows without a target', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('—')
  })

  it('saves edited goals to the store and exits edit mode', async () => {
    const goals = useGoals()
    goals.setOverall(1000000, '')

    const wrapper = mountPanel()
    await wrapper.findAll('button').find((b) => b.text() === 'Edit').trigger('click')

    await wrapper.find('#goal-overall-target').setValue(2000000)
    await wrapper.findAll('input.goal-input')[1].setValue(3000)

    await wrapper.findAll('button').find((b) => b.text() === 'Save').trigger('click')

    expect(goals.getOverall().target).toBe(2000000)
    expect(goals.getAssetTarget('stocks')).toBe(3000)
    expect(wrapper.find('#goal-overall-target').exists()).toBe(false)
  })

  it('cancel discards edits without persisting', async () => {
    const goals = useGoals()
    goals.setOverall(1000000, '')

    const wrapper = mountPanel()
    await wrapper.findAll('button').find((b) => b.text() === 'Edit').trigger('click')

    await wrapper.find('#goal-overall-target').setValue(9999)
    await wrapper.findAll('button').find((b) => b.text() === 'Cancel').trigger('click')

    expect(goals.getOverall().target).toBe(1000000)
  })

  it('allows clearing a goal by leaving the target empty on save', async () => {
    const goals = useGoals()
    goals.setOverall(1000000, '')

    const wrapper = mountPanel()
    await wrapper.findAll('button').find((b) => b.text() === 'Edit').trigger('click')
    await wrapper.find('#goal-overall-target').setValue('')
    await wrapper.findAll('button').find((b) => b.text() === 'Save').trigger('click')

    expect(goals.getOverall().target).toBe(0)
  })
})
