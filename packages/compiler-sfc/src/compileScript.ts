import MagicString from 'magic-string'
import { BindingMetadata, BindingTypes } from '@vue/compiler-core'
import { SFCDescriptor, SFCScriptBlock } from './parse'
import { parse as _parse, ParserOptions, ParserPlugin } from '@babel/parser'
import { babelParserDefaultPlugins, generateCodeFrame } from '@vue/shared'
import {
  Node,
  Declaration,
  ObjectPattern,
  ObjectExpression,
  ArrayPattern,
  Identifier,
  ExportSpecifier,
  Function as FunctionNode,
  TSType,
  TSTypeLiteral,
  TSFunctionType,
  ObjectProperty,
  ArrayExpression,
  Statement,
  Expression,
  LabeledStatement,
  TSUnionType
} from '@babel/types'
import { walk } from 'estree-walker'
import { RawSourceMap } from 'source-map'
import { genCssVarsCode, injectCssVarsCalls } from './genCssVars'
import { compileTemplate, SFCTemplateCompileOptions } from './compileTemplate'

const DEFINE_OPTIONS = 'defineOptions'

export interface SFCScriptCompileOptions {
  /**
   * https://babeljs.io/docs/en/babel-parser#plugins
   */
  babelParserPlugins?: ParserPlugin[]
  /**
   * Enable ref: label sugar
   * https://github.com/vuejs/rfcs/pull/228
   * @default true
   */
  refSugar?: boolean
  /**
   * Compile the template and inline the resulting render function
   * directly inside setup().
   * - Only affects <script setup>
   * - This should only be used in production because it prevents the template
   * from being hot-reloaded separately from component state.
   */
  inlineTemplate?: boolean
  templateOptions?: SFCTemplateCompileOptions
}

const hasWarned: Record<string, boolean> = {}

function warnOnce(msg: string) {
  if (!hasWarned[msg]) {
    hasWarned[msg] = true
    console.log(`\x1b[33m[@vue/compiler-sfc] %s\x1b[0m\n`, msg)
  }
}

/**
 * Compile `<script setup>`
 * It requires the whole SFC descriptor because we need to handle and merge
 * normal `<script>` + `<script setup>` if both are present.
 */
export function compileScript(
  sfc: SFCDescriptor,
  options: SFCScriptCompileOptions = {}
): SFCScriptBlock {
  const { script, scriptSetup, styles, source, filename } = sfc

  if (__DEV__ && !__TEST__ && scriptSetup) {
    warnOnce(
      `<script setup> is still an experimental proposal.\n` +
        `Follow its status at https://github.com/vuejs/rfcs/pull/227.`
    )
  }

  const hasCssVars = styles.some(s => typeof s.attrs.vars === 'string')

  const scriptLang = script && script.lang
  const scriptSetupLang = scriptSetup && scriptSetup.lang
  const isTS = scriptLang === 'ts' || scriptSetupLang === 'ts'
  const plugins: ParserPlugin[] = [...babelParserDefaultPlugins, 'jsx']
  if (options.babelParserPlugins) plugins.push(...options.babelParserPlugins)
  if (isTS) plugins.push('typescript', 'decorators-legacy')

  if (!scriptSetup) {
    if (!script) {
      throw new Error(`[@vue/compiler-sfc] SFC contains no <script> tags.`)
    }
    if (scriptLang && scriptLang !== 'ts') {
      // do not process non js/ts script blocks
      return script
    }
    try {
      const scriptAst = _parse(script.content, {
        plugins,
        sourceType: 'module'
      }).program.body
      return {
        ...script,
        content: hasCssVars ? injectCssVarsCalls(sfc, plugins) : script.content,
        bindings: analyzeScriptBindings(scriptAst),
        scriptAst
      }
    } catch (e) {
      // silently fallback if parse fails since user may be using custom
      // babel syntax
      return script
    }
  }

  if (script && scriptLang !== scriptSetupLang) {
    throw new Error(
      `[@vue/compiler-sfc] <script> and <script setup> must have the same language type.`
    )
  }

  if (scriptSetupLang && scriptSetupLang !== 'ts') {
    // do not process non js/ts script blocks
    return scriptSetup
  }

  const defaultTempVar = `__default__`
  const bindingMetadata: BindingMetadata = {}
  const helperImports: Set<string> = new Set()
  const userImports: Record<
    string,
    {
      imported: string | null
      source: string
    }
  > = Object.create(null)
  const setupBindings: Record<
    string,
    BindingTypes.SETUP | BindingTypes.CONST
  > = Object.create(null)
  const refBindings: Record<string, BindingTypes.SETUP> = Object.create(null)
  const refIdentifiers: Set<Identifier> = new Set()
  const enableRefSugar = options.refSugar !== false
  let defaultExport: Node | undefined
  let hasOptionsCall = false
  let optionsExp: string | undefined
  let optionsArg: ObjectExpression | undefined
  let optionsType: TSTypeLiteral | undefined
  let hasAwait = false
  // context types to generate
  let propsType = `{}`
  let emitType = `(e: string, ...args: any[]) => void`
  let slotsType = `Slots`
  let attrsType = `Record<string, any>`
  // props/emits declared via types
  const typeDeclaredProps: Record<string, PropTypeData> = {}
  const typeDeclaredEmits: Set<string> = new Set()
  // record declared types for runtime props type generation
  const declaredTypes: Record<string, string[]> = {}

  // magic-string state
  const s = new MagicString(source)
  const startOffset = scriptSetup.loc.start.offset
  const endOffset = scriptSetup.loc.end.offset
  const scriptStartOffset = script && script.loc.start.offset
  const scriptEndOffset = script && script.loc.end.offset

  function parse(
    input: string,
    options: ParserOptions,
    offset: number
  ): Statement[] {
    try {
      return _parse(input, options).program.body
    } catch (e) {
      e.message = `[@vue/compiler-sfc] ${e.message}\n\n${generateCodeFrame(
        source,
        e.pos + offset,
        e.pos + offset + 1
      )}`
      throw e
    }
  }

  function error(
    msg: string,
    node: Node,
    end: number = node.end! + startOffset
  ) {
    throw new Error(
      `[@vue/compiler-sfc] ${msg}\n\n` +
        generateCodeFrame(source, node.start! + startOffset, end)
    )
  }

  function processDefineOptions(node: Node): boolean {
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === DEFINE_OPTIONS
    ) {
      if (hasOptionsCall) {
        error(`duplicate ${DEFINE_OPTIONS}() call`, node)
      }
      hasOptionsCall = true
      const optsArg = node.arguments[0]
      if (optsArg) {
        if (optsArg.type === 'ObjectExpression') {
          optionsArg = optsArg
        } else {
          error(
            `${DEFINE_OPTIONS}() argument must be an object literal.`,
            optsArg
          )
        }
      }
      // context call has type parameters - infer runtime types from it
      if (node.typeParameters) {
        if (optionsArg) {
          error(
            `${DEFINE_OPTIONS}() cannot accept both type and non-type arguments ` +
              `at the same time. Use one or the other.`,
            node
          )
        }
        const typeArg = node.typeParameters.params[0]
        if (typeArg.type === 'TSTypeLiteral') {
          optionsType = typeArg
        } else {
          error(
            `type argument passed to ${DEFINE_OPTIONS}() must be a literal type.`,
            typeArg
          )
        }
      }
      return true
    }
    return false
  }

  function processRefExpression(exp: Expression, statement: LabeledStatement) {
    if (exp.type === 'AssignmentExpression') {
      helperImports.add('ref')
      const { left, right } = exp
      if (left.type === 'Identifier') {
        registerRefBinding(left)
        s.prependRight(right.start! + startOffset, `ref(`)
        s.appendLeft(right.end! + startOffset, ')')
      } else if (left.type === 'ObjectPattern') {
        // remove wrapping parens
        for (let i = left.start!; i > 0; i--) {
          const char = source[i + startOffset]
          if (char === '(') {
            s.remove(i + startOffset, i + startOffset + 1)
            break
          }
        }
        for (let i = left.end!; i > 0; i++) {
          const char = source[i + startOffset]
          if (char === ')') {
            s.remove(i + startOffset, i + startOffset + 1)
            break
          }
        }
        processRefObjectPattern(left, statement)
      } else if (left.type === 'ArrayPattern') {
        processRefArrayPattern(left, statement)
      }
    } else if (exp.type === 'SequenceExpression') {
      // possible multiple declarations
      // ref: x = 1, y = 2
      exp.expressions.forEach(e => processRefExpression(e, statement))
    } else if (exp.type === 'Identifier') {
      registerRefBinding(exp)
      s.appendLeft(exp.end! + startOffset, ` = ref()`)
    } else {
      error(`ref: statements can only contain assignment expressions.`, exp)
    }
  }

  function registerRefBinding(id: Identifier) {
    if (id.name[0] === '$') {
      error(`ref variable identifiers cannot start with $.`, id)
    }
    refBindings[id.name] = setupBindings[id.name] = BindingTypes.SETUP
    refIdentifiers.add(id)
  }

  function processRefObjectPattern(
    pattern: ObjectPattern,
    statement: LabeledStatement
  ) {
    for (const p of pattern.properties) {
      let nameId: Identifier | undefined
      if (p.type === 'ObjectProperty') {
        if (p.key.start! === p.value.start!) {
          // shorthand { foo } --> { foo: __foo }
          nameId = p.key as Identifier
          s.appendLeft(nameId.end! + startOffset, `: __${nameId.name}`)
          if (p.value.type === 'AssignmentPattern') {
            // { foo = 1 }
            refIdentifiers.add(p.value.left as Identifier)
          }
        } else {
          if (p.value.type === 'Identifier') {
            // { foo: bar } --> { foo: __bar }
            nameId = p.value
            s.prependRight(nameId.start! + startOffset, `__`)
          } else if (p.value.type === 'ObjectPattern') {
            processRefObjectPattern(p.value, statement)
          } else if (p.value.type === 'ArrayPattern') {
            processRefArrayPattern(p.value, statement)
          } else if (p.value.type === 'AssignmentPattern') {
            // { foo: bar = 1 } --> { foo: __bar = 1 }
            nameId = p.value.left as Identifier
            s.prependRight(nameId.start! + startOffset, `__`)
          }
        }
      } else {
        // rest element { ...foo } --> { ...__foo }
        nameId = p.argument as Identifier
        s.prependRight(nameId.start! + startOffset, `__`)
      }
      if (nameId) {
        registerRefBinding(nameId)
        // append binding declarations after the parent statement
        s.appendLeft(
          statement.end! + startOffset,
          `\nconst ${nameId.name} = ref(__${nameId.name});`
        )
      }
    }
  }

  function processRefArrayPattern(
    pattern: ArrayPattern,
    statement: LabeledStatement
  ) {
    for (const e of pattern.elements) {
      if (!e) continue
      let nameId: Identifier | undefined
      if (e.type === 'Identifier') {
        // [a] --> [__a]
        nameId = e
      } else if (e.type === 'AssignmentPattern') {
        // [a = 1] --> [__a = 1]
        nameId = e.left as Identifier
      } else if (e.type === 'RestElement') {
        // [...a] --> [...__a]
        nameId = e.argument as Identifier
      } else if (e.type === 'ObjectPattern') {
        processRefObjectPattern(e, statement)
      } else if (e.type === 'ArrayPattern') {
        processRefArrayPattern(e, statement)
      }
      if (nameId) {
        registerRefBinding(nameId)
        // prefix original
        s.prependRight(nameId.start! + startOffset, `__`)
        // append binding declarations after the parent statement
        s.appendLeft(
          statement.end! + startOffset,
          `\nconst ${nameId.name} = ref(__${nameId.name});`
        )
      }
    }
  }

  // 1. process normal <script> first if it exists
  let scriptAst
  if (script) {
    // import dedupe between <script> and <script setup>
    scriptAst = parse(
      script.content,
      {
        plugins,
        sourceType: 'module'
      },
      scriptStartOffset!
    )

    for (const node of scriptAst) {
      if (node.type === 'ImportDeclaration') {
        // record imports for dedupe
        for (const specifier of node.specifiers) {
          const name = specifier.local.name
          const imported =
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name
          userImports[name] = {
            imported: imported || null,
            source: node.source.value
          }
        }
      } else if (node.type === 'ExportDefaultDeclaration') {
        // export default
        defaultExport = node
        const start = node.start! + scriptStartOffset!
        s.overwrite(
          start,
          start + `export default`.length,
          `const ${defaultTempVar} =`
        )
      } else if (node.type === 'ExportNamedDeclaration' && node.specifiers) {
        const defaultSpecifier = node.specifiers.find(
          s => s.exported.type === 'Identifier' && s.exported.name === 'default'
        ) as ExportSpecifier
        if (defaultSpecifier) {
          defaultExport = node
          // 1. remove specifier
          if (node.specifiers.length > 1) {
            s.remove(
              defaultSpecifier.start! + scriptStartOffset!,
              defaultSpecifier.end! + scriptStartOffset!
            )
          } else {
            s.remove(
              node.start! + scriptStartOffset!,
              node.end! + scriptStartOffset!
            )
          }
          if (node.source) {
            // export { x as default } from './x'
            // rewrite to `import { x as __default__ } from './x'` and
            // add to top
            s.prepend(
              `import { ${
                defaultSpecifier.local.name
              } as ${defaultTempVar} } from '${node.source.value}'\n`
            )
          } else {
            // export { x as default }
            // rewrite to `const __default__ = x` and move to end
            s.append(
              `\nconst ${defaultTempVar} = ${defaultSpecifier.local.name}\n`
            )
          }
        }
      }
    }
  }

  // 2. parse <script setup> and  walk over top level statements
  const scriptSetupAst = parse(
    scriptSetup.content,
    {
      plugins: [
        ...plugins,
        // allow top level await but only inside <script setup>
        'topLevelAwait'
      ],
      sourceType: 'module'
    },
    startOffset
  )

  for (const node of scriptSetupAst) {
    const start = node.start! + startOffset
    let end = node.end! + startOffset
    // import or type declarations: move to top
    // locate comment
    if (node.trailingComments && node.trailingComments.length > 0) {
      const lastCommentNode =
        node.trailingComments[node.trailingComments.length - 1]
      end = lastCommentNode.end + startOffset
    }
    // locate the end of whitespace between this statement and the next
    while (end <= source.length) {
      if (!/\s/.test(source.charAt(end))) {
        break
      }
      end++
    }

    // process `ref: x` bindings (convert to refs)
    if (
      node.type === 'LabeledStatement' &&
      node.label.name === 'ref' &&
      node.body.type === 'ExpressionStatement'
    ) {
      if (enableRefSugar) {
        warnOnce(
          `ref: sugar is still an experimental proposal and is not ` +
            `guaranteed to be a part of <script setup>.\n` +
            `Follow its status at https://github.com/vuejs/rfcs/pull/228.`
        )
        s.overwrite(
          node.label.start! + startOffset,
          node.body.start! + startOffset,
          'const '
        )
        processRefExpression(node.body.expression, node)
      } else {
        // TODO if we end up shipping ref: sugar as an opt-in feature,
        // need to proxy the option in vite, vue-loader and rollup-plugin-vue.
        error(
          `ref: sugar needs to be explicitly enabled via vite or vue-loader options.`,
          node
        )
      }
    }

    if (node.type === 'ImportDeclaration') {
      // import declarations are moved to top
      s.move(start, end, 0)
      // dedupe imports
      let prev
      let removed = 0
      for (const specifier of node.specifiers) {
        const local = specifier.local.name
        const imported =
          specifier.type === 'ImportSpecifier' &&
          specifier.imported.type === 'Identifier' &&
          specifier.imported.name
        const source = node.source.value
        const existing = userImports[local]
        if (source === 'vue' && imported === DEFINE_OPTIONS) {
          removed++
          s.remove(
            prev ? prev.end! + startOffset : specifier.start! + startOffset,
            specifier.end! + startOffset
          )
        } else if (existing) {
          if (existing.source === source && existing.imported === imported) {
            // already imported in <script setup>, dedupe
            removed++
            s.remove(
              prev ? prev.end! + startOffset : specifier.start! + startOffset,
              specifier.end! + startOffset
            )
          } else {
            error(`different imports aliased to same local name.`, specifier)
          }
        } else {
          userImports[local] = {
            imported: imported || null,
            source: node.source.value
          }
        }
        prev = specifier
      }
      if (removed === node.specifiers.length) {
        s.remove(node.start! + startOffset, node.end! + startOffset)
      }
    }

    if (
      node.type === 'ExpressionStatement' &&
      processDefineOptions(node.expression)
    ) {
      s.remove(node.start! + startOffset, node.end! + startOffset)
    }

    if (node.type === 'VariableDeclaration' && !node.declare) {
      for (const decl of node.declarations) {
        if (decl.init && processDefineOptions(decl.init)) {
          optionsExp = scriptSetup.content.slice(decl.id.start!, decl.id.end!)
          if (node.declarations.length === 1) {
            s.remove(node.start! + startOffset, node.end! + startOffset)
          } else {
            s.remove(decl.start! + startOffset, decl.end! + startOffset)
          }
        }
      }
    }

    // walk decalrations to record declared bindings
    if (
      (node.type === 'VariableDeclaration' ||
        node.type === 'FunctionDeclaration' ||
        node.type === 'ClassDeclaration') &&
      !node.declare
    ) {
      walkDeclaration(node, setupBindings)
    }

    // Type declarations
    if (node.type === 'VariableDeclaration' && node.declare) {
      s.remove(start, end)
    }

    // move all type declarations to outer scope
    if (
      node.type.startsWith('TS') ||
      (node.type === 'ExportNamedDeclaration' && node.exportKind === 'type')
    ) {
      recordType(node, declaredTypes)
      s.move(start, end, 0)
    }

    // walk statements & named exports / variable declarations for top level
    // await
    if (
      (node.type === 'VariableDeclaration' && !node.declare) ||
      node.type.endsWith('Statement')
    ) {
      ;(walk as any)(node, {
        enter(node: Node) {
          if (isFunction(node)) {
            this.skip()
          }
          if (node.type === 'AwaitExpression') {
            hasAwait = true
          }
        }
      })
    }

    if (
      (node.type === 'ExportNamedDeclaration' && node.exportKind !== 'type') ||
      node.type === 'ExportAllDeclaration' ||
      node.type === 'ExportDefaultDeclaration'
    ) {
      error(
        `<script setup> cannot contain ES module exports. ` +
          `If you are using a previous version of <script setup>, please ` +
          `consult the updated RFC at https://github.com/vuejs/rfcs/pull/227.`,
        node
      )
    }
  }

  // 3. Do a full walk to rewrite identifiers referencing let exports with ref
  // value access
  if (enableRefSugar && Object.keys(refBindings).length) {
    for (const node of scriptSetupAst) {
      if (node.type !== 'ImportDeclaration') {
        walkIdentifiers(node, (id, parent) => {
          if (refBindings[id.name] && !refIdentifiers.has(id)) {
            if (isStaticProperty(parent) && parent.shorthand) {
              // let binding used in a property shorthand
              // { foo } -> { foo: foo.value }
              // skip for destructure patterns
              if (!(parent as any).inPattern) {
                s.appendLeft(id.end! + startOffset, `: ${id.name}.value`)
              }
            } else {
              s.appendLeft(id.end! + startOffset, '.value')
            }
          } else if (id.name[0] === '$' && refBindings[id.name.slice(1)]) {
            // $xxx raw ref access variables, remove the $ prefix
            s.remove(id.start! + startOffset, id.start! + startOffset + 1)
          }
        })
      }
    }
  }

  // 4. extract runtime props/emits code from setup context type
  if (optionsType) {
    for (const m of optionsType.members) {
      if (m.type === 'TSPropertySignature' && m.key.type === 'Identifier') {
        const typeNode = m.typeAnnotation!.typeAnnotation
        const typeString = scriptSetup.content.slice(
          typeNode.start!,
          typeNode.end!
        )
        const key = m.key.name
        if (key === 'props') {
          propsType = typeString
          if (typeNode.type === 'TSTypeLiteral') {
            extractRuntimeProps(typeNode, typeDeclaredProps, declaredTypes)
          } else {
            // TODO be able to trace references
            error(`props type must be an object literal type`, typeNode)
          }
        } else if (key === 'emit') {
          emitType = typeString
          if (
            typeNode.type === 'TSFunctionType' ||
            typeNode.type === 'TSUnionType'
          ) {
            extractRuntimeEmits(typeNode, typeDeclaredEmits)
          } else {
            // TODO be able to trace references
            error(`emit type must be a function type`, typeNode)
          }
        } else if (key === 'attrs') {
          attrsType = typeString
        } else if (key === 'slots') {
          slotsType = typeString
        } else {
          error(`invalid setup context property: "${key}"`, m.key)
        }
      }
    }
  }

  // 5. check useOptions args to make sure it doesn't reference setup scope
  // variables
  if (optionsArg) {
    walkIdentifiers(optionsArg, id => {
      if (setupBindings[id.name]) {
        error(
          `\`${DEFINE_OPTIONS}()\` in <script setup> cannot reference locally ` +
            `declared variables because it will be hoisted outside of the ` +
            `setup() function. If your component options requires initialization ` +
            `in the module scope, use a separate normal <script> to export ` +
            `the options instead.`,
          id
        )
      }
    })
  }

  // 6. remove non-script content
  if (script) {
    if (startOffset < scriptStartOffset!) {
      // <script setup> before <script>
      s.remove(0, startOffset)
      s.remove(endOffset, scriptStartOffset!)
      s.remove(scriptEndOffset!, source.length)
    } else {
      // <script> before <script setup>
      s.remove(0, scriptStartOffset!)
      s.remove(scriptEndOffset!, startOffset)
      s.remove(endOffset, source.length)
    }
  } else {
    // only <script setup>
    s.remove(0, startOffset)
    s.remove(endOffset, source.length)
  }

  // 7. finalize setup argument signature.
  let args = optionsExp ? `__props, ${optionsExp}` : ``
  if (optionsExp && optionsType) {
    if (slotsType === 'Slots') {
      helperImports.add('Slots')
    }
    args += `: {
  props: ${propsType},
  emit: ${emitType},
  slots: ${slotsType},
  attrs: ${attrsType}
}`
  }

  const allBindings: Record<string, any> = { ...setupBindings }
  for (const key in userImports) {
    allBindings[key] = true
  }

  // 8. inject `useCssVars` calls
  if (hasCssVars) {
    helperImports.add(`useCssVars`)
    for (const style of styles) {
      const vars = style.attrs.vars
      if (typeof vars === 'string') {
        s.prependRight(
          endOffset,
          `\n${genCssVarsCode(vars, !!style.scoped, allBindings)}`
        )
      }
    }
  }

  // 9. analyze binding metadata
  if (scriptAst) {
    Object.assign(bindingMetadata, analyzeScriptBindings(scriptAst))
  }
  if (optionsType) {
    for (const key in typeDeclaredProps) {
      bindingMetadata[key] = BindingTypes.PROPS
    }
  }
  if (optionsArg) {
    Object.assign(bindingMetadata, analyzeBindingsFromOptions(optionsArg))
  }
  for (const [key, { source }] of Object.entries(userImports)) {
    bindingMetadata[key] = source.endsWith('.vue')
      ? BindingTypes.CONST
      : BindingTypes.SETUP
  }
  for (const key in setupBindings) {
    bindingMetadata[key] = setupBindings[key]
  }

  // 10. generate return statement
  let returned
  if (options.inlineTemplate) {
    if (sfc.template) {
      // inline render function mode - we are going to compile the template and
      // inline it right here
      const { code, preamble, tips, errors } = compileTemplate({
        ...options.templateOptions,
        filename,
        source: sfc.template.content,
        compilerOptions: {
          inline: true,
          bindingMetadata
        }
        // TODO source map
      })
      if (tips.length) {
        tips.forEach(warnOnce)
      }
      const err = errors[0]
      if (typeof err === 'string') {
        throw new Error(err)
      } else if (err) {
        throw err
      }
      if (preamble) {
        s.prepend(preamble)
      }
      returned = code
    } else {
      returned = `() => {}`
    }
  } else {
    // return bindings from setup
    returned = `{ ${Object.keys(allBindings).join(', ')} }`
  }
  s.appendRight(endOffset, `\nreturn ${returned}\n}\n\n`)

  // 11. finalize default export
  // expose: [] makes <script setup> components "closed" by default.
  let runtimeOptions = `\n  expose: [],`
  if (optionsArg) {
    runtimeOptions += `\n  ${scriptSetup.content
      .slice(optionsArg.start! + 1, optionsArg.end! - 1)
      .trim()},`
  } else if (optionsType) {
    runtimeOptions +=
      genRuntimeProps(typeDeclaredProps) + genRuntimeEmits(typeDeclaredEmits)
  }
  if (isTS) {
    // for TS, make sure the exported type is still valid type with
    // correct props information
    helperImports.add(`defineComponent`)
    // we have to use object spread for types to be merged properly
    // user's TS setting should compile it down to proper targets
    const def = defaultExport ? `\n  ...${defaultTempVar},` : ``
    // wrap setup code with function.
    // export the content of <script setup> as a named export, `setup`.
    // this allows `import { setup } from '*.vue'` for testing purposes.
    s.prependLeft(
      startOffset,
      `\nexport default defineComponent({${def}${runtimeOptions}\n  ${
        hasAwait ? `async ` : ``
      }setup(${args}) {\n`
    )
    s.append(`})`)
  } else {
    if (defaultExport) {
      // can't rely on spread operator in non ts mode
      s.prependLeft(
        startOffset,
        `\n${hasAwait ? `async ` : ``}function setup(${args}) {\n`
      )
      s.append(
        `/*#__PURE__*/ Object.assign(${defaultTempVar}, {${runtimeOptions}\n  setup\n})\n` +
          `export default ${defaultTempVar}`
      )
    } else {
      s.prependLeft(
        startOffset,
        `\nexport default {${runtimeOptions}\n  ` +
          `${hasAwait ? `async ` : ``}setup(${args}) {\n`
      )
      s.append(`}`)
    }
  }

  // 12. finalize Vue helper imports
  // TODO account for cases where user imports a helper with the same name
  // from a non-vue source
  const helpers = [...helperImports].filter(i => !userImports[i])
  if (helpers.length) {
    s.prepend(`import { ${helpers.join(', ')} } from 'vue'\n`)
  }

  s.trim()
  return {
    ...scriptSetup,
    bindings: bindingMetadata,
    content: s.toString(),
    map: (s.generateMap({
      source: filename,
      hires: true,
      includeContent: true
    }) as unknown) as RawSourceMap,
    scriptAst,
    scriptSetupAst
  }
}

function walkDeclaration(
  node: Declaration,
  bindings: Record<string, BindingTypes>
) {
  if (node.type === 'VariableDeclaration') {
    const isConst = node.kind === 'const'
    // export const foo = ...
    for (const { id, init } of node.declarations) {
      const isUseOptionsCall = !!(
        isConst &&
        init &&
        init.type === 'CallExpression' &&
        init.callee.type === 'Identifier' &&
        init.callee.name === DEFINE_OPTIONS
      )
      if (id.type === 'Identifier') {
        bindings[id.name] =
          // if a declaration is a const literal, we can mark it so that
          // the generated render fn code doesn't need to unref() it
          isUseOptionsCall ||
          (isConst &&
          init!.type !== 'Identifier' && // const a = b
          init!.type !== 'CallExpression' && // const a = ref()
            init!.type !== 'MemberExpression') // const a = b.c
            ? BindingTypes.CONST
            : BindingTypes.SETUP
      } else if (id.type === 'ObjectPattern') {
        walkObjectPattern(id, bindings, isConst, isUseOptionsCall)
      } else if (id.type === 'ArrayPattern') {
        walkArrayPattern(id, bindings, isConst, isUseOptionsCall)
      }
    }
  } else if (
    node.type === 'FunctionDeclaration' ||
    node.type === 'ClassDeclaration'
  ) {
    // export function foo() {} / export class Foo {}
    // export declarations must be named.
    bindings[node.id!.name] = BindingTypes.CONST
  }
}

function walkObjectPattern(
  node: ObjectPattern,
  bindings: Record<string, BindingTypes>,
  isConst: boolean,
  isUseOptionsCall = false
) {
  for (const p of node.properties) {
    if (p.type === 'ObjectProperty') {
      // key can only be Identifier in ObjectPattern
      if (p.key.type === 'Identifier') {
        if (p.key === p.value) {
          // const { x } = ...
          bindings[p.key.name] = isUseOptionsCall
            ? BindingTypes.CONST
            : BindingTypes.SETUP
        } else {
          walkPattern(p.value, bindings, isConst, isUseOptionsCall)
        }
      }
    } else {
      // ...rest
      // argument can only be identifer when destructuring
      bindings[(p.argument as Identifier).name] = isConst
        ? BindingTypes.CONST
        : BindingTypes.SETUP
    }
  }
}

function walkArrayPattern(
  node: ArrayPattern,
  bindings: Record<string, BindingTypes>,
  isConst: boolean,
  isUseOptionsCall = false
) {
  for (const e of node.elements) {
    e && walkPattern(e, bindings, isConst, isUseOptionsCall)
  }
}

function walkPattern(
  node: Node,
  bindings: Record<string, BindingTypes>,
  isConst: boolean,
  isUseOptionsCall = false
) {
  if (node.type === 'Identifier') {
    bindings[node.name] = isUseOptionsCall
      ? BindingTypes.CONST
      : BindingTypes.SETUP
  } else if (node.type === 'RestElement') {
    // argument can only be identifer when destructuring
    bindings[(node.argument as Identifier).name] = isConst
      ? BindingTypes.CONST
      : BindingTypes.SETUP
  } else if (node.type === 'ObjectPattern') {
    walkObjectPattern(node, bindings, isConst)
  } else if (node.type === 'ArrayPattern') {
    walkArrayPattern(node, bindings, isConst)
  } else if (node.type === 'AssignmentPattern') {
    if (node.left.type === 'Identifier') {
      bindings[node.left.name] = isUseOptionsCall
        ? BindingTypes.CONST
        : BindingTypes.SETUP
    } else {
      walkPattern(node.left, bindings, isConst)
    }
  }
}

interface PropTypeData {
  key: string
  type: string[]
  required: boolean
}

function recordType(node: Node, declaredTypes: Record<string, string[]>) {
  if (node.type === 'TSInterfaceDeclaration') {
    declaredTypes[node.id.name] = [`Object`]
  } else if (node.type === 'TSTypeAliasDeclaration') {
    declaredTypes[node.id.name] = inferRuntimeType(
      node.typeAnnotation,
      declaredTypes
    )
  } else if (node.type === 'ExportNamedDeclaration' && node.declaration) {
    recordType(node.declaration, declaredTypes)
  }
}

function extractRuntimeProps(
  node: TSTypeLiteral,
  props: Record<string, PropTypeData>,
  declaredTypes: Record<string, string[]>
) {
  for (const m of node.members) {
    if (m.type === 'TSPropertySignature' && m.key.type === 'Identifier') {
      props[m.key.name] = {
        key: m.key.name,
        required: !m.optional,
        type:
          __DEV__ && m.typeAnnotation
            ? inferRuntimeType(m.typeAnnotation.typeAnnotation, declaredTypes)
            : [`null`]
      }
    }
  }
}

function inferRuntimeType(
  node: TSType,
  declaredTypes: Record<string, string[]>
): string[] {
  switch (node.type) {
    case 'TSStringKeyword':
      return ['String']
    case 'TSNumberKeyword':
      return ['Number']
    case 'TSBooleanKeyword':
      return ['Boolean']
    case 'TSObjectKeyword':
      return ['Object']
    case 'TSTypeLiteral':
      // TODO (nice to have) generate runtime property validation
      return ['Object']
    case 'TSFunctionType':
      return ['Function']
    case 'TSArrayType':
    case 'TSTupleType':
      // TODO (nice to have) generate runtime element type/length checks
      return ['Array']

    case 'TSLiteralType':
      switch (node.literal.type) {
        case 'StringLiteral':
          return ['String']
        case 'BooleanLiteral':
          return ['Boolean']
        case 'NumericLiteral':
        case 'BigIntLiteral':
          return ['Number']
        default:
          return [`null`]
      }

    case 'TSTypeReference':
      if (node.typeName.type === 'Identifier') {
        if (declaredTypes[node.typeName.name]) {
          return declaredTypes[node.typeName.name]
        }
        switch (node.typeName.name) {
          case 'Array':
          case 'Function':
          case 'Object':
          case 'Set':
          case 'Map':
          case 'WeakSet':
          case 'WeakMap':
            return [node.typeName.name]
          case 'Record':
          case 'Partial':
          case 'Readonly':
          case 'Pick':
          case 'Omit':
          case 'Exclude':
          case 'Extract':
          case 'Required':
          case 'InstanceType':
            return ['Object']
        }
      }
      return [`null`]

    case 'TSUnionType':
      return [
        ...new Set(
          [].concat(node.types.map(t =>
            inferRuntimeType(t, declaredTypes)
          ) as any)
        )
      ]

    case 'TSIntersectionType':
      return ['Object']

    default:
      return [`null`] // no runtime check
  }
}

function genRuntimeProps(props: Record<string, PropTypeData>) {
  const keys = Object.keys(props)
  if (!keys.length) {
    return ``
  }

  if (!__DEV__) {
    // production: generate array version only
    return `\n  props: [\n    ${keys
      .map(k => JSON.stringify(k))
      .join(',\n    ')}\n  ] as unknown as undefined,`
  }

  return `\n  props: {\n    ${keys
    .map(key => {
      const { type, required } = props[key]
      return `${key}: { type: ${toRuntimeTypeString(
        type
      )}, required: ${required} }`
    })
    .join(',\n    ')}\n  } as unknown as undefined,`
}

function toRuntimeTypeString(types: string[]) {
  return types.some(t => t === 'null')
    ? `null`
    : types.length > 1
      ? `[${types.join(', ')}]`
      : types[0]
}

function extractRuntimeEmits(
  node: TSFunctionType | TSUnionType,
  emits: Set<string>
) {
  if (node.type === 'TSUnionType') {
    for (let t of node.types) {
      if (t.type === 'TSParenthesizedType') t = t.typeAnnotation
      if (t.type === 'TSFunctionType') {
        extractRuntimeEmits(t, emits)
      }
    }
    return
  }

  const eventName = node.parameters[0]
  if (
    eventName.type === 'Identifier' &&
    eventName.typeAnnotation &&
    eventName.typeAnnotation.type === 'TSTypeAnnotation'
  ) {
    const typeNode = eventName.typeAnnotation.typeAnnotation
    if (typeNode.type === 'TSLiteralType') {
      emits.add(String(typeNode.literal.value))
    } else if (typeNode.type === 'TSUnionType') {
      for (const t of typeNode.types) {
        if (t.type === 'TSLiteralType') {
          emits.add(String(t.literal.value))
        }
      }
    }
  }
}

function genRuntimeEmits(emits: Set<string>) {
  return emits.size
    ? `\n  emits: [${Array.from(emits)
        .map(p => JSON.stringify(p))
        .join(', ')}] as unknown as undefined,`
    : ``
}

/**
 * Walk an AST and find identifiers that are variable references.
 * This is largely the same logic with `transformExpressions` in compiler-core
 * but with some subtle differences as this needs to handle a wider range of
 * possible syntax.
 */
function walkIdentifiers(
  root: Node,
  onIdentifier: (node: Identifier, parent: Node) => void
) {
  const knownIds: Record<string, number> = Object.create(null)
  ;(walk as any)(root, {
    enter(node: Node & { scopeIds?: Set<string> }, parent: Node) {
      if (node.type === 'Identifier') {
        if (!knownIds[node.name] && isRefIdentifier(node, parent)) {
          onIdentifier(node, parent)
        }
      } else if (isFunction(node)) {
        // walk function expressions and add its arguments to known identifiers
        // so that we don't prefix them
        node.params.forEach(p =>
          (walk as any)(p, {
            enter(child: Node, parent: Node) {
              if (
                child.type === 'Identifier' &&
                // do not record as scope variable if is a destructured key
                !isStaticPropertyKey(child, parent) &&
                // do not record if this is a default value
                // assignment of a destructured variable
                !(
                  parent &&
                  parent.type === 'AssignmentPattern' &&
                  parent.right === child
                )
              ) {
                const { name } = child
                if (node.scopeIds && node.scopeIds.has(name)) {
                  return
                }
                if (name in knownIds) {
                  knownIds[name]++
                } else {
                  knownIds[name] = 1
                }
                ;(node.scopeIds || (node.scopeIds = new Set())).add(name)
              }
            }
          })
        )
      } else if (
        node.type === 'ObjectProperty' &&
        parent.type === 'ObjectPattern'
      ) {
        // mark property in destructure pattern
        ;(node as any).inPattern = true
      }
    },
    leave(node: Node & { scopeIds?: Set<string> }) {
      if (node.scopeIds) {
        node.scopeIds.forEach((id: string) => {
          knownIds[id]--
          if (knownIds[id] === 0) {
            delete knownIds[id]
          }
        })
      }
    }
  })
}

function isRefIdentifier(id: Identifier, parent: Node) {
  // declaration id
  if (
    (parent.type === 'VariableDeclarator' ||
      parent.type === 'ClassDeclaration') &&
    parent.id === id
  ) {
    return false
  }

  if (isFunction(parent)) {
    // function decalration/expression id
    if ((parent as any).id === id) {
      return false
    }
    // params list
    if (parent.params.includes(id)) {
      return false
    }
  }

  // property key
  // this also covers object destructure pattern
  if (isStaticPropertyKey(id, parent)) {
    return false
  }

  // array destructure pattern
  if (parent.type === 'ArrayPattern') {
    return false
  }

  // member expression property
  if (
    (parent.type === 'MemberExpression' ||
      parent.type === 'OptionalMemberExpression') &&
    parent.property === id &&
    !parent.computed
  ) {
    return false
  }

  // is a special keyword but parsed as identifier
  if (id.name === 'arguments') {
    return false
  }

  return true
}

const isStaticProperty = (node: Node): node is ObjectProperty =>
  node &&
  (node.type === 'ObjectProperty' || node.type === 'ObjectMethod') &&
  !node.computed

const isStaticPropertyKey = (node: Node, parent: Node) =>
  isStaticProperty(parent) && parent.key === node

function isFunction(node: Node): node is FunctionNode {
  return /Function(?:Expression|Declaration)$|Method$/.test(node.type)
}

function getObjectExpressionKeys(node: ObjectExpression): string[] {
  const keys = []
  for (const prop of node.properties) {
    if (
      (prop.type === 'ObjectProperty' || prop.type === 'ObjectMethod') &&
      !prop.computed
    ) {
      if (prop.key.type === 'Identifier') {
        keys.push(prop.key.name)
      } else if (prop.key.type === 'StringLiteral') {
        keys.push(prop.key.value)
      }
    }
  }
  return keys
}

function getArrayExpressionKeys(node: ArrayExpression): string[] {
  const keys = []
  for (const element of node.elements) {
    if (element && element.type === 'StringLiteral') {
      keys.push(element.value)
    }
  }
  return keys
}

function getObjectOrArrayExpressionKeys(property: ObjectProperty): string[] {
  if (property.value.type === 'ArrayExpression') {
    return getArrayExpressionKeys(property.value)
  }
  if (property.value.type === 'ObjectExpression') {
    return getObjectExpressionKeys(property.value)
  }
  return []
}

/**
 * Analyze bindings in normal `<script>`
 * Note that `compileScriptSetup` already analyzes bindings as part of its
 * compilation process so this should only be used on single `<script>` SFCs.
 */
function analyzeScriptBindings(ast: Statement[]): BindingMetadata {
  for (const node of ast) {
    if (
      node.type === 'ExportDefaultDeclaration' &&
      node.declaration.type === 'ObjectExpression'
    ) {
      return analyzeBindingsFromOptions(node.declaration)
    }
  }
  return {}
}

function analyzeBindingsFromOptions(node: ObjectExpression): BindingMetadata {
  const bindings: BindingMetadata = {}
  for (const property of node.properties) {
    if (
      property.type === 'ObjectProperty' &&
      !property.computed &&
      property.key.type === 'Identifier'
    ) {
      // props
      if (property.key.name === 'props') {
        // props: ['foo']
        // props: { foo: ... }
        for (const key of getObjectOrArrayExpressionKeys(property)) {
          bindings[key] = BindingTypes.PROPS
        }
      }

      // inject
      else if (property.key.name === 'inject') {
        // inject: ['foo']
        // inject: { foo: {} }
        for (const key of getObjectOrArrayExpressionKeys(property)) {
          bindings[key] = BindingTypes.OPTIONS
        }
      }

      // computed & methods
      else if (
        property.value.type === 'ObjectExpression' &&
        (property.key.name === 'computed' || property.key.name === 'methods')
      ) {
        // methods: { foo() {} }
        // computed: { foo() {} }
        for (const key of getObjectExpressionKeys(property.value)) {
          bindings[key] = BindingTypes.OPTIONS
        }
      }
    }

    // setup & data
    else if (
      property.type === 'ObjectMethod' &&
      property.key.type === 'Identifier' &&
      (property.key.name === 'setup' || property.key.name === 'data')
    ) {
      for (const bodyItem of property.body.body) {
        // setup() {
        //   return {
        //     foo: null
        //   }
        // }
        if (
          bodyItem.type === 'ReturnStatement' &&
          bodyItem.argument &&
          bodyItem.argument.type === 'ObjectExpression'
        ) {
          for (const key of getObjectExpressionKeys(bodyItem.argument)) {
            bindings[key] =
              property.key.name === 'setup'
                ? BindingTypes.SETUP
                : BindingTypes.DATA
          }
        }
      }
    }
  }

  return bindings
}
