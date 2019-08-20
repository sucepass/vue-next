export {
  ref,
  isRef,
  toRefs,
  reactive,
  isReactive,
  immutable,
  isImmutable,
  toRaw,
  markImmutable,
  markNonReactive,
  effect,
  // types
  ReactiveEffect,
  ReactiveEffectOptions,
  DebuggerEvent,
  OperationTypes,
  Ref,
  ComputedRef,
  UnwrapRef
} from '@vue/reactivity'

import {
  computed as _computed,
  ComputedRef,
  ComputedOptions,
  ReactiveEffect
} from '@vue/reactivity'

import { currentInstance } from './component'

// record effects created during a component's setup() so that they can be
// stopped when the component unmounts
export function recordEffect(effect: ReactiveEffect) {
  if (currentInstance) {
    ;(currentInstance.effects || (currentInstance.effects = [])).push(effect)
  }
}

export function computed<T>(
  getterOrOptions: (() => T) | ComputedOptions<T>
): ComputedRef<T> {
  const c = _computed(getterOrOptions)
  recordEffect(c.effect)
  return c
}
