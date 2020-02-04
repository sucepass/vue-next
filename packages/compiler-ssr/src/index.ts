import {
  CodegenResult,
  baseParse,
  parserOptions,
  transform,
  generate,
  CompilerOptions,
  transformExpression,
  trackVForSlotScopes,
  trackSlotScopes,
  noopDirectiveTransform,
  transformBind,
  transformStyle
} from '@vue/compiler-dom'
import { ssrCodegenTransform } from './ssrCodegenTransform'
import { ssrTransformElement } from './transforms/ssrTransformElement'
import { ssrTransformComponent } from './transforms/ssrTransformComponent'
import { ssrTransformSlotOutlet } from './transforms/ssrTransformSlotOutlet'
import { ssrTransformIf } from './transforms/ssrVIf'
import { ssrTransformFor } from './transforms/ssrVFor'
import { ssrTransformModel } from './transforms/ssrVModel'
import { ssrTransformShow } from './transforms/ssrVShow'

export function compile(
  template: string,
  options: CompilerOptions = {}
): CodegenResult {
  options = {
    ...options,
    // apply DOM-specific parsing options
    ...parserOptions,
    ssr: true,
    // always prefix since compiler-ssr doesn't have size concern
    prefixIdentifiers: true,
    // disalbe optimizations that are unnecessary for ssr
    cacheHandlers: false,
    hoistStatic: false
  }

  const ast = baseParse(template, options)

  transform(ast, {
    ...options,
    nodeTransforms: [
      ssrTransformIf,
      ssrTransformFor,
      trackVForSlotScopes,
      transformExpression,
      ssrTransformSlotOutlet,
      ssrTransformElement,
      ssrTransformComponent,
      trackSlotScopes,
      transformStyle,
      ...(options.nodeTransforms || []) // user transforms
    ],
    directiveTransforms: {
      // reusing core v-bind
      bind: transformBind,
      // model and show has dedicated SSR handling
      model: ssrTransformModel,
      show: ssrTransformShow,
      // the following are ignored during SSR
      on: noopDirectiveTransform,
      cloak: noopDirectiveTransform,
      once: noopDirectiveTransform,
      ...(options.directiveTransforms || {}) // user transforms
    }
  })

  // traverse the template AST and convert into SSR codegen AST
  // by replacing ast.codegenNode.
  ssrCodegenTransform(ast, options)

  return generate(ast, options)
}
