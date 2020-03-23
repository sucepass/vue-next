import {
  createAsyncComponent,
  h,
  Component,
  ref,
  nextTick,
  Suspense
} from '../src'
import { createApp, nodeOps, serializeInner } from '@vue/runtime-test'

const timeout = (n: number = 0) => new Promise(r => setTimeout(r, n))

describe('api: createAsyncComponent', () => {
  test('simple usage', async () => {
    let resolve: (comp: Component) => void
    const Foo = createAsyncComponent(
      () =>
        new Promise(r => {
          resolve = r as any
        })
    )

    const toggle = ref(true)
    const root = nodeOps.createElement('div')
    createApp({
      components: { Foo },
      render: () => (toggle.value ? h(Foo) : null)
    }).mount(root)

    expect(serializeInner(root)).toBe('<!---->')

    resolve!(() => 'resolved')
    // first time resolve, wait for macro task since there are multiple
    // microtasks / .then() calls
    await timeout()
    expect(serializeInner(root)).toBe('resolved')

    toggle.value = false
    await nextTick()
    expect(serializeInner(root)).toBe('<!---->')

    // already resolved component should update on nextTick
    toggle.value = true
    await nextTick()
    expect(serializeInner(root)).toBe('resolved')
  })

  test('with loading component', async () => {
    let resolve: (comp: Component) => void
    const Foo = createAsyncComponent({
      loader: () =>
        new Promise(r => {
          resolve = r as any
        }),
      loading: () => 'loading',
      delay: 1 // defaults to 200
    })

    const toggle = ref(true)
    const root = nodeOps.createElement('div')
    createApp({
      components: { Foo },
      render: () => (toggle.value ? h(Foo) : null)
    }).mount(root)

    // due to the delay, initial mount should be empty
    expect(serializeInner(root)).toBe('<!---->')

    // loading show up after delay
    await timeout(1)
    expect(serializeInner(root)).toBe('loading')

    resolve!(() => 'resolved')
    await timeout()
    expect(serializeInner(root)).toBe('resolved')

    toggle.value = false
    await nextTick()
    expect(serializeInner(root)).toBe('<!---->')

    // already resolved component should update on nextTick without loading
    // state
    toggle.value = true
    await nextTick()
    expect(serializeInner(root)).toBe('resolved')
  })

  test('with loading component + explicit delay (0)', async () => {
    let resolve: (comp: Component) => void
    const Foo = createAsyncComponent({
      loader: () =>
        new Promise(r => {
          resolve = r as any
        }),
      loading: () => 'loading',
      delay: 0
    })

    const toggle = ref(true)
    const root = nodeOps.createElement('div')
    createApp({
      components: { Foo },
      render: () => (toggle.value ? h(Foo) : null)
    }).mount(root)

    // with delay: 0, should show loading immediately
    expect(serializeInner(root)).toBe('loading')

    resolve!(() => 'resolved')
    await timeout()
    expect(serializeInner(root)).toBe('resolved')

    toggle.value = false
    await nextTick()
    expect(serializeInner(root)).toBe('<!---->')

    // already resolved component should update on nextTick without loading
    // state
    toggle.value = true
    await nextTick()
    expect(serializeInner(root)).toBe('resolved')
  })

  test('error without error component', async () => {
    let resolve: (comp: Component) => void
    let reject: (e: Error) => void
    const Foo = createAsyncComponent(
      () =>
        new Promise((_resolve, _reject) => {
          resolve = _resolve as any
          reject = _reject
        })
    )

    const toggle = ref(true)
    const root = nodeOps.createElement('div')
    const app = createApp({
      components: { Foo },
      render: () => (toggle.value ? h(Foo) : null)
    })

    const handler = (app.config.errorHandler = jest.fn())

    app.mount(root)
    expect(serializeInner(root)).toBe('<!---->')

    const err = new Error('foo')
    reject!(err)
    await timeout()
    expect(handler).toHaveBeenCalled()
    expect(handler.mock.calls[0][0]).toBe(err)
    expect(serializeInner(root)).toBe('<!---->')

    toggle.value = false
    await nextTick()
    expect(serializeInner(root)).toBe('<!---->')

    // errored out on previous load, toggle and mock success this time
    toggle.value = true
    await nextTick()
    expect(serializeInner(root)).toBe('<!---->')

    // should render this time
    resolve!(() => 'resolved')
    await timeout()
    expect(serializeInner(root)).toBe('resolved')
  })

  test('error with error component', async () => {
    let resolve: (comp: Component) => void
    let reject: (e: Error) => void
    const Foo = createAsyncComponent({
      loader: () =>
        new Promise((_resolve, _reject) => {
          resolve = _resolve as any
          reject = _reject
        }),
      error: (props: { error: Error }) => props.error.message
    })

    const toggle = ref(true)
    const root = nodeOps.createElement('div')
    const app = createApp({
      components: { Foo },
      render: () => (toggle.value ? h(Foo) : null)
    })

    const handler = (app.config.errorHandler = jest.fn())

    app.mount(root)
    expect(serializeInner(root)).toBe('<!---->')

    const err = new Error('errored out')
    reject!(err)
    await timeout()
    expect(handler).toHaveBeenCalled()
    expect(serializeInner(root)).toBe('errored out')

    toggle.value = false
    await nextTick()
    expect(serializeInner(root)).toBe('<!---->')

    // errored out on previous load, toggle and mock success this time
    toggle.value = true
    await nextTick()
    expect(serializeInner(root)).toBe('<!---->')

    // should render this time
    resolve!(() => 'resolved')
    await timeout()
    expect(serializeInner(root)).toBe('resolved')
  })

  test('error with error + loading components', async () => {
    let resolve: (comp: Component) => void
    let reject: (e: Error) => void
    const Foo = createAsyncComponent({
      loader: () =>
        new Promise((_resolve, _reject) => {
          resolve = _resolve as any
          reject = _reject
        }),
      error: (props: { error: Error }) => props.error.message,
      loading: () => 'loading',
      delay: 1
    })

    const toggle = ref(true)
    const root = nodeOps.createElement('div')
    const app = createApp({
      components: { Foo },
      render: () => (toggle.value ? h(Foo) : null)
    })

    const handler = (app.config.errorHandler = jest.fn())

    app.mount(root)

    // due to the delay, initial mount should be empty
    expect(serializeInner(root)).toBe('<!---->')

    // loading show up after delay
    await timeout(1)
    expect(serializeInner(root)).toBe('loading')

    const err = new Error('errored out')
    reject!(err)
    await timeout()
    expect(handler).toHaveBeenCalled()
    expect(serializeInner(root)).toBe('errored out')

    toggle.value = false
    await nextTick()
    expect(serializeInner(root)).toBe('<!---->')

    // errored out on previous load, toggle and mock success this time
    toggle.value = true
    await nextTick()
    expect(serializeInner(root)).toBe('<!---->')

    // loading show up after delay
    await timeout(1)
    expect(serializeInner(root)).toBe('loading')

    // should render this time
    resolve!(() => 'resolved')
    await timeout()
    expect(serializeInner(root)).toBe('resolved')
  })

  test('timeout without error component', async () => {
    let resolve: (comp: Component) => void
    const Foo = createAsyncComponent({
      loader: () =>
        new Promise(_resolve => {
          resolve = _resolve as any
        }),
      timeout: 1
    })

    const root = nodeOps.createElement('div')
    const app = createApp({
      components: { Foo },
      render: () => h(Foo)
    })

    const handler = (app.config.errorHandler = jest.fn())

    app.mount(root)
    expect(serializeInner(root)).toBe('<!---->')

    await timeout(1)
    expect(handler).toHaveBeenCalled()
    expect(handler.mock.calls[0][0].message).toMatch(
      `Async component timed out after 1ms.`
    )
    expect(serializeInner(root)).toBe('<!---->')

    // if it resolved after timeout, should still work
    resolve!(() => 'resolved')
    await timeout()
    expect(serializeInner(root)).toBe('resolved')
  })

  test('timeout with error component', async () => {
    let resolve: (comp: Component) => void
    const Foo = createAsyncComponent({
      loader: () =>
        new Promise(_resolve => {
          resolve = _resolve as any
        }),
      timeout: 1,
      error: () => 'timed out'
    })

    const root = nodeOps.createElement('div')
    const app = createApp({
      components: { Foo },
      render: () => h(Foo)
    })

    const handler = (app.config.errorHandler = jest.fn())

    app.mount(root)
    expect(serializeInner(root)).toBe('<!---->')

    await timeout(1)
    expect(handler).toHaveBeenCalled()
    expect(serializeInner(root)).toBe('timed out')

    // if it resolved after timeout, should still work
    resolve!(() => 'resolved')
    await timeout()
    expect(serializeInner(root)).toBe('resolved')
  })

  test('timeout with error + loading components', async () => {
    let resolve: (comp: Component) => void
    const Foo = createAsyncComponent({
      loader: () =>
        new Promise(_resolve => {
          resolve = _resolve as any
        }),
      delay: 1,
      timeout: 16,
      error: () => 'timed out',
      loading: () => 'loading'
    })

    const root = nodeOps.createElement('div')
    const app = createApp({
      components: { Foo },
      render: () => h(Foo)
    })
    const handler = (app.config.errorHandler = jest.fn())
    app.mount(root)
    expect(serializeInner(root)).toBe('<!---->')
    await timeout(1)
    expect(serializeInner(root)).toBe('loading')

    await timeout(16)
    expect(serializeInner(root)).toBe('timed out')
    expect(handler).toHaveBeenCalled()

    resolve!(() => 'resolved')
    await timeout()
    expect(serializeInner(root)).toBe('resolved')
  })

  test('timeout without error component, but with loading component', async () => {
    let resolve: (comp: Component) => void
    const Foo = createAsyncComponent({
      loader: () =>
        new Promise(_resolve => {
          resolve = _resolve as any
        }),
      delay: 1,
      timeout: 16,
      loading: () => 'loading'
    })

    const root = nodeOps.createElement('div')
    const app = createApp({
      components: { Foo },
      render: () => h(Foo)
    })
    const handler = (app.config.errorHandler = jest.fn())
    app.mount(root)
    expect(serializeInner(root)).toBe('<!---->')
    await timeout(1)
    expect(serializeInner(root)).toBe('loading')

    await timeout(16)
    expect(handler).toHaveBeenCalled()
    expect(handler.mock.calls[0][0].message).toMatch(
      `Async component timed out after 16ms.`
    )
    // should still display loading
    expect(serializeInner(root)).toBe('loading')

    resolve!(() => 'resolved')
    await timeout()
    expect(serializeInner(root)).toBe('resolved')
  })

  test('with suspense', async () => {
    let resolve: (comp: Component) => void
    const Foo = createAsyncComponent(
      () =>
        new Promise(_resolve => {
          resolve = _resolve as any
        })
    )

    const root = nodeOps.createElement('div')
    const app = createApp({
      components: { Foo },
      render: () =>
        h(Suspense, null, {
          default: () => [h(Foo), ' & ', h(Foo)],
          fallback: () => 'loading'
        })
    })

    app.mount(root)
    expect(serializeInner(root)).toBe('loading')

    resolve!(() => 'resolved')
    await timeout()
    expect(serializeInner(root)).toBe('resolved & resolved')
  })

  test('suspensible: false', async () => {
    let resolve: (comp: Component) => void
    const Foo = createAsyncComponent({
      loader: () =>
        new Promise(_resolve => {
          resolve = _resolve as any
        }),
      suspensible: false
    })

    const root = nodeOps.createElement('div')
    const app = createApp({
      components: { Foo },
      render: () =>
        h(Suspense, null, {
          default: () => [h(Foo), ' & ', h(Foo)],
          fallback: () => 'loading'
        })
    })

    app.mount(root)
    // should not show suspense fallback
    expect(serializeInner(root)).toBe('<!----> & <!---->')

    resolve!(() => 'resolved')
    await timeout()
    expect(serializeInner(root)).toBe('resolved & resolved')
  })

  test('suspense with error handling', async () => {
    let reject: (e: Error) => void
    const Foo = createAsyncComponent(
      () =>
        new Promise((_resolve, _reject) => {
          reject = _reject
        })
    )

    const root = nodeOps.createElement('div')
    const app = createApp({
      components: { Foo },
      render: () =>
        h(Suspense, null, {
          default: () => [h(Foo), ' & ', h(Foo)],
          fallback: () => 'loading'
        })
    })

    const handler = (app.config.errorHandler = jest.fn())
    app.mount(root)
    expect(serializeInner(root)).toBe('loading')

    reject!(new Error('no'))
    await timeout()
    expect(handler).toHaveBeenCalled()
    expect(serializeInner(root)).toBe('<!----> & <!---->')
  })
})
