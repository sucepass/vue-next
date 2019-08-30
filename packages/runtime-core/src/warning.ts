import { VNode } from './vnode'
import { Data, ComponentInstance } from './component'
import { isString } from '@vue/shared'
import { toRaw } from '@vue/reactivity'

let stack: VNode[] = []

type TraceEntry = {
  vnode: VNode
  recurseCount: number
}

type ComponentTraceStack = TraceEntry[]

export function pushWarningContext(vnode: VNode) {
  stack.push(vnode)
}

export function popWarningContext() {
  stack.pop()
}

export function warn(msg: string, ...args: any[]) {
  // TODO app level warn handler
  console.warn(`[Vue warn]: ${msg}`, ...args)
  const trace = getComponentTrace()
  if (!trace.length) {
    return
  }
  if (trace.length > 1 && console.groupCollapsed) {
    console.groupCollapsed('at', ...formatTraceEntry(trace[0]))
    const logs: string[] = []
    trace.slice(1).forEach((entry, i) => {
      if (i !== 0) logs.push('\n')
      logs.push(...formatTraceEntry(entry, i + 1))
    })
    console.log(...logs)
    console.groupEnd()
  } else {
    const logs: string[] = []
    trace.forEach((entry, i) => {
      const formatted = formatTraceEntry(entry, i)
      if (i === 0) {
        logs.push('at', ...formatted)
      } else {
        logs.push('\n', ...formatted)
      }
    })
    console.log(...logs)
  }
}

function getComponentTrace(): ComponentTraceStack {
  let currentVNode: VNode | null = stack[stack.length - 1]
  if (!currentVNode) {
    return []
  }

  // we can't just use the stack because it will be incomplete during updates
  // that did not start from the root. Re-construct the parent chain using
  // instance parent pointers.
  const normlaizedStack: ComponentTraceStack = []

  while (currentVNode) {
    const last = normlaizedStack[0]
    if (last && last.vnode === currentVNode) {
      last.recurseCount++
    } else {
      normlaizedStack.push({
        vnode: currentVNode,
        recurseCount: 0
      })
    }
    const parentInstance: ComponentInstance | null = (currentVNode.component as ComponentInstance)
      .parent
    currentVNode = parentInstance && parentInstance.vnode
  }

  return normlaizedStack
}

function formatTraceEntry(
  { vnode, recurseCount }: TraceEntry,
  depth: number = 0
): string[] {
  const padding = depth === 0 ? '' : ' '.repeat(depth * 2 + 1)
  const postfix =
    recurseCount > 0 ? `... (${recurseCount} recursive calls)` : ``
  const open = padding + `<${formatComponentName(vnode)}`
  const close = `>` + postfix
  const rootLabel =
    (vnode.component as ComponentInstance).parent == null ? `(Root)` : ``
  return vnode.props
    ? [open, ...formatProps(vnode.props), close, rootLabel]
    : [open + close, rootLabel]
}

const classifyRE = /(?:^|[-_])(\w)/g
const classify = (str: string): string =>
  str.replace(classifyRE, c => c.toUpperCase()).replace(/[-_]/g, '')

function formatComponentName(vnode: VNode, file?: string): string {
  const Component = vnode.type as any
  let name = Component.displayName || Component.name
  if (!name && file) {
    const match = file.match(/([^/\\]+)\.vue$/)
    if (match) {
      name = match[1]
    }
  }
  return name ? classify(name) : 'AnonymousComponent'
}

function formatProps(props: Data): string[] {
  const res: string[] = []
  for (const key in props) {
    const value = props[key]
    if (isString(value)) {
      res.push(`${key}=${JSON.stringify(value)}`)
    } else {
      res.push(`${key}=`, toRaw(value) as any)
    }
  }
  return res
}
