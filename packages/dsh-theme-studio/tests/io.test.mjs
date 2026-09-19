import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  darken, ensureDarkContrast, exportTheme, hexToRgb, lighten, luminance, parseTheme, rgbToHex,
} from '../lib/io.js'
import { DEFAULT_PREFERENCES, normalizePreferences } from '../lib/types.js'

test('exportTheme → parseTheme: round-trips every field', () => {
  const prefs = {
    preset: 'nord',
    accentColor: '#5e81ac',
    darkAccentColor: '#88c0d0',
    density: 'compact',
    fontFamily: 'mono',
    animations: false,
    customCss: '--dsw-alias-label-primary: #111111;',
  }
  const json = exportTheme(prefs, 'my theme')
  const parsed = parseTheme(json)
  assert.deepEqual(parsed, prefs)
})

test('exportTheme: envelope carries the schema tag and name', () => {
  const doc = JSON.parse(exportTheme(DEFAULT_PREFERENCES, 'x'))
  assert.equal(doc.$schema, 'dsh-theme-studio/v1')
  assert.equal(doc.name, 'x')
  assert.ok(typeof doc.exportedAt === 'string')
})

test('parseTheme: accepts a bare preferences object without the envelope', () => {
  const parsed = parseTheme('{"preset":"ocean","density":"spacious"}')
  assert.equal(parsed.preset, 'ocean')
  assert.equal(parsed.density, 'spacious')
  // Unspecified fields fall back to defaults rather than undefined.
  assert.equal(parsed.fontFamily, DEFAULT_PREFERENCES.fontFamily)
  assert.equal(parsed.animations, DEFAULT_PREFERENCES.animations)
})

test('parseTheme: invalid JSON returns null (a real import error)', () => {
  assert.equal(parseTheme('not json at all'), null)
  assert.equal(parseTheme(''), null)
  assert.equal(parseTheme('[]'), null)
  assert.equal(parseTheme('"a string"'), null)
  assert.equal(parseTheme('null'), null)
})

test('parseTheme: rejects out-of-range enum values, keeps valid ones', () => {
  const parsed = parseTheme('{"density":"gigantic","fontFamily":"comic"}')
  assert.equal(parsed.density, 'default')
  assert.equal(parsed.fontFamily, 'system')
})

test("parseTheme: migrates a legacy 'comfortable' density to 'default'", () => {
  // 'comfortable' used to mean 14px; it now means "leave the host alone", so an
  // exported theme from an older version must not resurrect that override.
  const parsed = parseTheme('{"density":"comfortable"}')
  assert.equal(parsed.density, 'default')
})

test('parseTheme accepts the current density values', () => {
  assert.equal(parseTheme('{"density":"compact"}').density, 'compact')
  assert.equal(parseTheme('{"density":"spacious"}').density, 'spacious')
  assert.equal(parseTheme('{"density":"default"}').density, 'default')
})

test('parseTheme: malformed colors become null instead of reaching the DOM', () => {
  const parsed = parseTheme('{"accentColor":"javascript:alert(1)","darkAccentColor":"red"}')
  assert.equal(parsed.accentColor, null)
  assert.equal(parsed.darkAccentColor, null)
})

test('parseTheme: accepts 3- and 6-digit hex', () => {
  assert.equal(parseTheme('{"accentColor":"#abc"}').accentColor, '#abc')
  assert.equal(parseTheme('{"accentColor":"#aabbcc"}').accentColor, '#aabbcc')
})

test('parseTheme: preserves customCss verbatim', () => {
  const css = '--a: 1;\n--b: 2;'
  assert.equal(parseTheme(JSON.stringify({ customCss: css })).customCss, css)
})

// ─── The two entry points must gate identically ────────────────
//
// They previously did not: the load path merged with no enum validation while
// the import path kept its own whitelist, so a stored `density: 'gigantic'`
// survived and left the panel's segmented control with nothing selected. These
// tests pin the invariant that both paths produce a representable value.

test('both entry points reject an unknown density identically', () => {
  const raw = { density: 'gigantic' }
  const viaImport = parseTheme(JSON.stringify(raw))
  const viaLoad = normalizePreferences(raw)
  assert.equal(viaImport.density, 'default')
  assert.equal(viaLoad.density, viaImport.density)
})

test('both entry points reject an unknown font family identically', () => {
  const raw = { fontFamily: 'comic' }
  assert.equal(parseTheme(JSON.stringify(raw)).fontFamily, 'system')
  assert.equal(normalizePreferences(raw).fontFamily, 'system')
})

test('every density the plugin can emit is one normalizePreferences accepts', () => {
  // Round-trip: nothing the panel can produce may be altered by the gate.
  for (const density of ['default', 'compact', 'spacious']) {
    assert.equal(normalizePreferences({ density }).density, density)
    assert.equal(parseTheme(JSON.stringify({ density })).density, density)
  }
})

test('every font family the plugin can emit round-trips unchanged', () => {
  for (const fontFamily of ['system', 'mono', 'serif']) {
    assert.equal(normalizePreferences({ fontFamily }).fontFamily, fontFamily)
    assert.equal(parseTheme(JSON.stringify({ fontFamily })).fontFamily, fontFamily)
  }
})

test('the gate is idempotent — normalizing a normalized set changes nothing', () => {
  const once = normalizePreferences({ density: 'comfortable', fontFamily: 'comic' })
  assert.deepEqual(normalizePreferences(once), once)
})

test('a hand-edited file cannot smuggle a bad color past either path', () => {
  // The stored path had no color check at all before this; a value like
  // `javascript:alert(1)` must not reach overrideTokens from either side.
  const raw = { accentColor: 'javascript:alert(1)', darkAccentColor: 'red' }
  for (const result of [parseTheme(JSON.stringify(raw)), normalizePreferences(raw)]) {
    assert.equal(result.accentColor, null)
    assert.equal(result.darkAccentColor, null)
  }
})

test('non-string types in a hand-edited file fall back rather than propagate', () => {
  const raw = {
    density: 42,
    fontFamily: null,
    animations: 'yes',
    customCss: { nested: true },
    preset: 7,
  }
  for (const result of [parseTheme(JSON.stringify(raw)), normalizePreferences(raw)]) {
    assert.equal(result.density, DEFAULT_PREFERENCES.density)
    assert.equal(result.fontFamily, DEFAULT_PREFERENCES.fontFamily)
    assert.equal(result.animations, DEFAULT_PREFERENCES.animations)
    assert.equal(result.customCss, DEFAULT_PREFERENCES.customCss)
    assert.equal(result.preset, null)
  }
})

// ─── Color math ────────────────────────────────────────────────
test('hexToRgb: parses shorthand and expands it correctly', () => {
  assert.deepEqual(hexToRgb('#fff'), [255, 255, 255])
  assert.deepEqual(hexToRgb('#000'), [0, 0, 0])
  assert.deepEqual(hexToRgb('#abc'), [0xaa, 0xbb, 0xcc])
  assert.deepEqual(hexToRgb('#123456'), [0x12, 0x34, 0x56])
  assert.equal(hexToRgb('nope'), null)
})

test('rgbToHex: clamps out-of-range channels', () => {
  assert.equal(rgbToHex(300, -10, 128), '#ff0080')
})

test('luminance: white is 1, black is 0, and ordering is monotonic', () => {
  assert.equal(luminance('#000000'), 0)
  assert.equal(Math.round(luminance('#ffffff') * 100) / 100, 1)
  assert.ok(luminance('#333333') < luminance('#999999'))
})

test('lighten/darken: move toward the ends and reach them at amount=1', () => {
  assert.equal(lighten('#000000', 1), '#ffffff')
  assert.equal(darken('#ffffff', 1), '#000000')
  assert.ok(luminance(lighten('#444444', 0.3)) > luminance('#444444'))
  assert.ok(luminance(darken('#444444', 0.3)) < luminance('#444444'))
})

test('lighten/darken: leave unparseable input untouched', () => {
  assert.equal(lighten('not-a-color', 0.5), 'not-a-color')
  assert.equal(darken('not-a-color', 0.5), 'not-a-color')
})

// ─── Dark-mode contrast guard ──────────────────────────────────
test('ensureDarkContrast: leaves a bright accent alone', () => {
  const result = ensureDarkContrast('#88c0d0')
  assert.equal(result.adjusted, false)
  assert.equal(result.color, '#88c0d0')
})

test('ensureDarkContrast: lightens a too-dark accent and reports it', () => {
  const result = ensureDarkContrast('#0a0a0a')
  assert.equal(result.adjusted, true)
  assert.ok(luminance(result.color) >= 0.18, 'adjusted color must clear the floor')
  assert.notEqual(result.color, '#0a0a0a')
})

test('ensureDarkContrast: the raised color is a real, parseable hex', () => {
  const result = ensureDarkContrast('#101010')
  assert.ok(hexToRgb(result.color) !== null, 'must stay a valid color')
})

test('ensureDarkContrast: unparseable input is returned unchanged and unadjusted', () => {
  const result = ensureDarkContrast('garbage')
  assert.equal(result.adjusted, false)
  assert.equal(result.color, 'garbage')
})
