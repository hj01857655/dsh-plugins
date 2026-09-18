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
  renderToStaticMarkup(createElement(ViewPanel, { view, onRefresh() {}, onWrite() {}, writing: null, ...over }))

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
  assert.match(html, /improved: good/)
  assert.match(html, /regressed: bad/)
})
