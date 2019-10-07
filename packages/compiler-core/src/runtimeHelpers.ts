export const FRAGMENT = Symbol(__DEV__ ? `Fragment` : ``)
export const PORTAL = Symbol(__DEV__ ? `Portal` : ``)
export const COMMENT = Symbol(__DEV__ ? `Comment` : ``)
export const TEXT = Symbol(__DEV__ ? `Text` : ``)
export const SUSPENSE = Symbol(__DEV__ ? `Suspense` : ``)
export const EMPTY = Symbol(__DEV__ ? `Empty` : ``)
export const OPEN_BLOCK = Symbol(__DEV__ ? `openBlock` : ``)
export const CREATE_BLOCK = Symbol(__DEV__ ? `createBlock` : ``)
export const CREATE_VNODE = Symbol(__DEV__ ? `createVNode` : ``)
export const RESOLVE_COMPONENT = Symbol(__DEV__ ? `resolveComponent` : ``)
export const RESOLVE_DIRECTIVE = Symbol(__DEV__ ? `resolveDirective` : ``)
export const APPLY_DIRECTIVES = Symbol(__DEV__ ? `applyDirectives` : ``)
export const RENDER_LIST = Symbol(__DEV__ ? `renderList` : ``)
export const RENDER_SLOT = Symbol(__DEV__ ? `renderSlot` : ``)
export const CREATE_SLOTS = Symbol(__DEV__ ? `createSlots` : ``)
export const TO_STRING = Symbol(__DEV__ ? `toString` : ``)
export const MERGE_PROPS = Symbol(__DEV__ ? `mergeProps` : ``)
export const TO_HANDLERS = Symbol(__DEV__ ? `toHandlers` : ``)
export const CAMELIZE = Symbol(__DEV__ ? `camelize` : ``)

export type RuntimeHelper =
  | typeof FRAGMENT
  | typeof PORTAL
  | typeof COMMENT
  | typeof TEXT
  | typeof SUSPENSE
  | typeof EMPTY
  | typeof OPEN_BLOCK
  | typeof CREATE_BLOCK
  | typeof CREATE_VNODE
  | typeof RESOLVE_COMPONENT
  | typeof RESOLVE_DIRECTIVE
  | typeof APPLY_DIRECTIVES
  | typeof RENDER_LIST
  | typeof RENDER_SLOT
  | typeof CREATE_SLOTS
  | typeof TO_STRING
  | typeof MERGE_PROPS
  | typeof TO_HANDLERS
  | typeof CAMELIZE

// Name mapping for runtime helpers that need to be imported from 'vue' in
// generated code. Make sure these are correctly exported in the runtime!
export const helperNameMap = {
  [FRAGMENT]: `Fragment`,
  [PORTAL]: `Portal`,
  [COMMENT]: `Comment`,
  [TEXT]: `Text`,
  [SUSPENSE]: `Suspense`,
  [EMPTY]: `Empty`,
  [OPEN_BLOCK]: `openBlock`,
  [CREATE_BLOCK]: `createBlock`,
  [CREATE_VNODE]: `createVNode`,
  [RESOLVE_COMPONENT]: `resolveComponent`,
  [RESOLVE_DIRECTIVE]: `resolveDirective`,
  [APPLY_DIRECTIVES]: `applyDirectives`,
  [RENDER_LIST]: `renderList`,
  [RENDER_SLOT]: `renderSlot`,
  [CREATE_SLOTS]: `createSlots`,
  [TO_STRING]: `toString`,
  [MERGE_PROPS]: `mergeProps`,
  [TO_HANDLERS]: `toHandlers`,
  [CAMELIZE]: `camelize`
}
