import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

// Vitest runs from the frontend folder.
const read = (path) => readFileSync(resolve(path), 'utf8')

const page = read('index.html')
const styles = read('src/index.css')
const fonts = read('src/fonts.js')

// The first family named by each font token (--display, --ui, ...) in :root.
function tokenFamilies() {
  const families = {}
  for (const [, token, family] of styles.matchAll(/--(display|emphasis|ui|nav):\s*'([^']+)'/g)) {
    families[token] = family
  }
  return families
}

// The font files the app imports, each as the CSS the package ships.
function bundledFontCss() {
  const imports = [...fonts.matchAll(/import\s+'(@fontsource[^']+\.css)'/g)].map((m) => m[1])
  return imports.map((specifier) => read(`node_modules/${specifier}`))
}

test('the page loads no fonts from another site', () => {
  expect(page).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/)
  expect(page).not.toMatch(/<link[^>]+rel="(stylesheet|preconnect)"[^>]+href="https?:/)
})

test('every font token names a family that the bundled fonts declare', () => {
  const declared = new Set(
    bundledFontCss().flatMap((css) => [...css.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1])),
  )
  const families = tokenFamilies()

  expect(Object.keys(families).sort()).toEqual(['display', 'emphasis', 'nav', 'ui'])
  for (const [token, family] of Object.entries(families)) {
    expect(declared, `--${token} uses '${family}'`).toContain(family)
  }
})

test('every weight the app asks of a font is bundled', () => {
  const weightsByFamily = {}
  for (const css of bundledFontCss()) {
    for (const [, block] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
      const family = block.match(/font-family:\s*'([^']+)'/)[1]
      const weight = block.match(/font-weight:\s*([^;]+);/)[1].trim()
      ;(weightsByFamily[family] ??= new Set()).add(weight)
    }
  }
  const has = (family, weight) =>
    [...(weightsByFamily[family] ?? [])].some((range) => {
      const [low, high = low] = range.split(' ').map(Number)
      return weight >= low && weight <= high
    })

  // The weights the design uses: see design.md ("Typography").
  expect(has('Unbounded', 400) && has('Unbounded', 700)).toBe(true)
  for (const weight of [400, 500, 600, 700]) expect(has('Inter', weight), `Inter ${weight}`).toBe(true)
  expect(has('Manrope', 500) && has('Manrope', 700)).toBe(true)
  expect(has('DM Sans Variable', 500)).toBe(true)
})
