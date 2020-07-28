import { renderSlot } from '../../src/helpers/renderSlot'
import { h } from '../../src/h'

describe('renderSlot', () => {
  it('should render slot', () => {
    let child
    const vnode = renderSlot(
      { default: () => [(child = h('child'))] },
      'default'
    )
    expect(vnode.children).toEqual([child])
  })

  it('should render slot fallback', () => {
    const vnode = renderSlot({}, 'default', {}, () => ['fallback'])
    expect(vnode.children).toEqual(['fallback'])
  })

  it('should warn render ssr slot', () => {
    renderSlot({ default: (_a, _b, _c) => [h('child')] }, 'default')
    expect('SSR-optimized slot function detected').toHaveBeenWarned()
  })
})
