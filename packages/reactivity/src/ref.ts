import { track, trigger } from './effect'
import { TrackOpTypes, TriggerOpTypes } from './operations'
import { isObject } from '@vue/shared'
import { reactive, isReactive } from './reactive'
import { ComputedRef } from './computed'
import { CollectionTypes } from './collectionHandlers'

const isRefSymbol = Symbol()

export interface Ref<T = any> {
  // This field is necessary to allow TS to differentiate a Ref from a plain
  // object that happens to have a "value" field.
  // However, checking a symbol on an arbitrary object is much slower than
  // checking a plain property, so we use a _isRef plain property for isRef()
  // check in the actual implementation.
  // The reason for not just declaring _isRef in the interface is because we
  // don't want this internal field to leak into userland autocompletion -
  // a private symbol, on the other hand, achieves just that.
  [isRefSymbol]: true
  value: UnwrapRef<T>
}

const convert = <T extends unknown>(val: T): T =>
  isObject(val) ? reactive(val) : val

export function isRef(r: any): r is Ref {
  return r ? r._isRef === true : false
}

export function ref<T extends Ref>(raw: T): T
export function ref<T>(raw: T): Ref<T>
export function ref<T = any>(): Ref<T>
export function ref(raw?: unknown) {
  if (isRef(raw)) {
    return raw
  }
  raw = convert(raw)
  const r = {
    _isRef: true,
    get value() {
      track(r, TrackOpTypes.GET, 'value')
      return raw
    },
    set value(newVal) {
      raw = convert(newVal)
      trigger(
        r,
        TriggerOpTypes.SET,
        'value',
        __DEV__ ? { newValue: newVal } : void 0
      )
    }
  }
  return r
}

export function toRefs<T extends object>(
  object: T
): { [K in keyof T]: Ref<T[K]> } {
  if (__DEV__ && !isReactive(object)) {
    console.warn(`toRefs() expects a reactive object but received a plain one.`)
  }
  const ret: any = {}
  for (const key in object) {
    ret[key] = toProxyRef(object, key)
  }
  return ret
}

function toProxyRef<T extends object, K extends keyof T>(
  object: T,
  key: K
): Ref<T[K]> {
  return {
    _isRef: true,
    get value(): any {
      return object[key]
    },
    set value(newVal) {
      object[key] = newVal
    }
  } as any
}

type UnwrapArray<T> = { [P in keyof T]: UnwrapRef<T[P]> }

type UnwrapProp<T> = T extends ComputedRef<infer V>
  ? UnwrapRef<V>
  : T extends Ref<infer V>
    ? UnwrapRef<V>
    : T extends Function | CollectionTypes
      ? T
      : T extends object
        ? UnwrapObject<T>
        : T extends Array<infer V> ? Array<UnwrapRef<V>> & UnwrapArray<T> : T

type UnwrapObject<T> = { [K in keyof T]: UnwrapProp<T[K]> }

export type UnwrapRef<T> = T extends object
  ? UnwrapObject<T>
  : T extends Function | CollectionTypes
    ? T
    : T extends Array<infer V> ? Array<UnwrapRef<V>> & UnwrapArray<T> : T
