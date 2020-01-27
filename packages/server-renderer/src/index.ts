import {
  App,
  Component,
  ComponentInternalInstance,
  createComponentInstance,
  setupComponent,
  VNode,
  createVNode
} from 'vue'
import { isString, isPromise, isArray } from '@vue/shared'

type SSRBuffer = SSRBufferItem[]
type SSRBufferItem = string | ResolvedSSRBuffer | Promise<SSRBuffer>
type ResolvedSSRBuffer = (string | ResolvedSSRBuffer)[]

function createBuffer() {
  let appendable = false
  let hasAsync = false
  const buffer: SSRBuffer = []
  return {
    buffer,
    hasAsync() {
      return hasAsync
    },
    push(item: SSRBufferItem) {
      const isStringItem = isString(item)
      if (appendable && isStringItem) {
        buffer[buffer.length - 1] += item as string
      } else {
        buffer.push(item)
      }
      appendable = isStringItem
      if (!isStringItem && !isArray(item)) {
        // promise
        hasAsync = true
      }
    }
  }
}

function unrollBuffer(buffer: ResolvedSSRBuffer): string {
  let ret = ''
  for (let i = 0; i < buffer.length; i++) {
    const item = buffer[i]
    if (isString(item)) {
      ret += item
    } else {
      ret += unrollBuffer(item)
    }
  }
  return ret
}

export async function renderToString(app: App): Promise<string> {
  const resolvedBuffer = (await renderComponent(
    app._component,
    app._props
  )) as ResolvedSSRBuffer
  return unrollBuffer(resolvedBuffer)
}

export function renderComponent(
  comp: Component,
  props: Record<string, any> | null = null,
  children: VNode['children'] = null,
  parentComponent: ComponentInternalInstance | null = null
): ResolvedSSRBuffer | Promise<SSRBuffer> {
  const vnode = createVNode(comp, props, children)
  const instance = createComponentInstance(vnode, parentComponent)
  const res = setupComponent(instance, null)
  if (isPromise(res)) {
    return res.then(() => innerRenderComponent(comp, instance))
  } else {
    return innerRenderComponent(comp, instance)
  }
}

function innerRenderComponent(
  comp: Component,
  instance: ComponentInternalInstance
): ResolvedSSRBuffer | Promise<SSRBuffer> {
  const { buffer, push, hasAsync } = createBuffer()
  if (typeof comp === 'function') {
    // TODO FunctionalComponent
  } else {
    if (comp.ssrRender) {
      // optimized
      comp.ssrRender(push, instance.proxy)
    } else if (comp.render) {
      // TODO fallback to vdom serialization
    } else {
      // TODO warn component missing render function
    }
  }
  // If the current component's buffer contains any Promise from async children,
  // then it must return a Promise too. Otherwise this is a component that
  // contains only sync children so we can avoid the async book-keeping overhead.
  return hasAsync()
    ? // TS can't figure out the typing due to recursive appearance of Promise
      Promise.all(buffer as any)
    : (buffer as ResolvedSSRBuffer)
}
