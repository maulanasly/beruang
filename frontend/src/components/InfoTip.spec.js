import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import InfoTip from './InfoTip.vue'

function mountTip(text) {
  return mount(InfoTip, { props: { text } })
}

describe('InfoTip', () => {
  it('renders the info glyph with role note', () => {
    const wrapper = mountTip('A helpful explanation.')
    expect(wrapper.find('span.info-tip').exists()).toBe(true)
    expect(wrapper.attributes('role')).toBe('note')
  })

  it('exposes the explanation via the title attribute and data-tip', () => {
    const wrapper = mountTip('MoM means month-over-month.')
    expect(wrapper.attributes('title')).toBe('MoM means month-over-month.')
    expect(wrapper.attributes('data-tip')).toBe('MoM means month-over-month.')
  })

  it('is focusable for keyboard users', () => {
    const wrapper = mountTip('Help text.')
    expect(wrapper.attributes('tabindex')).toBe('0')
  })
})
