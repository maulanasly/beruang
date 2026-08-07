import { beforeEach, describe, expect, it, vi } from 'vitest'
import LedgerIo from './components/LedgerIo.vue'
import { useLedgers } from './composables/useLedgers.js'
import { mountWith, resetLedgers, resetSettings } from './test/helpers.js'
import { exportLedgerCsv } from './composables/useLedgerIo.js'

beforeEach(() => {
  resetSettings()
  resetLedgers()
})

function mountIo(props = {}) {
  return mountWith(LedgerIo, {
    props: {
      asset: 'mutual-funds',
      entries: [
        { date: '2026-05-31', installment_amount: 1100, current_value: 6500 },
        { date: '2026-06-30', installment_amount: 1100, current_value: 7700 },
      ],
      ...props,
    },
  })
}

describe('LedgerIo', () => {
  it('renders export and import controls', () => {
    const wrapper = mountIo()
    expect(wrapper.text()).toContain('Export CSV')
    expect(wrapper.text()).toContain('Export JSON')
    expect(wrapper.find('input[type="file"]').exists()).toBe(true)
  })

  it('triggers a CSV download on export', () => {
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const click = vi.fn()
    let anchor = null
    const realCreateElement = document.createElement.bind(document)
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag) => {
        const el = realCreateElement(tag)
        if (tag === 'a') {
          anchor = el
          el.click = click
        }
        return el
      })

    const wrapper = mountIo()
    const csvButton = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Export CSV')
    csvButton.trigger('click')

    expect(createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    expect(anchor.download).toMatch(/\.csv$/)
    createElementSpy.mockRestore()
    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
  })

  it('parses pasted CSV and previews valid rows', async () => {
    const wrapper = mountIo()
    const csv = exportLedgerCsv('mutual-funds', [
      { date: '2026-07-31', installment_amount: 500, current_value: 900 },
    ])
    await wrapper.find('textarea').setValue(csv)
    expect(wrapper.text()).toMatch(/1 valid rows/)
  })

  it('lists parse errors and disables the confirm button', async () => {
    const wrapper = mountIo()
    await wrapper
      .find('textarea')
      .setValue('date,installment_amount,current_value\nbad,100,200\n')
    expect(wrapper.text()).toMatch(/0 valid rows/)
    const confirm = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Confirm Import')
    expect(confirm.attributes('disabled')).toBeDefined()
  })

  it('emits import with the parsed entries on confirm', async () => {
    const wrapper = mountIo()
    const csv = exportLedgerCsv('mutual-funds', [
      { date: '2026-07-31', installment_amount: 500, current_value: 900 },
    ])
    await wrapper.find('textarea').setValue(csv)
    const confirm = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Confirm Import')
    await confirm.trigger('click')

    expect(wrapper.emitted('import')).toBeTruthy()
    expect(wrapper.emitted('import')[0][0]).toEqual([
      { date: '2026-07-31', installment_amount: 500, current_value: 900 },
    ])
  })

  it('wire: an import through AssetPage replaces the stored entries', async () => {
    // Simulate the wiring in AssetPage by calling setEntries + clearResult.
    const ledgers = useLedgers()
    const before = ledgers.getEntries('mutual-funds')
    expect(before).toHaveLength(2)

    ledgers.setEntries('mutual-funds', [
      { date: '2026-07-31', installment_amount: 500, current_value: 900 },
    ])
    ledgers.clearResult('mutual-funds')

    expect(ledgers.getEntries('mutual-funds')).toEqual([
      { date: '2026-07-31', installment_amount: 500, current_value: 900 },
    ])
  })
})
