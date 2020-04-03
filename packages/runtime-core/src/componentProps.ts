import { toRaw, lock, unlock } from '@vue/reactivity'
import {
  EMPTY_OBJ,
  camelize,
  hyphenate,
  capitalize,
  isString,
  isFunction,
  isArray,
  isObject,
  hasOwn,
  toRawType,
  PatchFlags,
  makeMap,
  isReservedProp,
  EMPTY_ARR,
  ShapeFlags,
  isOn
} from '@vue/shared'
import { warn } from './warning'
import { Data, ComponentInternalInstance } from './component'
import { EmitsOptions } from './apiOptions'

export type ComponentPropsOptions<P = Data> =
  | ComponentObjectPropsOptions<P>
  | string[]

export type ComponentObjectPropsOptions<P = Data> = {
  [K in keyof P]: Prop<P[K]> | null
}

export type Prop<T> = PropOptions<T> | PropType<T>

type DefaultFactory<T> = () => T | null | undefined

interface PropOptions<T = any> {
  type?: PropType<T> | true | null
  required?: boolean
  default?: T | DefaultFactory<T> | null | undefined
  validator?(value: unknown): boolean
}

export type PropType<T> = PropConstructor<T> | PropConstructor<T>[]

type PropConstructor<T = any> =
  | { new (...args: any[]): T & object }
  | { (): T }
  | PropMethod<T>

type PropMethod<T> = T extends (...args: any) => any // if is function with args
  ? { new (): T; (): T; readonly proptotype: Function } // Create Function like contructor
  : never

type RequiredKeys<T, MakeDefaultRequired> = {
  [K in keyof T]: T[K] extends
    | { required: true }
    | (MakeDefaultRequired extends true ? { default: any } : never)
    ? K
    : never
}[keyof T]

type OptionalKeys<T, MakeDefaultRequired> = Exclude<
  keyof T,
  RequiredKeys<T, MakeDefaultRequired>
>

type InferPropType<T> = T extends null
  ? any // null & true would fail to infer
  : T extends { type: null | true }
    ? any // somehow `ObjectConstructor` when inferred from { (): T } becomes `any`
    : T extends ObjectConstructor | { type: ObjectConstructor }
      ? { [key: string]: any }
      : T extends Prop<infer V> ? V : T

export type ExtractPropTypes<
  O,
  MakeDefaultRequired extends boolean = true
> = O extends object
  ? { [K in RequiredKeys<O, MakeDefaultRequired>]: InferPropType<O[K]> } &
      { [K in OptionalKeys<O, MakeDefaultRequired>]?: InferPropType<O[K]> }
  : { [K in string]: any }

const enum BooleanFlags {
  shouldCast,
  shouldCastTrue
}

type NormalizedProp =
  | null
  | (PropOptions & {
      [BooleanFlags.shouldCast]?: boolean
      [BooleanFlags.shouldCastTrue]?: boolean
    })

// normalized value is a tuple of the actual normalized options
// and an array of prop keys that need value casting (booleans and defaults)
type NormalizedPropsOptions = [Record<string, NormalizedProp>, string[]]

// resolve raw VNode data.
// - filter out reserved keys (key, ref)
// - extract class and style into $attrs (to be merged onto child
//   component root)
// - for the rest:
//   - if has declared props: put declared ones in `props`, the rest in `attrs`
//   - else: everything goes in `props`.

export function resolveProps(
  instance: ComponentInternalInstance,
  rawProps: Data | null
) {
  const _options = instance.type.props
  const hasDeclaredProps = !!_options
  if (!rawProps && !hasDeclaredProps) {
    instance.props = instance.attrs = EMPTY_OBJ
    return
  }

  const { 0: options, 1: needCastKeys } = normalizePropsOptions(_options)!
  const emits = normalizeEmitsOptions(instance.type.emits)
  const props: Data = {}
  let attrs: Data | undefined = undefined

  // update the instance propsProxy (passed to setup()) to trigger potential
  // changes
  const propsProxy = instance.propsProxy
  const setProp = propsProxy
    ? (key: string, val: unknown) => {
        props[key] = val
        propsProxy[key] = val
      }
    : (key: string, val: unknown) => {
        props[key] = val
      }

  // allow mutation of propsProxy (which is readonly by default)
  unlock()

  if (rawProps) {
    for (const key in rawProps) {
      const value = rawProps[key]
      // key, ref are reserved and never passed down
      if (isReservedProp(key)) {
        continue
      }
      // prop option names are camelized during normalization, so to support
      // kebab -> camel conversion here we need to camelize the key.
      let camelKey
      if (hasDeclaredProps && hasOwn(options, (camelKey = camelize(key)))) {
        setProp(camelKey, value)
      } else if (!emits || !isListener(emits, key)) {
        // Any non-declared (either as a prop or an emitted event) props are put
        // into a separate `attrs` object for spreading. Make sure to preserve
        // original key casing
        ;(attrs || (attrs = {}))[key] = value
      }
    }
  }

  if (hasDeclaredProps) {
    // set default values & cast booleans
    for (let i = 0; i < needCastKeys.length; i++) {
      const key = needCastKeys[i]
      let opt = options[key]
      if (opt == null) continue
      const hasDefault = hasOwn(opt, 'default')
      const currentValue = props[key]
      // default values
      if (hasDefault && currentValue === undefined) {
        const defaultValue = opt.default
        setProp(key, isFunction(defaultValue) ? defaultValue() : defaultValue)
      }
      // boolean casting
      if (opt[BooleanFlags.shouldCast]) {
        if (!hasOwn(props, key) && !hasDefault) {
          setProp(key, false)
        } else if (
          opt[BooleanFlags.shouldCastTrue] &&
          (currentValue === '' || currentValue === hyphenate(key))
        ) {
          setProp(key, true)
        }
      }
    }
    // validation
    if (__DEV__ && rawProps) {
      for (const key in options) {
        let opt = options[key]
        if (opt == null) continue
        validateProp(key, props[key], opt, !hasOwn(props, key))
      }
    }
  }

  // in case of dynamic props, check if we need to delete keys from
  // the props proxy
  const { patchFlag } = instance.vnode
  if (
    hasDeclaredProps &&
    propsProxy &&
    (patchFlag === 0 || patchFlag & PatchFlags.FULL_PROPS)
  ) {
    const rawInitialProps = toRaw(propsProxy)
    for (const key in rawInitialProps) {
      if (!hasOwn(props, key)) {
        delete propsProxy[key]
      }
    }
  }

  // lock readonly
  lock()

  if (
    instance.vnode.shapeFlag & ShapeFlags.FUNCTIONAL_COMPONENT &&
    !hasDeclaredProps
  ) {
    // functional component with optional props: use attrs as props
    instance.props = attrs || EMPTY_OBJ
  } else {
    instance.props = props
  }
  instance.attrs = attrs || EMPTY_OBJ
}

function validatePropName(key: string) {
  if (key[0] !== '$') {
    return true
  } else if (__DEV__) {
    warn(`Invalid prop name: "${key}" is a reserved property.`)
  }
  return false
}

export function normalizePropsOptions(
  raw: ComponentPropsOptions | void
): NormalizedPropsOptions {
  if (!raw) {
    return EMPTY_ARR as any
  }
  if ((raw as any)._n) {
    return (raw as any)._n
  }
  const normalized: NormalizedPropsOptions[0] = {}
  const needCastKeys: NormalizedPropsOptions[1] = []
  if (isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      if (__DEV__ && !isString(raw[i])) {
        warn(`props must be strings when using array syntax.`, raw[i])
      }
      const normalizedKey = camelize(raw[i])
      if (validatePropName(normalizedKey)) {
        normalized[normalizedKey] = EMPTY_OBJ
      }
    }
  } else {
    if (__DEV__ && !isObject(raw)) {
      warn(`invalid props options`, raw)
    }
    for (const key in raw) {
      const normalizedKey = camelize(key)
      if (validatePropName(normalizedKey)) {
        const opt = raw[key]
        const prop: NormalizedProp = (normalized[normalizedKey] =
          isArray(opt) || isFunction(opt) ? { type: opt } : opt)
        if (prop) {
          const booleanIndex = getTypeIndex(Boolean, prop.type)
          const stringIndex = getTypeIndex(String, prop.type)
          prop[BooleanFlags.shouldCast] = booleanIndex > -1
          prop[BooleanFlags.shouldCastTrue] =
            stringIndex < 0 || booleanIndex < stringIndex
          // if the prop needs boolean casting or default value
          if (booleanIndex > -1 || hasOwn(prop, 'default')) {
            needCastKeys.push(normalizedKey)
          }
        }
      }
    }
  }
  const normalizedEntry: NormalizedPropsOptions = [normalized, needCastKeys]
  Object.defineProperty(raw, '_n', { value: normalizedEntry })
  return normalizedEntry
}

function normalizeEmitsOptions(
  options: EmitsOptions | undefined
): Record<string, any> | undefined {
  if (!options) {
    return
  } else if (isArray(options)) {
    if ((options as any)._n) {
      return (options as any)._n
    }
    const normalized: Record<string, null> = {}
    options.forEach(key => (normalized[key] = null))
    Object.defineProperty(options, '_n', normalized)
    return normalized
  } else {
    return options
  }
}

function isListener(emits: Record<string, any>, key: string): boolean {
  if (!isOn(key)) {
    return false
  }
  const eventName = key.slice(2)
  return (
    hasOwn(emits, eventName) ||
    hasOwn(emits, eventName[0].toLowerCase() + eventName.slice(1))
  )
}

// use function string name to check type constructors
// so that it works across vms / iframes.
function getType(ctor: Prop<any>): string {
  const match = ctor && ctor.toString().match(/^\s*function (\w+)/)
  return match ? match[1] : ''
}

function isSameType(a: Prop<any>, b: Prop<any>): boolean {
  return getType(a) === getType(b)
}

function getTypeIndex(
  type: Prop<any>,
  expectedTypes: PropType<any> | void | null | true
): number {
  if (isArray(expectedTypes)) {
    for (let i = 0, len = expectedTypes.length; i < len; i++) {
      if (isSameType(expectedTypes[i], type)) {
        return i
      }
    }
  } else if (isFunction(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  return -1
}

type AssertionResult = {
  valid: boolean
  expectedType: string
}

function validateProp(
  name: string,
  value: unknown,
  prop: PropOptions,
  isAbsent: boolean
) {
  const { type, required, validator } = prop
  // required!
  if (required && isAbsent) {
    warn('Missing required prop: "' + name + '"')
    return
  }
  // missing but optional
  if (value == null && !prop.required) {
    return
  }
  // type check
  if (type != null && type !== true) {
    let isValid = false
    const types = isArray(type) ? type : [type]
    const expectedTypes = []
    // value is valid as long as one of the specified types match
    for (let i = 0; i < types.length && !isValid; i++) {
      const { valid, expectedType } = assertType(value, types[i])
      expectedTypes.push(expectedType || '')
      isValid = valid
    }
    if (!isValid) {
      warn(getInvalidTypeMessage(name, value, expectedTypes))
      return
    }
  }
  // custom validator
  if (validator && !validator(value)) {
    warn('Invalid prop: custom validator check failed for prop "' + name + '".')
  }
}

const isSimpleType = /*#__PURE__*/ makeMap(
  'String,Number,Boolean,Function,Symbol'
)

function assertType(value: unknown, type: PropConstructor): AssertionResult {
  let valid
  const expectedType = getType(type)
  if (isSimpleType(expectedType)) {
    const t = typeof value
    valid = t === expectedType.toLowerCase()
    // for primitive wrapper objects
    if (!valid && t === 'object') {
      valid = value instanceof type
    }
  } else if (expectedType === 'Object') {
    valid = toRawType(value) === 'Object'
  } else if (expectedType === 'Array') {
    valid = isArray(value)
  } else {
    valid = value instanceof type
  }
  return {
    valid,
    expectedType
  }
}

function getInvalidTypeMessage(
  name: string,
  value: unknown,
  expectedTypes: string[]
): string {
  let message =
    `Invalid prop: type check failed for prop "${name}".` +
    ` Expected ${expectedTypes.map(capitalize).join(', ')}`
  const expectedType = expectedTypes[0]
  const receivedType = toRawType(value)
  const expectedValue = styleValue(value, expectedType)
  const receivedValue = styleValue(value, receivedType)
  // check if we need to specify expected value
  if (
    expectedTypes.length === 1 &&
    isExplicable(expectedType) &&
    !isBoolean(expectedType, receivedType)
  ) {
    message += ` with value ${expectedValue}`
  }
  message += `, got ${receivedType} `
  // check if we need to specify received value
  if (isExplicable(receivedType)) {
    message += `with value ${receivedValue}.`
  }
  return message
}

function styleValue(value: unknown, type: string): string {
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}

function isExplicable(type: string): boolean {
  const explicitTypes = ['string', 'number', 'boolean']
  return explicitTypes.some(elem => type.toLowerCase() === elem)
}

function isBoolean(...args: string[]): boolean {
  return args.some(elem => elem.toLowerCase() === 'boolean')
}
