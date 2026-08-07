import { beforeEach, describe, expect, it, vi } from 'vitest'
import PortfolioIo from './components/PortfolioIo.vue'
import { useLedgers } from './composables/useLedgers.js'
import { useSettings } from './composables/useSettings.js'
import { exportPortfolioJson } from './composables/usePortfolioIo.js'
import { mountWith, resetLedgers, resetSettings } from './test/helpers.js'

beforeEach(() => {
  resetSettings()
  resetLedgers()
})

function makeBackup() {
  const ledgers = useLedgers()
  const settings = useSettings()
  return exportPortfolioJson(ledgers.ledgers, settings)
}

function mountPortfolioIo() {
  return mountWith(PortfolioIo)
}

describe('PortfolioIo', () => {
  it('renders export and restore controls', () => {
    const wrapper = mountPortfolioIo()
    expect(wrapper.text()).toContain('Full Portfolio Backup')
    expect(wrapper.text()).toContain('Backup All Data')
    expect(wrapper.find('input[type="file"]').exists()).toBe(true)
  })

  it('triggers a JSON download with a backup filename', () => {
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

    const wrapper = mountPortfolioIo()
    const exportButton = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Backup All Data')
    exportButton.trigger('click')

    expect(createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    expect(anchor.download).toMatch(/^beruang-backup-.*\.json$/)
    createElementSpy.mockRestore()
    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
  })

  it('previews a valid backup summary from pasted JSON', async () => {
    const wrapper = mountPortfolioIo()
    await wrapper.find('textarea').setValue(makeBackup())
    expect(wrapper.text()).toMatch(/3 asset class/)
    expect(wrapper.text()).toMatch(/6 rows/)
  })

  it('lists errors and disables the confirm button for invalid backups', async () => {
    const wrapper = mountPortfolioIo()
    await wrapper.find('textarea').setValue('{not json')
    expect(wrapper.text()).toMatch(/1 problem/)
    const confirm = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Confirm Restore')
    expect(confirm.attributes('disabled')).toBeDefined()
  })

  it('restores ledgers and settings on confirm', async () => {
    const ledgers = useLedgers()
    const settings = useSettings()

    ledgers.setEntries('stocks', [
      {
        symbol: 'TLKM.JK',
        date: '2026-07-31',
        installment_amount: 500,
        new_share_purchases: 0,
        dividends: 0,
        current_value: 550,
      },
    ])
    ledgers.setResult('stocks', { summary: { xirr: 0.5 }, ledger: [] })

    const payload = exportPortfolioJson(ledgers.ledgers, {
      locale: 'id-ID',
      currency: 'IDR',
      market: 'US',
    })

    const wrapper = mountPortfolioIo()
    await wrapper.find('textarea').setValue(payload)
    const confirm = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Confirm Restore')
    await confirm.trigger('click')

    expect(ledgers.getEntries('stocks')).toEqual([
      expect.objectContaining({ symbol: 'TLKM.JK' }),
    ])
    expect(ledgers.getResult('stocks')).toBeNull()
    expect(settings.locale).toBe('id-ID')
    expect(settings.market).toBe('US')
    expect(wrapper.text()).toContain('Portfolio restored')
  })
})
