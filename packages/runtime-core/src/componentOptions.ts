import {
  Component,
  ComponentInstance,
  ComponentClass,
  APIMethods,
  LifecycleMethods
} from './component'
import { isArray, isObject, isFunction } from '@vue/shared'
import { normalizePropsOptions } from './componentProps'
import { warn } from './warning'
import { h } from './h'

export type Data = Record<string, any>

export interface ComponentClassOptions<P = {}, This = ComponentInstance> {
  props?: ComponentPropsOptions<P>
  computed?: ComponentComputedOptions<This>
  watch?: ComponentWatchOptions<This>
  displayName?: string
  fromOptions?: boolean
}

export interface ComponentOptions<
  P = {},
  D = {},
  This = ComponentInstance<P, D>
>
  extends ComponentClassOptions<P, This>,
    Partial<APIMethods<P, D>>,
    Partial<LifecycleMethods> {
  // TODO other options
  readonly [key: string]: any
}

export type ComponentPropsOptions<P = Data> = {
  [K in keyof P]: PropValidator<P[K]>
}

export type Prop<T> = { (): T } | { new (...args: any[]): T & object }

export type PropType<T> = Prop<T> | Prop<T>[]

export type PropValidator<T> = PropOptions<T> | PropType<T>

export interface PropOptions<T = any> {
  type?: PropType<T> | true | null
  required?: boolean
  default?: T | null | undefined | (() => T | null | undefined)
  validator?(value: T): boolean
}

export interface ComponentComputedOptions<This = ComponentInstance> {
  [key: string]: ((this: This, c: This) => any) | SingleComputedOptions<This>
}

type SingleComputedOptions<This> = {
  get: (this: This, c: This) => any
  set?: (value: any) => void
  cache?: boolean
}

export interface ComponentWatchOptions<This = ComponentInstance> {
  [key: string]: ComponentWatchOption<This>
}

export type ComponentWatchOption<This = ComponentInstance> =
  | WatchHandler<This>
  | WatchHandler<This>[]
  | WatchOptionsWithHandler<This>
  | string

export type WatchHandler<This = any> = (
  this: This,
  val: any,
  oldVal: any
) => void

export interface WatchOptionsWithHandler<This = any> extends WatchOptions {
  handler: WatchHandler<This>
}

export interface WatchOptions {
  sync?: boolean
  deep?: boolean
  immediate?: boolean
}

type ReservedKeys = { [K in keyof (APIMethods & LifecycleMethods)]: 1 }

export const reservedMethods: ReservedKeys = {
  data: 1,
  render: 1,
  beforeCreate: 1,
  created: 1,
  beforeMount: 1,
  mounted: 1,
  beforeUpdate: 1,
  updated: 1,
  beforeUnmount: 1,
  unmounted: 1,
  errorCaptured: 1,
  activated: 1,
  deactivated: 1,
  renderTracked: 1,
  renderTriggered: 1
}

// This is a special marker from the @prop decorator.
// The decorator stores prop options on the Class' prototype as __prop_xxx
const propPrefixRE = /^__prop_/

// This is called in the base component constructor and the return value is
// set on the instance as $options.
export function resolveComponentOptionsFromClass(
  Class: ComponentClass
): ComponentOptions {
  if (Class.hasOwnProperty('options')) {
    return Class.options as ComponentOptions
  }
  let options = {} as any

  const staticDescriptors = Object.getOwnPropertyDescriptors(Class)
  for (const key in staticDescriptors) {
    const { enumerable, get, value } = staticDescriptors[key]
    if (enumerable || get) {
      options[key] = get ? get() : value
    }
  }

  // pre-normalize array props options into object.
  // we may need to attach more props to it (declared by decorators)
  if (Array.isArray(options.props)) {
    options.props = normalizePropsOptions(options.props)
  }

  const instanceDescriptors = Object.getOwnPropertyDescriptors(Class.prototype)
  for (const key in instanceDescriptors) {
    const { get, value } = instanceDescriptors[key]
    if (get) {
      // computed properties
      ;(options.computed || (options.computed = {}))[key] = get
      // there's no need to do anything for the setter
      // as it's already defined on the prototype
    } else if (isFunction(value) && key !== 'constructor') {
      if (key in reservedMethods) {
        // lifecycle hooks / reserved methods
        options[key] = value
      } else {
        // normal methods
        ;(options.methods || (options.methods = {}))[key] = value
      }
    } else if (propPrefixRE.test(key)) {
      // decorator-declared props
      const propName = key.replace(propPrefixRE, '')
      ;(options.props || (options.props = {}))[propName] = value
    }
  }

  // post-normalize all prop options into same object format
  if (options.props) {
    options.props = normalizePropsOptions(options.props)
  }

  const ParentClass = Object.getPrototypeOf(Class)
  if (ParentClass !== Component) {
    const parentOptions = resolveComponentOptionsFromClass(ParentClass)
    options = mergeComponentOptions(parentOptions, options)
  }

  Class.options = options
  return options
}

export function createComponentClassFromOptions(
  options: ComponentOptions
): ComponentClass {
  class AnonymousComponent extends Component {
    static options = options
    // indicate this component was created from options
    static fromOptions = true
  }
  const proto = AnonymousComponent.prototype as any
  for (const key in options) {
    const value = options[key]
    if (key === 'render') {
      if (__COMPAT__) {
        options.render = function() {
          return value.call(this, h)
        }
      }
      // so that we can call instance.render directly
      proto.render = options.render
    } else if (key === 'computed') {
      // create computed setters on prototype
      // (getters are handled by the render proxy)
      for (const computedKey in value) {
        const computed = value[computedKey]
        const set = isObject(computed) && computed.set
        if (set) {
          Object.defineProperty(proto, computedKey, {
            configurable: true,
            set
          })
        }
      }
    } else if (key === 'methods') {
      for (const method in value) {
        if (__DEV__ && proto.hasOwnProperty(method)) {
          warn(
            `Object syntax contains method name that conflicts with ` +
              `lifecycle hook: "${method}"`
          )
        }
        proto[method] = value[method]
      }
    } else if (__COMPAT__) {
      if (key === 'name') {
        options.displayName = value
      } else if (key === 'render') {
        options.render = function() {
          return value.call(this, h)
        }
      } else if (key === 'beforeDestroy') {
        options.beforeUnmount = value
      } else if (key === 'destroyed') {
        options.unmounted = value
      }
    }
  }
  return AnonymousComponent as ComponentClass
}

export function mergeComponentOptions(to: any, from: any): ComponentOptions {
  const res: any = Object.assign({}, to)
  if (from.mixins) {
    from.mixins.forEach((mixin: any) => {
      from = mergeComponentOptions(from, mixin)
    })
  }
  for (const key in from) {
    const value = from[key]
    const existing = res[key]
    if (isFunction(value) && isFunction(existing)) {
      if (key === 'data') {
        // for data we need to merge the returned value
        res[key] = mergeDataFn(existing, value)
      } else if (/^render|^errorCaptured/.test(key)) {
        // render, renderTracked, renderTriggered & errorCaptured
        // are never merged
        res[key] = value
      } else {
        // merge lifecycle hooks
        res[key] = mergeLifecycleHooks(existing, value)
      }
    } else if (isArray(value) && isArray(existing)) {
      res[key] = existing.concat(value)
    } else if (isObject(value) && isObject(existing)) {
      res[key] = Object.assign({}, existing, value)
    } else {
      res[key] = value
    }
  }
  return res
}

export function mergeLifecycleHooks(a: Function, b: Function): Function {
  return function(...args: any[]) {
    a.call(this, ...args)
    b.call(this, ...args)
  }
}

export function mergeDataFn(a: Function, b: Function): Function {
  // TODO: backwards compat requires recursive merge,
  // but maybe we should just warn if we detect clashing keys
  return function() {
    return Object.assign(a.call(this), b.call(this))
  }
}
