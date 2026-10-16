/**
 * The token editor's contract.
 *
 * Hand-edited tokens are the finest control this plugin offers and the last
 * source to reach the override layer but for custom CSS, so what such an edit
 * does to the other palette — and what the load and import paths let through —
 * is worth pinning down. `ctx.theme.overrideTokens` requires both values per
 * token, which is what makes "edit only the light side" a case with a real
 * answer instead of a free one.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { TOKEN_GROUPS, VERIFIED_TOKENS } from '../lib/tokens.js'
import { DEFAULT_PREFERENCES, normalizeCssValue, normalizeTokenOverrides } from '../lib/types.js'
import { resolveOverrides } from '../lib/apply.js'
import { exportTheme, parseTheme } from '../lib/io.js'

const base = { ...DEFAULT_PREFERENCES }

test('TOKEN_GROUPS covers every verified token exactly once', () => {
  const seen = []
  for (const group of TOKEN_GROUPS) {
    assert.ok(group.tokens.length > 0, `${group.label} is empty`)
    for (const name of group.tokens) {
      assert.ok(VERIFIED_TOKENS.includes(name), `${name} is not verified`)
      assert.ok(!seen.includes(name), `${name} is listed twice`)
      seen.push(name)
    }
  }
  // The editor's promise: everything this plugin may write is reachable from the
  // UI, so a token added to the verified surface must also land in a group.
  const missing = VERIFIED_TOKENS.filter((name) => !seen.includes(name))
  assert.deepEqual(missing, [], `tokens with no group: ${missing.join(', ')}`)
})

test('a token edit wins over the preset and the accent for the mode it names', () => {
  const prefs = {
    ...base,
    preset: 'nord',
    accentColor: '#112233',
    tokenOverrides: { '--dsw-alias-link': { light: '#ff0000' } },
  }
  const { overrides } = resolveOverrides(prefs, false)
  assert.equal(overrides['--dsw-alias-link'].light, '#ff0000')
  // The untouched side keeps what the accent gave it, rather than repeating the
  // edit into a mode the user never touched.
  assert.equal(overrides['--dsw-alias-link'].dark, overrides['--dsw-alias-brand-primary'].dark)
  assert.notEqual(overrides['--dsw-alias-link'].dark, '#ff0000')
})

test('an edit with no source for the other mode repeats itself', () => {
  const prefs = { ...base, tokenOverrides: { '--dsw-alias-bg-layer-3': { dark: '#222222' } } }
  const { overrides } = resolveOverrides(prefs, true)
  assert.equal(overrides['--dsw-alias-bg-layer-3'].dark, '#222222')
  assert.equal(overrides['--dsw-alias-bg-layer-3'].light, '#222222')
})

test('custom CSS still wins over a token edited in the panel', () => {
  const prefs = {
    ...base,
    tokenOverrides: { '--dsw-alias-link': { light: '#ff0000', dark: '#ff0000' } },
    customCss: '--dsw-alias-link: #00ff00;',
  }
  const { overrides } = resolveOverrides(prefs, false)
  assert.deepEqual(overrides['--dsw-alias-link'], { light: '#00ff00', dark: '#00ff00' })
})

test('normalizeTokenOverrides keeps well-formed edits and drops the rest', () => {
  const kept = normalizeTokenOverrides({
    '--dsw-alias-link': { light: '#ff0000', dark: 'red' },
    '--dsw-alias-label-primary': { dark: '#111111' },
    '--not-a-dsh-token': { light: '#ff0000' },
    '--dsw-alias-link-x': { light: '#ff0000' },
    '--dsw-alias-bg-base': {},
    '--dsw-alias-border-l1': { light: '#000; } body { display: none' },
    '--dsw-alias-border-l2': null,
    '--dsw-alias-border-l3': { light: 12 },
  })
  assert.deepEqual(Object.keys(kept).sort(), ['--dsw-alias-label-primary', '--dsw-alias-link'])
  assert.deepEqual(kept['--dsw-alias-link'], { light: '#ff0000', dark: 'red' })
  // A single-mode entry stays single-mode: the other side keeps the host's value.
  assert.deepEqual(kept['--dsw-alias-label-primary'], { dark: '#111111' })
})

test('normalizeCssValue rejects anything that could escape the declaration', () => {
  assert.equal(normalizeCssValue('  #ff0000  '), '#ff0000')
  assert.equal(normalizeCssValue("'Cascadia Code', monospace"), "'Cascadia Code', monospace")
  for (const bad of ['', '   ', 'red; color: blue', 'a{}', '<script>', 'one\ntwo', 12, null]) {
    assert.equal(normalizeCssValue(bad), null, `${String(bad)} was accepted`)
  }
})

test('an exported theme carries token edits back through import', () => {
  const prefs = { ...base, tokenOverrides: { '--dsw-alias-link': { light: '#ff0000', dark: '#00ff00' } } }
  assert.deepEqual(parseTheme(exportTheme(prefs)).tokenOverrides, prefs.tokenOverrides)
})

test('an import cannot smuggle in a token this plugin does not verify', () => {
  const doc = JSON.stringify({
    $schema: 'dsh-theme-studio/v1',
    preferences: {
      tokenOverrides: { '--evil': { light: 'red' }, '--dsw-alias-link': { dark: '#00ff00' } },
    },
  })
  assert.deepEqual(Object.keys(parseTheme(doc).tokenOverrides), ['--dsw-alias-link'])
})
