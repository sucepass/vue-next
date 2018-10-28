import { withHooks, useState, h, nextTick, useEffect } from '../src'
import { renderIntsance, serialize, triggerEvent } from '@vue/runtime-test'

describe('hooks', () => {
  it('useState', async () => {
    const Counter = withHooks(() => {
      const [count, setCount] = useState(0)
      return h(
        'div',
        {
          onClick: () => {
            setCount(count + 1)
          }
        },
        count
      )
    })

    const counter = renderIntsance(Counter)
    expect(serialize(counter.$el)).toBe(`<div>0</div>`)

    triggerEvent(counter.$el, 'click')
    await nextTick()
    expect(serialize(counter.$el)).toBe(`<div>1</div>`)
  })

  it('useEffect', async () => {
    let effect = -1

    const Counter = withHooks(() => {
      const [count, setCount] = useState(0)
      useEffect(() => {
        effect = count
      })
      return h(
        'div',
        {
          onClick: () => {
            setCount(count + 1)
          }
        },
        count
      )
    })

    const counter = renderIntsance(Counter)
    expect(effect).toBe(0)
    triggerEvent(counter.$el, 'click')
    await nextTick()
    expect(effect).toBe(1)
  })

  it('useEffect with empty keys', async () => {
    // TODO
  })

  it('useEffect with keys', async () => {
    // TODO
  })
})
