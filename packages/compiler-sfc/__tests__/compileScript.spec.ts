import { parse, compileScriptSetup, SFCScriptCompileOptions } from '../src'
import { parse as babelParse } from '@babel/parser'
import { babelParserDefautPlugins } from '@vue/shared'

function compile(src: string, options?: SFCScriptCompileOptions) {
  const { descriptor } = parse(src)
  return compileScriptSetup(descriptor, options)
}

function assertCode(code: string) {
  // parse the generated code to make sure it is valid
  try {
    babelParse(code, {
      sourceType: 'module',
      plugins: [...babelParserDefautPlugins, 'typescript']
    })
  } catch (e) {
    console.log(code)
    throw e
  }
  expect(code).toMatchSnapshot()
}

describe('SFC compile <script setup>', () => {
  test('should hoist imports', () => {
    assertCode(compile(`<script setup>import { ref } from 'vue'</script>`).code)
  })

  test('explicit setup signature', () => {
    assertCode(
      compile(`<script setup="props, { emit }">emit('foo')</script>`).code
    )
  })

  test('import dedupe between <script> and <script setup>', () => {
    const code = compile(`
      <script>
      import { x } from './x'
      </script>
      <script setup>
      import { x } from './x'
      x()
      </script>
      `).code
    assertCode(code)
    expect(code.indexOf(`import { x }`)).toEqual(
      code.lastIndexOf(`import { x }`)
    )
  })

  describe('exports', () => {
    test('export const x = ...', () => {
      const { code, bindings } = compile(
        `<script setup>export const x = 1</script>`
      )
      assertCode(code)
      expect(bindings).toStrictEqual({
        x: 'setup'
      })
    })

    test('export const { x } = ... (destructuring)', () => {
      const { code, bindings } = compile(`<script setup>
          export const [a = 1, { b } = { b: 123 }, ...c] = useFoo()
          export const { d = 2, _: [e], ...f } = useBar()
        </script>`)
      assertCode(code)
      expect(bindings).toStrictEqual({
        a: 'setup',
        b: 'setup',
        c: 'setup',
        d: 'setup',
        e: 'setup',
        f: 'setup'
      })
    })

    test('export function x() {}', () => {
      const { code, bindings } = compile(
        `<script setup>export function x(){}</script>`
      )
      assertCode(code)
      expect(bindings).toStrictEqual({
        x: 'setup'
      })
    })

    test('export class X() {}', () => {
      const { code, bindings } = compile(
        `<script setup>export class X {}</script>`
      )
      assertCode(code)
      expect(bindings).toStrictEqual({
        X: 'setup'
      })
    })

    test('export { x }', () => {
      const { code, bindings } = compile(
        `<script setup>
           const x = 1
           const y = 2
           export { x, y }
          </script>`
      )
      assertCode(code)
      expect(bindings).toStrictEqual({
        x: 'setup',
        y: 'setup'
      })
    })

    test(`export { x } from './x'`, () => {
      const { code, bindings } = compile(
        `<script setup>
           export { x, y } from './x'
          </script>`
      )
      assertCode(code)
      expect(bindings).toStrictEqual({
        x: 'setup',
        y: 'setup'
      })
    })

    test(`export default from './x'`, () => {
      const { code, bindings } = compile(
        `<script setup>
          export default from './x'
          </script>`,
        {
          parserPlugins: ['exportDefaultFrom']
        }
      )
      assertCode(code)
      expect(bindings).toStrictEqual({})
    })

    test(`export { x as default }`, () => {
      const { code, bindings } = compile(
        `<script setup>
          import x from './x'
          const y = 1
          export { x as default, y }
          </script>`
      )
      assertCode(code)
      expect(bindings).toStrictEqual({
        y: 'setup'
      })
    })

    test(`export { x as default } from './x'`, () => {
      const { code, bindings } = compile(
        `<script setup>
          export { x as default, y } from './x'
          </script>`
      )
      assertCode(code)
      expect(bindings).toStrictEqual({
        y: 'setup'
      })
    })

    test(`export * from './x'`, () => {
      const { code, bindings } = compile(
        `<script setup>
          export * from './x'
          export const y = 1
          </script>`
      )
      assertCode(code)
      expect(bindings).toStrictEqual({
        y: 'setup'
        // in this case we cannot extract bindings from ./x so it falls back
        // to runtime proxy dispatching
      })
    })

    test('export default in <script setup>', () => {
      const { code, bindings } = compile(
        `<script setup>
          export default {
            props: ['foo']
          }
          export const y = 1
          </script>`
      )
      assertCode(code)
      expect(bindings).toStrictEqual({
        y: 'setup'
      })
    })
  })

  describe('<script setup lang="ts">', () => {
    test('hoist type declarations', () => {
      const { code, bindings } = compile(`
      <script setup lang="ts">
        export interface Foo {}
        type Bar = {}
        export const a = 1
      </script>`)
      assertCode(code)
      expect(bindings).toStrictEqual({ a: 'setup' })
    })

    test('extract props', () => {})

    test('extract emits', () => {})
  })

  describe('errors', () => {
    test('must have <script setup>', () => {
      expect(() => compile(`<script>foo()</script>`)).toThrow(
        `SFC has no <script setup>`
      )
    })

    test('<script> and <script setup> must have same lang', () => {
      expect(() =>
        compile(`<script>foo()</script><script setup lang="ts">bar()</script>`)
      ).toThrow(`<script> and <script setup> must have the same language type`)
    })

    test('export local as default', () => {
      expect(() =>
        compile(`<script setup>
          const bar = 1
          export { bar as default }
        </script>`)
      ).toThrow(`Cannot export locally defined variable as default`)
    })

    test('export default referencing local var', () => {
      expect(() =>
        compile(`<script setup>
          const bar = 1
          export default {
            props: {
              foo: {
                default: () => bar
              }
            }
          }
        </script>`)
      ).toThrow(`cannot reference locally declared variables`)
    })

    test('export default referencing exports', () => {
      expect(() =>
        compile(`<script setup>
        export const bar = 1
        export default {
          props: bar
        }
      </script>`)
      ).toThrow(`cannot reference locally declared variables`)
    })

    test('should allow export default referencing scope var', () => {
      assertCode(
        compile(`<script setup>
          const bar = 1
          export default {
            props: {
              foo: {
                default: bar => bar + 1
              }
            }
          }
        </script>`).code
      )
    })

    test('should allow export default referencing imported binding', () => {
      assertCode(
        compile(`<script setup>
          import { bar } from './bar'
          export { bar }
          export default {
            props: {
              foo: {
                default: () => bar
              }
            }
          }
        </script>`).code
      )
    })

    test('should allow export default referencing re-exported binding', () => {
      assertCode(
        compile(`<script setup>
          export { bar } from './bar'
          export default {
            props: {
              foo: {
                default: () => bar
              }
            }
          }
        </script>`).code
      )
    })

    test('error on duplicated defalut export', () => {
      expect(() =>
        compile(`
      <script>
      export default {}
      </script>
      <script setup>
      export default {}
      </script>
      `)
      ).toThrow(`Default export is already declared`)

      expect(() =>
        compile(`
      <script>
      export default {}
      </script>
      <script setup>
      const x = {}
      export { x as default }
      </script>
      `)
      ).toThrow(`Default export is already declared`)

      expect(() =>
        compile(`
      <script>
      export default {}
      </script>
      <script setup>
      export { x as default } from './y'
      </script>
      `)
      ).toThrow(`Default export is already declared`)

      expect(() =>
        compile(`
      <script>
      export { x as default } from './y'
      </script>
      <script setup>
      export default {}
      </script>
      `)
      ).toThrow(`Default export is already declared`)

      expect(() =>
        compile(`
      <script>
      const x = {}
      export { x as default }
      </script>
      <script setup>
      export default {}
      </script>
      `)
      ).toThrow(`Default export is already declared`)
    })
  })
})
