import {
  RootNode,
  BlockStatement,
  TemplateLiteral,
  createCallExpression,
  createTemplateLiteral,
  NodeTypes,
  TemplateChildNode,
  ElementTypes,
  createBlockStatement,
  CompilerOptions,
  isText,
  IfStatement,
  CallExpression
} from '@vue/compiler-dom'
import { isString, escapeHtml, NO } from '@vue/shared'
import { SSR_INTERPOLATE, ssrHelpers } from './runtimeHelpers'
import { processIf } from './transforms/ssrVIf'
import { processFor } from './transforms/ssrVFor'

// Because SSR codegen output is completely different from client-side output
// (e.g. multiple elements can be concatenated into a single template literal
// instead of each getting a corresponding call), we need to apply an extra
// transform pass to convert the template AST into a fresh JS AST before
// passing it to codegen.

export function ssrCodegenTransform(ast: RootNode, options: CompilerOptions) {
  const context = createSSRTransformContext(options)

  const isFragment =
    ast.children.length > 1 && !ast.children.every(c => isText(c))
  if (isFragment) {
    context.pushStringPart(`<!---->`)
  }
  processChildren(ast.children, context)
  if (isFragment) {
    context.pushStringPart(`<!---->`)
  }

  ast.codegenNode = createBlockStatement(context.body)

  // Finalize helpers.
  // We need to separate helpers imported from 'vue' vs. '@vue/server-renderer'
  ast.ssrHelpers = [
    ...ast.helpers.filter(h => h in ssrHelpers),
    ...context.helpers
  ]
  ast.helpers = ast.helpers.filter(h => !(h in ssrHelpers))
}

export type SSRTransformContext = ReturnType<typeof createSSRTransformContext>

function createSSRTransformContext(
  options: CompilerOptions,
  helpers: Set<symbol> = new Set()
) {
  const body: BlockStatement['body'] = []
  let currentString: TemplateLiteral | null = null

  return {
    options,
    body,
    helpers,
    helper<T extends symbol>(name: T): T {
      helpers.add(name)
      return name
    },
    pushStringPart(part: TemplateLiteral['elements'][0]) {
      if (!currentString) {
        const currentCall = createCallExpression(`_push`)
        body.push(currentCall)
        currentString = createTemplateLiteral([])
        currentCall.arguments.push(currentString)
      }
      const bufferedElements = currentString.elements
      const lastItem = bufferedElements[bufferedElements.length - 1]
      if (isString(part) && isString(lastItem)) {
        bufferedElements[bufferedElements.length - 1] += part
      } else {
        bufferedElements.push(part)
      }
    },
    pushStatement(statement: IfStatement | CallExpression) {
      // close current string
      currentString = null
      body.push(statement)
    }
  }
}

export function createChildContext(
  parent: SSRTransformContext
): SSRTransformContext {
  // ensure child inherits parent helpers
  return createSSRTransformContext(parent.options, parent.helpers)
}

export function processChildren(
  children: TemplateChildNode[],
  context: SSRTransformContext
) {
  const isVoidTag = context.options.isVoidTag || NO
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (child.type === NodeTypes.ELEMENT) {
      if (child.tagType === ElementTypes.ELEMENT) {
        const elementsToAdd = child.ssrCodegenNode!.elements
        for (let j = 0; j < elementsToAdd.length; j++) {
          context.pushStringPart(elementsToAdd[j])
        }
        if (child.children.length) {
          processChildren(child.children, context)
        }

        if (!isVoidTag(child.tag)) {
          // push closing tag
          context.pushStringPart(`</${child.tag}>`)
        }
      } else if (child.tagType === ElementTypes.COMPONENT) {
        // TODO
      } else if (child.tagType === ElementTypes.SLOT) {
        // TODO
      }
    } else if (child.type === NodeTypes.TEXT) {
      context.pushStringPart(escapeHtml(child.content))
    } else if (child.type === NodeTypes.INTERPOLATION) {
      context.pushStringPart(
        createCallExpression(context.helper(SSR_INTERPOLATE), [child.content])
      )
    } else if (child.type === NodeTypes.IF) {
      processIf(child, context)
    } else if (child.type === NodeTypes.FOR) {
      processFor(child, context)
    }
  }
}
