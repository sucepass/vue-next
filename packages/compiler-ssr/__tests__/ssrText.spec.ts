import { compile } from '../src'
import { getCompiledString } from './utils'

describe('ssr: text', () => {
  test('static text', () => {
    expect(getCompiledString(`foo`)).toMatchInlineSnapshot(`"\`foo\`"`)
  })

  test('static text escape', () => {
    expect(getCompiledString(`&lt;foo&gt;`)).toMatchInlineSnapshot(
      `"\`&lt;foo&gt;\`"`
    )
  })

  test('nested elements with static text', () => {
    expect(
      getCompiledString(`<div><span>hello</span><span>bye</span></div>`)
    ).toMatchInlineSnapshot(
      `"\`<div><span>hello</span><span>bye</span></div>\`"`
    )
  })

  test('interpolation', () => {
    expect(compile(`foo {{ bar }} baz`).code).toMatchInlineSnapshot(`
      "const { _interpolate } = require(\\"@vue/server-renderer\\")

      return function ssrRender(_ctx, _push, _parent) {
        _push(\`foo \${_interpolate(_ctx.bar)} baz\`)
      }"
    `)
  })

  test('nested elements with interpolation', () => {
    expect(
      compile(`<div><span>{{ foo }} bar</span><span>baz {{ qux }}</span></div>`)
        .code
    ).toMatchInlineSnapshot(`
      "const { _interpolate } = require(\\"@vue/server-renderer\\")

      return function ssrRender(_ctx, _push, _parent) {
        _push(\`<div><span>\${
          _interpolate(_ctx.foo)
        } bar</span><span>baz \${
          _interpolate(_ctx.qux)
        }</span></div>\`)
      }"
    `)
  })
})
