/**
 * Rendering smoke test for the Verdict page.
 *
 * The shipped bundle is a loader factory that only a browser can execute, so the
 * artifact itself cannot be imported here. What this test pins down instead is the
 * rendering half (`src/client/view.tsx`), compiled in isolation with the same esbuild:
 * the page draws verification only because a guard ran, and a one-sided comparison
 * states its insufficiency instead of a verdict.
 */

import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'

import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// The compiled artifact lives inside the repo (gitignored output dir) so its
// require('react/jsx-runtime') resolves against the real node_modules; a temp dir
// outside the repo would resolve nothing.
const outDir = join('tests', '.tmp')
const outfile = join(outDir, 'view-panel.cjs')

mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: ['src/client/view.tsx'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // Same transform the client tsconfig selects; without it esbuild emits classic
  // React.createElement calls and the externals cannot satisfy them.
  jsx: 'automatic',
  outfile,
  external: ['react', 'react/jsx-runtime'],
  logLevel: 'silent',
})

const { ViewPanel } = await import(pathToFileURL(outfile).href)

// The component takes the translate seat the renderer binds from this plugin's
// namespace. Resolving against the real dictionary source means these assertions test
// both the rendering and that every key the component asks for actually exists. Built
// here rather than imported from `lib/`, because the host tsconfig excludes `src/client`
// — the browser half has no tsc output of its own.
const localesFile = join(outDir, 'locales.cjs')
await build({
  entryPoints: ['src/client/locales.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: localesFile,
  logLevel: 'silent',
})
const { en, zh } = await import(pathToFileURL(localesFile).href)
const t = (key, params) => {
  const template = en[key]
  if (template === undefined) throw new Error(`missing locale key: ${key}`)
  return template.replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? `{${name}}`))
}

after(() => rmSync(outDir, { recursive: true, force: true }))

const row = (over = {}) => ({
  id: 'r1', text: 'never commit the file .env', stateLabel: 'promoted',
  verified: false, broken: false, unhomed: false, recurrences: 0, ...over,
})

const baseView = {
  alerts: [], empty: false,
  summary: [{ label: 'promoted', count: 1 }],
  rows: [row({ verified: true })],
  skills: [],
  sessions: { total: 2, skillCandidates: 0 },
  comparison: { sufficient: false, improved: [], regressed: [], guardChanges: [], text: 'two snapshots are required' },
}

const render = (view, over = {}) =>
  renderToStaticMarkup(createElement(ViewPanel, { view, t, onRefresh() {}, onWrite() {}, writing: null, ...over }))

test('a rule shows "guard passed" only when its guard actually ran and passed', () => {
  assert.match(render(baseView), /guard passed/)
  assert.doesNotMatch(render({ ...baseView, rows: [row()] }), /guard passed/)
})

test('a guard that cannot run surfaces as an alert, not as a passing row', () => {
  const html = render({ ...baseView, alerts: ['b1: guard cannot run'] })
  assert.match(html, /guard cannot run/)
})

test('an empty ledger shows the empty state, not a rule list', () => {
  const html = render({ ...baseView, empty: true, rows: [], summary: [] })
  assert.match(html, /No rules captured yet/)
  assert.doesNotMatch(html, /promoted/)
})

test('the page follows the UI language', () => {
  // The same keys resolve to Chinese when `zh` is the active dictionary — which is what
  // the plugin registers; a hardcoded English string could never do this.
  const zhT = (key, params) => {
    assert.notEqual(zh[key], undefined, `missing Chinese locale key: ${key}`)
    return zh[key].replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ''))
  }
  const html = renderToStaticMarkup(
    createElement(ViewPanel, { view: baseView, t: zhT, onRefresh() {}, onWrite() {}, writing: null }),
  )
  assert.match(html, /规则/)
  assert.match(html, /刷新/)
  assert.match(html, /守卫已通过/)
  assert.doesNotMatch(html, /guard passed/)
})

test('a skill candidate shows its intent, its evidence, and a write action', () => {
  const html = render({
    ...baseView,
    skills: [{ key: 'k1', steps: ['run tests', 'commit'], occurrences: 3, intent: 'verify a change' }],
  })
  assert.match(html, /verify a change/)
  assert.match(html, /3 successful run\(s\)/)
  assert.match(html, /run tests/)
  assert.match(html, /Write skill/)
})

test('an insufficient comparison is stated as unavailable, never as an improvement', () => {
  const html = render(baseView)
  assert.match(html, /comparison unavailable/)
  assert.doesNotMatch(html, /improved:/)
})

test('a sufficient comparison names improvements and regressions by id', () => {
  const html = render({
    ...baseView,
    comparison: { sufficient: true, improved: ['good'], regressed: ['bad'], guardChanges: [] },
  })
  assert.match(html, /improved:.*good/)
  assert.match(html, /regressed:.*bad/)
})
