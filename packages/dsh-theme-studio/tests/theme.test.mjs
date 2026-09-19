import { test } from 'node:test'
import assert from 'node:assert/strict'

import { PRESETS, DENSITY_TOKENS, RADIUS_TOKENS, FONT_TOKENS, ANIMATION_ON_TOKENS, ANIMATION_OFF_TOKENS, getPreset } from '../lib/themes.js'
import { DEFAULT_PREFERENCES } from '../lib/types.js'
import { ensureDarkContrast, exportTheme, hexToRgb, lighten, luminance, parseTheme } from '../lib/io.js'

test('PRESETS: each has unique id and non-empty tokens', () => {
  const ids = new Set()
  for (const p of PRESETS) {
    assert.ok(p.id.length > 0, 'preset id must be non-empty')
    assert.ok(!ids.has(p.id), `duplicate preset id: ${p.id}`)
    ids.add(p.id)
    assert.ok(Object.keys(p.tokens).length > 0, `preset ${p.id} has no tokens`)
    assert.ok(p.tokens['--accent'] !== undefined, `preset ${p.id} must define --accent`)
  }
  assert.ok(PRESETS.length >= 10, 'expected at least 10 presets')
})

test('PRESETS: darkTokens override --accent only where intended', () => {
  const withDark = PRESETS.filter((p) => p.darkTokens !== undefined)
  assert.ok(withDark.length >= 4, 'expected at least 4 presets with dark palettes')
  for (const p of withDark) {
    assert.ok(
      Object.keys(p.darkTokens).length > 0,
      `${p.id} declares an empty darkTokens map`,
    )
  }
})

test('ANIMATION tokens: off disables both transitions', () => {
  assert.equal(ANIMATION_OFF_TOKENS['--dsh-transition-fast'], '0s')
  assert.equal(ANIMATION_OFF_TOKENS['--dsh-transition-normal'], '0s')
  assert.notEqual(ANIMATION_ON_TOKENS['--dsh-transition-fast'], '0s')
})

test('getPreset: returns matching preset or undefined', () => {
  assert.ok(getPreset('ocean') !== undefined)
  assert.ok(getPreset('nord') !== undefined)
  assert.ok(getPreset('nonexistent') === undefined)
})

test('DENSITY_TOKENS: compact < comfortable < spacious font size', () => {
  const c = parseInt(DENSITY_TOKENS.compact['--dsh-content-font-size'])
  const m = parseInt(DENSITY_TOKENS.comfortable['--dsh-content-font-size'])
  const s = parseInt(DENSITY_TOKENS.spacious['--dsh-content-font-size'])
  assert.ok(c < m && m < s, 'font size must increase with density')
})

test('RADIUS_TOKENS: sharp < rounded < soft radius', () => {
  const s = parseInt(RADIUS_TOKENS.sharp['--dsh-radius-medium'])
  const r = parseInt(RADIUS_TOKENS.rounded['--dsh-radius-medium'])
  const f = parseInt(RADIUS_TOKENS.soft['--dsh-radius-medium'])
  assert.ok(s < r && r < f, 'radius must increase with softness')
})

test('FONT_TOKENS: each family defines --dsh-font-family', () => {
  for (const [key, tokens] of Object.entries(FONT_TOKENS)) {
    assert.ok(tokens['--dsh-font-family'] !== undefined, `font ${key} missing --dsh-font-family`)
  }
})

test('DEFAULT_PREFERENCES: sensible defaults', () => {
  assert.equal(DEFAULT_PREFERENCES.preset, null)
  assert.equal(DEFAULT_PREFERENCES.accentColor, null)
  assert.equal(DEFAULT_PREFERENCES.darkAccentColor, null)
  assert.equal(DEFAULT_PREFERENCES.density, 'comfortable')
  assert.equal(DEFAULT_PREFERENCES.radius, 'rounded')
  assert.equal(DEFAULT_PREFERENCES.fontFamily, 'system')
  assert.equal(DEFAULT_PREFERENCES.animations, true)
  assert.equal(DEFAULT_PREFERENCES.customCss, '')
})

test('customCss parsing: --property: value; lines are parseable', () => {
  const css = '--accent: #ff0000;\n--border: 1px solid red;'
  const lines = css.split('\n')
  const parsed = []
  for (const line of lines) {
    const match = line.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*;?\s*$/)
    if (match !== null) parsed.push([match[1], match[2]])
  }
  assert.deepEqual(parsed, [
    ['--accent', '#ff0000'],
    ['--border', '1px solid red'],
  ])
})
