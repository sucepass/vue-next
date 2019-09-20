import { createDirectiveTransform } from '../transform'
import { NodeTypes, ExpressionNode } from '../ast'
import { createCompilerError, ErrorCodes } from '../errors'
import { getInnerRange } from '../utils'

const forAliasRE = /([\s\S]*?)(?:(?<=\))|\s+)(?:in|of)\s+([\s\S]*)/
const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/
const stripParensRE = /^\(|\)$/g

export const transformFor = createDirectiveTransform(
  'for',
  (node, dir, context) => {
    if (dir.exp) {
      const aliases = parseAliasExpressions(dir.exp.content)

      if (aliases) {
        context.replaceNode({
          type: NodeTypes.FOR,
          loc: node.loc,
          source: maybeCreateExpression(
            aliases.source,
            dir.exp
          ) as ExpressionNode,
          valueAlias: maybeCreateExpression(aliases.value, dir.exp),
          keyAlias: maybeCreateExpression(aliases.key, dir.exp),
          objectIndexAlias: maybeCreateExpression(aliases.index, dir.exp),
          children: [node]
        })
      } else {
        context.onError(
          createCompilerError(
            ErrorCodes.X_FOR_MALFORMED_EXPRESSION,
            dir.loc.start
          )
        )
      }
    } else {
      context.onError(
        createCompilerError(ErrorCodes.X_FOR_NO_EXPRESSION, dir.loc.start)
      )
    }
  }
)

interface AliasExpression {
  offset: number
  content: string
}

interface AliasExpressions {
  source: AliasExpression
  value: AliasExpression | undefined
  key: AliasExpression | undefined
  index: AliasExpression | undefined
}

function parseAliasExpressions(source: string): AliasExpressions | null {
  const inMatch = source.match(forAliasRE)
  if (!inMatch) return null

  const [, LHS, RHS] = inMatch
  const result: AliasExpressions = {
    source: {
      offset: source.indexOf(RHS, LHS.length),
      content: RHS.trim()
    },
    value: undefined,
    key: undefined,
    index: undefined
  }

  let valueContent = LHS.trim()
    .replace(stripParensRE, '')
    .trim()
  const trimmedOffset = LHS.indexOf(valueContent)

  const iteratorMatch = valueContent.match(forIteratorRE)
  if (iteratorMatch) {
    valueContent = valueContent.replace(forIteratorRE, '').trim()

    const keyContent = iteratorMatch[1].trim()
    if (keyContent) {
      result.key = {
        offset: source.indexOf(keyContent, trimmedOffset + valueContent.length),
        content: keyContent
      }
    }

    if (iteratorMatch[2]) {
      const indexContent = iteratorMatch[2].trim()

      if (indexContent) {
        result.index = {
          offset: source.indexOf(
            indexContent,
            result.key
              ? result.key.offset + result.key.content.length
              : trimmedOffset + valueContent.length
          ),
          content: indexContent
        }
      }
    }
  }

  if (valueContent) {
    result.value = {
      offset: trimmedOffset,
      content: valueContent
    }
  }

  return result
}

function maybeCreateExpression(
  alias: AliasExpression | undefined,
  node: ExpressionNode
): ExpressionNode | undefined {
  if (alias) {
    return {
      type: NodeTypes.EXPRESSION,
      loc: getInnerRange(node.loc, alias.offset, alias.content.length),
      content: alias.content,
      isStatic: false
    }
  }
}
