import {
  createStructuralDirectiveTransform,
  ForNode,
  processForNode,
  createCallExpression,
  createFunctionExpression,
  createForLoopParams,
  createBlockStatement,
  NodeTypes
} from '@vue/compiler-dom'
import {
  SSRTransformContext,
  createChildContext,
  processChildren
} from '../ssrCodegenTransform'
import { SSR_RENDER_LIST } from '../runtimeHelpers'

// Plugin for the first transform pass, which simply constructs the AST node
export const ssrTransformFor = createStructuralDirectiveTransform(
  'for',
  processForNode
)

// This is called during the 2nd transform pass to construct the SSR-sepcific
// codegen nodes.
export function processFor(node: ForNode, context: SSRTransformContext) {
  const childContext = createChildContext(context)
  const needFragmentWrapper =
    node.children.length !== 1 || node.children[0].type !== NodeTypes.ELEMENT
  if (needFragmentWrapper) {
    childContext.pushStringPart(`<!---->`)
  }
  processChildren(node.children, childContext)
  if (needFragmentWrapper) {
    childContext.pushStringPart(`<!---->`)
  }
  const renderLoop = createFunctionExpression(
    createForLoopParams(node.parseResult)
  )
  renderLoop.body = createBlockStatement(childContext.body)

  // v-for always renders a fragment
  context.pushStringPart(`<!---->`)
  context.pushStatement(
    createCallExpression(context.helper(SSR_RENDER_LIST), [
      node.source,
      renderLoop
    ])
  )
  context.pushStringPart(`<!---->`)
}
