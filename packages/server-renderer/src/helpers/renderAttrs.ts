import { escapeHtml } from '@vue/shared'
import {
  normalizeClass,
  normalizeStyle,
  propsToAttrMap,
  hyphenate,
  isString,
  isNoUnitNumericStyleProp,
  isOn,
  isSSRSafeAttrName,
  isBooleanAttr,
  makeMap
} from '@vue/shared'

const shouldIgnoreProp = makeMap(`key,ref,innerHTML,textContent`)

export function renderAttrs(
  props: Record<string, unknown>,
  tag?: string
): string {
  let ret = ''
  for (const key in props) {
    if (
      shouldIgnoreProp(key) ||
      isOn(key) ||
      (tag === 'textarea' && key === 'value')
    ) {
      continue
    }
    const value = props[key]
    if (key === 'class') {
      ret += ` class="${renderClass(value)}"`
    } else if (key === 'style') {
      ret += ` style="${renderStyle(value)}"`
    } else {
      ret += renderDynamicAttr(key, value, tag)
    }
  }
  return ret
}

// render an attr with dynamic (unknown) key.
export function renderDynamicAttr(
  key: string,
  value: unknown,
  tag?: string
): string {
  if (!isRenderableValue(value)) {
    return ``
  }
  const attrKey =
    tag && tag.indexOf('-') > 0
      ? key // preserve raw name on custom elements
      : propsToAttrMap[key] || key.toLowerCase()
  if (isBooleanAttr(attrKey)) {
    return value === false ? `` : ` ${attrKey}`
  } else if (isSSRSafeAttrName(attrKey)) {
    return ` ${attrKey}="${escapeHtml(value)}"`
  } else {
    return ``
  }
}

// Render a v-bind attr with static key. The key is pre-processed at compile
// time and we only need to check and escape value.
export function renderAttr(key: string, value: unknown): string {
  if (!isRenderableValue(value)) {
    return ``
  }
  return ` ${key}="${escapeHtml(value)}"`
}

function isRenderableValue(value: unknown): boolean {
  if (value == null) {
    return false
  }
  const type = typeof value
  return type === 'string' || type === 'number' || type === 'boolean'
}

export function renderClass(raw: unknown): string {
  return escapeHtml(normalizeClass(raw))
}

export function renderStyle(raw: unknown): string {
  if (!raw) {
    return ''
  }
  if (isString(raw)) {
    return escapeHtml(raw)
  }
  const styles = normalizeStyle(raw)
  let ret = ''
  for (const key in styles) {
    const value = styles[key]
    const normalizedKey = key.indexOf(`--`) === 0 ? key : hyphenate(key)
    if (
      isString(value) ||
      (typeof value === 'number' && isNoUnitNumericStyleProp(normalizedKey))
    ) {
      // only render valid values
      ret += `${normalizedKey}:${value};`
    }
  }
  return escapeHtml(ret)
}
