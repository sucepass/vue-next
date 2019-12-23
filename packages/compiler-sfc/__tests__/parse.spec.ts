import { parse } from '../src'
import { mockWarn } from '@vue/runtime-test'
import { baseParse, baseCompile } from '@vue/compiler-core'

describe('compiler:sfc', () => {
  mockWarn()

  describe('source map', () => {
    test('style block', () => {
      const style = parse(`<style>\n.color {\n color: red;\n }\n</style>\n`)
        .descriptor.styles[0]
      // TODO need to actually test this with SourceMapConsumer
      expect(style.map).not.toBeUndefined()
    })

    test('script block', () => {
      const script = parse(`<script>\nconsole.log(1)\n }\n</script>\n`)
        .descriptor.script
      // TODO need to actually test this with SourceMapConsumer
      expect(script!.map).not.toBeUndefined()
    })
  })

  test('pad content', () => {
    const content = `
<template>
<div></div>
</template>
<script>
export default {}
</script>
<style>
h1 { color: red }
</style>`
    const padFalse = parse(content.trim(), { pad: false }).descriptor
    expect(padFalse.template!.content).toBe('\n<div></div>\n')
    expect(padFalse.script!.content).toBe('\nexport default {}\n')
    expect(padFalse.styles[0].content).toBe('\nh1 { color: red }\n')

    const padTrue = parse(content.trim(), { pad: true }).descriptor
    expect(padTrue.script!.content).toBe(
      Array(3 + 1).join('//\n') + '\nexport default {}\n'
    )
    expect(padTrue.styles[0].content).toBe(
      Array(6 + 1).join('\n') + '\nh1 { color: red }\n'
    )

    const padLine = parse(content.trim(), { pad: 'line' }).descriptor
    expect(padLine.script!.content).toBe(
      Array(3 + 1).join('//\n') + '\nexport default {}\n'
    )
    expect(padLine.styles[0].content).toBe(
      Array(6 + 1).join('\n') + '\nh1 { color: red }\n'
    )

    const padSpace = parse(content.trim(), { pad: 'space' }).descriptor
    expect(padSpace.script!.content).toBe(
      `<template>\n<div></div>\n</template>\n<script>`.replace(/./g, ' ') +
        '\nexport default {}\n'
    )
    expect(padSpace.styles[0].content).toBe(
      `<template>\n<div></div>\n</template>\n<script>\nexport default {}\n</script>\n<style>`.replace(
        /./g,
        ' '
      ) + '\nh1 { color: red }\n'
    )
  })

  test('should ignore nodes with no content', () => {
    expect(parse(`<template/>`).descriptor.template).toBe(null)
    expect(parse(`<script/>`).descriptor.script).toBe(null)
    expect(parse(`<style/>`).descriptor.styles.length).toBe(0)
    expect(parse(`<custom/>`).descriptor.customBlocks.length).toBe(0)
  })

  test('nested templates', () => {
    const content = `
    <template v-if="ok">ok</template>
    <div><div></div></div>
    `
    const { descriptor } = parse(`<template>${content}</template>`)
    expect(descriptor.template!.content).toBe(content)
  })

  test('error tolerance', () => {
    const { errors } = parse(`<template>`)
    expect(errors.length).toBe(1)
  })

  test('should parse as DOM by default', () => {
    const { errors } = parse(`<template><input></template>`)
    expect(errors.length).toBe(0)
  })

  test('custom compiler', () => {
    const { errors } = parse(`<template><input></template>`, {
      compiler: {
        parse: baseParse,
        compile: baseCompile
      }
    })
    expect(errors.length).toBe(1)
  })

  test('treat custom blocks as raw text', () => {
    const { errors, descriptor } = parse(`<foo> <-& </foo>`)
    expect(errors.length).toBe(0)
    expect(descriptor.customBlocks[0].content).toBe(` <-& `)
  })

  describe('warnings', () => {
    test('should only allow single template element', () => {
      parse(`<template><div/></template><template><div/></template>`)
      expect(
        `Single file component can contain only one template element`
      ).toHaveBeenWarned()
    })

    test('should only allow single script element', () => {
      parse(`<script>console.log(1)</script><script>console.log(1)</script>`)
      expect(
        `Single file component can contain only one script element`
      ).toHaveBeenWarned()
    })
  })
})
