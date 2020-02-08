import { compile } from '../src'

describe('ssr: components', () => {
  test('basic', () => {
    expect(compile(`<foo id="a" :prop="b" />`).code).toMatchInlineSnapshot(`
      "const { resolveComponent: _resolveComponent } = require(\\"vue\\")
      const { ssrRenderComponent: _ssrRenderComponent } = require(\\"@vue/server-renderer\\")

      return function ssrRender(_ctx, _push, _parent) {
        const _component_foo = _resolveComponent(\\"foo\\")

        _push(_ssrRenderComponent(_component_foo, {
          id: \\"a\\",
          prop: _ctx.b
        }, null, _parent))
      }"
    `)
  })

  test('dynamic component', () => {
    expect(compile(`<component is="foo" prop="b" />`).code)
      .toMatchInlineSnapshot(`
      "const { resolveComponent: _resolveComponent } = require(\\"vue\\")
      const { ssrRenderComponent: _ssrRenderComponent } = require(\\"@vue/server-renderer\\")

      return function ssrRender(_ctx, _push, _parent) {
        const _component_foo = _resolveComponent(\\"foo\\")

        _push(_ssrRenderComponent(_component_foo, { prop: \\"b\\" }, null, _parent))
      }"
    `)

    expect(compile(`<compoonent :is="foo" prop="b" />`).code)
      .toMatchInlineSnapshot(`
      "const { resolveComponent: _resolveComponent } = require(\\"vue\\")
      const { ssrRenderComponent: _ssrRenderComponent } = require(\\"@vue/server-renderer\\")

      return function ssrRender(_ctx, _push, _parent) {
        const _component_compoonent = _resolveComponent(\\"compoonent\\")

        _push(_ssrRenderComponent(_component_compoonent, {
          is: _ctx.foo,
          prop: \\"b\\"
        }, null, _parent))
      }"
    `)
  })

  describe('slots', () => {
    test('implicit default slot', () => {
      expect(compile(`<foo>hello<div/></foo>`).code).toMatchInlineSnapshot(`
        "const { resolveComponent: _resolveComponent, createVNode: _createVNode, createTextVNode: _createTextVNode } = require(\\"vue\\")
        const { ssrRenderComponent: _ssrRenderComponent } = require(\\"@vue/server-renderer\\")

        return function ssrRender(_ctx, _push, _parent) {
          const _component_foo = _resolveComponent(\\"foo\\")

          _push(_ssrRenderComponent(_component_foo, null, {
            default: (_, _push, _parent, _scopeId) => {
              if (_push) {
                _push(\`hello<div\${_scopeId}></div>\`)
              } else {
                return [
                  _createTextVNode(\\"hello\\"),
                  _createVNode(\\"div\\")
                ]
              }
            },
            _compiled: true
          }, _parent))
        }"
      `)
    })

    test('explicit default slot', () => {
      expect(compile(`<foo v-slot="{ msg }">{{ msg + outer }}</foo>`).code)
        .toMatchInlineSnapshot(`
        "const { resolveComponent: _resolveComponent, createTextVNode: _createTextVNode } = require(\\"vue\\")
        const { ssrRenderComponent: _ssrRenderComponent, ssrInterpolate: _ssrInterpolate } = require(\\"@vue/server-renderer\\")

        return function ssrRender(_ctx, _push, _parent) {
          const _component_foo = _resolveComponent(\\"foo\\")

          _push(_ssrRenderComponent(_component_foo, null, {
            default: ({ msg }, _push, _parent, _scopeId) => {
              if (_push) {
                _push(\`\${_ssrInterpolate(msg + _ctx.outer)}\`)
              } else {
                return [
                  _createTextVNode(_toDisplayString(msg + _ctx.outer))
                ]
              }
            },
            _compiled: true
          }, _parent))
        }"
      `)
    })

    test('named slots', () => {
      expect(
        compile(`<foo>
        <template v-slot>foo</template>
        <template v-slot:named>bar</template>
      </foo>`).code
      ).toMatchInlineSnapshot(`
        "const { resolveComponent: _resolveComponent, createTextVNode: _createTextVNode } = require(\\"vue\\")
        const { ssrRenderComponent: _ssrRenderComponent } = require(\\"@vue/server-renderer\\")

        return function ssrRender(_ctx, _push, _parent) {
          const _component_foo = _resolveComponent(\\"foo\\")

          _push(_ssrRenderComponent(_component_foo, null, {
            default: (_, _push, _parent, _scopeId) => {
              if (_push) {
                _push(\`foo\`)
              } else {
                return [
                  _createTextVNode(\\"foo\\")
                ]
              }
            },
            named: (_, _push, _parent, _scopeId) => {
              if (_push) {
                _push(\`bar\`)
              } else {
                return [
                  _createTextVNode(\\"bar\\")
                ]
              }
            },
            _compiled: true
          }, _parent))
        }"
      `)
    })

    test('v-if slot', () => {
      expect(
        compile(`<foo>
        <template v-slot:named v-if="ok">foo</template>
      </foo>`).code
      ).toMatchInlineSnapshot(`
        "const { resolveComponent: _resolveComponent, createTextVNode: _createTextVNode, createSlots: _createSlots } = require(\\"vue\\")
        const { ssrRenderComponent: _ssrRenderComponent } = require(\\"@vue/server-renderer\\")

        return function ssrRender(_ctx, _push, _parent) {
          const _component_foo = _resolveComponent(\\"foo\\")

          _push(_ssrRenderComponent(_component_foo, null, _createSlots({ _compiled: true }, [
            (_ctx.ok)
              ? {
                  name: \\"named\\",
                  fn: (_, _push, _parent, _scopeId) => {
                    if (_push) {
                      _push(\`foo\`)
                    } else {
                      return [
                        _createTextVNode(\\"foo\\")
                      ]
                    }
                  }
                }
              : undefined
          ]), _parent))
        }"
      `)
    })

    test('v-for slot', () => {
      expect(
        compile(`<foo>
        <template v-for="key in names" v-slot:[key]="{ msg }">{{ msg + key + bar }}</template>
      </foo>`).code
      ).toMatchInlineSnapshot(`
        "const { resolveComponent: _resolveComponent, createTextVNode: _createTextVNode, renderList: _renderList, createSlots: _createSlots } = require(\\"vue\\")
        const { ssrRenderComponent: _ssrRenderComponent, ssrInterpolate: _ssrInterpolate } = require(\\"@vue/server-renderer\\")

        return function ssrRender(_ctx, _push, _parent) {
          const _component_foo = _resolveComponent(\\"foo\\")

          _push(_ssrRenderComponent(_component_foo, null, _createSlots({ _compiled: true }, [
            _renderList(_ctx.names, (key) => {
              return {
                name: key,
                fn: ({ msg }, _push, _parent, _scopeId) => {
                  if (_push) {
                    _push(\`\${_ssrInterpolate(msg + key + _ctx.bar)}\`)
                  } else {
                    return [
                      _createTextVNode(_toDisplayString(msg + _ctx.key + _ctx.bar))
                    ]
                  }
                }
              }
            })
          ]), _parent))
        }"
      `)
    })

    test('nested transform scoping in vnode branch', () => {
      expect(
        compile(`<foo>
        <template v-slot:foo="{ list }">
          <div v-if="ok">
            <span v-for="i in list"></span>
          </div>
        </template>
        <template v-slot:bar="{ ok }">
          <div v-if="ok">
            <span v-for="i in list"></span>
          </div>
        </template>
      </foo>`).code
      ).toMatchInlineSnapshot(`
        "const { resolveComponent: _resolveComponent, renderList: _renderList, openBlock: _openBlock, createBlock: _createBlock, Fragment: _Fragment, createVNode: _createVNode, createCommentVNode: _createCommentVNode } = require(\\"vue\\")
        const { ssrRenderComponent: _ssrRenderComponent, ssrRenderList: _ssrRenderList } = require(\\"@vue/server-renderer\\")

        return function ssrRender(_ctx, _push, _parent) {
          const _component_foo = _resolveComponent(\\"foo\\")

          _push(_ssrRenderComponent(_component_foo, null, {
            foo: ({ list }, _push, _parent, _scopeId) => {
              if (_push) {
                if (_ctx.ok) {
                  _push(\`<div\${_scopeId}><!---->\`)
                  _ssrRenderList(list, (i) => {
                    _push(\`<span\${_scopeId}></span>\`)
                  })
                  _push(\`<!----></div>\`)
                } else {
                  _push(\`<!---->\`)
                }
              } else {
                return [
                  (_openBlock(), (_ctx.ok)
                    ? _createBlock(\\"div\\", { key: 0 }, [
                        (_openBlock(false), _createBlock(_Fragment, null, _renderList(list, (i) => {
                          return (_openBlock(), _createBlock(\\"span\\"))
                        }), 256 /* UNKEYED_FRAGMENT */))
                      ])
                    : _createCommentVNode(\\"v-if\\", true))
                ]
              }
            },
            bar: ({ ok }, _push, _parent, _scopeId) => {
              if (_push) {
                if (ok) {
                  _push(\`<div\${_scopeId}><!---->\`)
                  _ssrRenderList(_ctx.list, (i) => {
                    _push(\`<span\${_scopeId}></span>\`)
                  })
                  _push(\`<!----></div>\`)
                } else {
                  _push(\`<!---->\`)
                }
              } else {
                return [
                  (_openBlock(), ok
                    ? _createBlock(\\"div\\", { key: 0 }, [
                        (_openBlock(false), _createBlock(_Fragment, null, _renderList(_ctx.list, (i) => {
                          return (_openBlock(), _createBlock(\\"span\\"))
                        }), 256 /* UNKEYED_FRAGMENT */))
                      ])
                    : _createCommentVNode(\\"v-if\\", true))
                ]
              }
            },
            _compiled: true
          }, _parent))
        }"
      `)
    })

    test('built-in fallthroughs', () => {
      // no fragment
      expect(compile(`<transition><div/></transition>`).code)
        .toMatchInlineSnapshot(`
        "
        return function ssrRender(_ctx, _push, _parent) {
          _push(\`<div></div>\`)
        }"
      `)

      // wrap with fragment
      expect(compile(`<transition-group><div/></transition-group>`).code)
        .toMatchInlineSnapshot(`
        "
        return function ssrRender(_ctx, _push, _parent) {
          _push(\`<!----><div></div><!---->\`)
        }"
      `)

      // no fragment
      expect(compile(`<keep-alive><foo/></keep-alive>`).code)
        .toMatchInlineSnapshot(`
        "const { resolveComponent: _resolveComponent } = require(\\"vue\\")
        const { ssrRenderComponent: _ssrRenderComponent } = require(\\"@vue/server-renderer\\")

        return function ssrRender(_ctx, _push, _parent) {
          const _component_foo = _resolveComponent(\\"foo\\")

          _push(_ssrRenderComponent(_component_foo, null, null, _parent))
        }"
      `)

      // wrap with fragment
      expect(compile(`<suspense><div/></suspense>`).code)
        .toMatchInlineSnapshot(`
        "
        return function ssrRender(_ctx, _push, _parent) {
          _push(\`<!----><div></div><!---->\`)
        }"
      `)
    })
  })
})
