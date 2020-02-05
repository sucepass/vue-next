import {
  baseCompile,
  baseParse,
  CompilerOptions,
  CodegenResult,
  isBuiltInType,
  ParserOptions,
  RootNode,
  noopDirectiveTransform
} from '@vue/compiler-core'
import { parserOptionsMinimal } from './parserOptionsMinimal'
import { parserOptionsStandard } from './parserOptionsStandard'
import { transformStyle } from './transforms/transformStyle'
import { transformVHtml } from './transforms/vHtml'
import { transformVText } from './transforms/vText'
import { transformModel } from './transforms/vModel'
import { transformOn } from './transforms/vOn'
import { transformShow } from './transforms/vShow'
import { TRANSITION, TRANSITION_GROUP } from './runtimeHelpers'

export const parserOptions = __BROWSER__
  ? parserOptionsMinimal
  : parserOptionsStandard

export function compile(
  template: string,
  options: CompilerOptions = {}
): CodegenResult {
  return baseCompile(template, {
    ...parserOptions,
    ...options,
    nodeTransforms: [transformStyle, ...(options.nodeTransforms || [])],
    directiveTransforms: {
      cloak: noopDirectiveTransform,
      html: transformVHtml,
      text: transformVText,
      model: transformModel, // override compiler-core
      on: transformOn,
      show: transformShow,
      ...(options.directiveTransforms || {})
    },
    isBuiltInComponent: tag => {
      if (isBuiltInType(tag, `Transition`)) {
        return TRANSITION
      } else if (isBuiltInType(tag, `TransitionGroup`)) {
        return TRANSITION_GROUP
      }
    }
  })
}

export function parse(template: string, options: ParserOptions = {}): RootNode {
  return baseParse(template, {
    ...parserOptions,
    ...options
  })
}

export { transformStyle } from './transforms/transformStyle'
export { createDOMCompilerError, DOMErrorCodes } from './errors'
export * from '@vue/compiler-core'
