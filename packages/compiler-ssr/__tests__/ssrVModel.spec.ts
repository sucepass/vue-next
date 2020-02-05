import { compile } from '../src'

describe('ssr: v-model', () => {
  test('<input> (text types)', () => {
    expect(compile(`<input v-model="bar">`).code).toMatchInlineSnapshot(`
      "const { _renderAttr } = require(\\"@vue/server-renderer\\")

      return function ssrRender(_ctx, _push, _parent) {
        _push(\`<input\${_renderAttr(\\"value\\", _ctx.bar)}>\`)
      }"
    `)

    expect(compile(`<input type="email" v-model="bar">`).code)
      .toMatchInlineSnapshot(`
      "const { _renderAttr } = require(\\"@vue/server-renderer\\")

      return function ssrRender(_ctx, _push, _parent) {
        _push(\`<input type=\\"email\\"\${_renderAttr(\\"value\\", _ctx.bar)}>\`)
      }"
    `)
  })

  test('<input type="radio">', () => {
    expect(compile(`<input type="radio" value="foo" v-model="bar">`).code)
      .toMatchInlineSnapshot(`
      "const { _looseEqual } = require(\\"@vue/server-renderer\\")

      return function ssrRender(_ctx, _push, _parent) {
        _push(\`<input type=\\"radio\\" value=\\"foo\\"\${(_looseEqual(_ctx.bar, \\"foo\\")) ? \\" checked\\" : \\"\\"}>\`)
      }"
    `)
  })

  test('<input type="checkbox"', () => {
    expect(compile(`<input type="checkbox" v-model="bar">`).code)
      .toMatchInlineSnapshot(`
      "const { _looseContain } = require(\\"@vue/server-renderer\\")

      return function ssrRender(_ctx, _push, _parent) {
        _push(\`<input type=\\"checkbox\\"\${((Array.isArray(_ctx.bar))
          ? _looseContain(_ctx.bar, null)
          : _ctx.bar) ? \\" checked\\" : \\"\\"}>\`)
      }"
    `)

    expect(compile(`<input type="checkbox" value="foo" v-model="bar">`).code)
      .toMatchInlineSnapshot(`
      "const { _looseContain } = require(\\"@vue/server-renderer\\")

      return function ssrRender(_ctx, _push, _parent) {
        _push(\`<input type=\\"checkbox\\" value=\\"foo\\"\${((Array.isArray(_ctx.bar))
          ? _looseContain(_ctx.bar, \\"foo\\")
          : _ctx.bar) ? \\" checked\\" : \\"\\"}>\`)
      }"
    `)
  })

  test('<textarea>', () => {
    expect(compile(`<textarea v-model="foo">bar</textarea>`).code)
      .toMatchInlineSnapshot(`
      "const { _interpolate } = require(\\"@vue/server-renderer\\")

      return function ssrRender(_ctx, _push, _parent) {
        _push(\`<textarea>\${_interpolate(_ctx.foo)}</textarea>\`)
      }"
    `)
  })

  test('<input :type="x">', () => {
    expect(compile(`<input :type="x" v-model="foo">`).code)
      .toMatchInlineSnapshot(`
      "const { _renderAttr, _renderDynamicModel } = require(\\"@vue/server-renderer\\")

      return function ssrRender(_ctx, _push, _parent) {
        _push(\`<input\${
          _renderAttr(\\"type\\", _ctx.x)
        }\${
          _renderDynamicModel(_ctx.x, _ctx.foo, null)
        }>\`)
      }"
    `)

    expect(compile(`<input :type="x" v-model="foo" value="bar">`).code)
      .toMatchInlineSnapshot(`
      "const { _renderAttr, _renderDynamicModel } = require(\\"@vue/server-renderer\\")

      return function ssrRender(_ctx, _push, _parent) {
        _push(\`<input\${
          _renderAttr(\\"type\\", _ctx.x)
        }\${
          _renderDynamicModel(_ctx.x, _ctx.foo, \\"bar\\")
        } value=\\"bar\\">\`)
      }"
    `)

    expect(compile(`<input :type="x" v-model="foo" :value="bar">`).code)
      .toMatchInlineSnapshot(`
      "const { _renderAttr, _renderDynamicModel } = require(\\"@vue/server-renderer\\")

      return function ssrRender(_ctx, _push, _parent) {
        _push(\`<input\${
          _renderAttr(\\"type\\", _ctx.x)
        }\${
          _renderDynamicModel(_ctx.x, _ctx.foo, _ctx.bar)
        }\${
          _renderAttr(\\"value\\", _ctx.bar)
        }>\`)
      }"
    `)
  })

  test('<input v-bind="obj">', () => {
    expect(compile(`<input v-bind="obj" v-model="foo">`).code)
      .toMatchInlineSnapshot(`
      "const { mergeProps } = require(\\"vue\\")
      const { _renderAttrs, _getDynamicModelProps } = require(\\"@vue/server-renderer\\")

      return function ssrRender(_ctx, _push, _parent) {
        let _temp0

        _push(\`<input\${_renderAttrs(_temp0 = _ctx.obj, mergeProps(_temp0, _getDynamicModelProps(_temp0, _ctx.foo)))}>\`)
      }"
    `)

    expect(compile(`<input id="x" v-bind="obj" v-model="foo" class="y">`).code)
      .toMatchInlineSnapshot(`
      "const { mergeProps } = require(\\"vue\\")
      const { _renderAttrs, _getDynamicModelProps } = require(\\"@vue/server-renderer\\")

      return function ssrRender(_ctx, _push, _parent) {
        let _temp0

        _push(\`<input\${_renderAttrs(_temp0 = mergeProps({ id: \\"x\\" }, _ctx.obj, { class: \\"y\\" }), mergeProps(_temp0, _getDynamicModelProps(_temp0, _ctx.foo)))}>\`)
      }"
    `)
  })
})
