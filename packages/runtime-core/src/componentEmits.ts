import {
  isArray,
  isOn,
  hasOwn,
  EMPTY_OBJ,
  capitalize,
  hyphenate,
  isFunction
} from '@vue/shared'
import { ComponentInternalInstance } from './component'
import { callWithAsyncErrorHandling, ErrorCodes } from './errorHandling'
import { warn } from './warning'

export type ObjectEmitsOptions = Record<
  string,
  ((...args: any[]) => any) | null
>
export type EmitsOptions = ObjectEmitsOptions | string[]

type UnionToIntersection<U> = (U extends any
  ? (k: U) => void
  : never) extends ((k: infer I) => void)
  ? I
  : never

export type EmitFn<
  Options = ObjectEmitsOptions,
  Event extends keyof Options = keyof Options
> = Options extends any[]
  ? (event: Options[0], ...args: any[]) => unknown[]
  : UnionToIntersection<
      {
        [key in Event]: Options[key] extends ((...args: infer Args) => any)
          ? (event: key, ...args: Args) => unknown[]
          : (event: key, ...args: any[]) => unknown[]
      }[Event]
    >

export function emit(
  instance: ComponentInternalInstance,
  event: string,
  ...args: any[]
): any[] {
  const props = instance.vnode.props || EMPTY_OBJ

  if (__DEV__) {
    const options = normalizeEmitsOptions(instance.type.emits)
    if (options) {
      if (!(event in options)) {
        warn(
          `Component emitted event "${event}" but it is not declared in the ` +
            `emits option.`
        )
      } else {
        const validator = options[event]
        if (isFunction(validator)) {
          const isValid = validator(...args)
          if (!isValid) {
            warn(
              `Invalid event arguments: event validation failed for event "${event}".`
            )
          }
        }
      }
    }
  }

  let handler = props[`on${event}`] || props[`on${capitalize(event)}`]
  // for v-model update:xxx events, also trigger kebab-case equivalent
  // for props passed via kebab-case
  if (!handler && event.indexOf('update:') === 0) {
    event = hyphenate(event)
    handler = props[`on${event}`] || props[`on${capitalize(event)}`]
  }
  if (handler) {
    const res = callWithAsyncErrorHandling(
      handler,
      instance,
      ErrorCodes.COMPONENT_EVENT_HANDLER,
      args
    )
    return isArray(res) ? res : [res]
  } else {
    return []
  }
}

export function normalizeEmitsOptions(
  options: EmitsOptions | undefined
): ObjectEmitsOptions | undefined {
  if (!options) {
    return
  } else if (isArray(options)) {
    if ((options as any)._n) {
      return (options as any)._n
    }
    const normalized: ObjectEmitsOptions = {}
    options.forEach(key => (normalized[key] = null))
    Object.defineProperty(options, '_n', { value: normalized })
    return normalized
  } else {
    return options
  }
}

// Check if an incoming prop key is a declared emit event listener.
// e.g. With `emits: { click: null }`, props named `onClick` and `onclick` are
// both considered matched listeners.
export function isEmitListener(emits: EmitsOptions, key: string): boolean {
  return (
    isOn(key) &&
    (hasOwn(
      (emits = normalizeEmitsOptions(emits) as ObjectEmitsOptions),
      key[2].toLowerCase() + key.slice(3)
    ) ||
      hasOwn(emits, key.slice(2)))
  )
}
