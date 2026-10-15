/**
 * Tests for the preference → theme-override resolution.
 *
 * The whole point of this module is that it is pure: it produces the
 * `{ light, dark }` pairs `ctx.theme.overrideTokens` demands, with no DOM in
 * sight. The old version of this plugin wrote straight onto `document.body`, so
 * this "one value for whichever mode you are in" mistake could only be caught
 * by running the real UI — where it looked fine and silently produced an
 * illegible palette on the other scheme.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { overriddenTokenNames, resolveOverrides } from '../lib/apply.js'
import { DEFAULT_PREFERENCES } from '../lib/types.js'
import { PRESETS, getPreset } from '../lib/themes.js'
import { SURFACE_TOKEN_NAMES, VERIFIED_TOKENS } from '../lib/tokens.js'

const base = { ...DEFAULT_PREFERENCES }

/** Assert every value in a layer is a well-formed pair. */
function assertPairedShape(overrides) {
  for (const [name, modes] of Object.entries(overrides)) {
    assert.equal(typeof modes, 'object', `${name} is not an object`)
    assert.equal(typeof modes.light, 'string', `${name}.light is not a string`)
    assert.equal(typeof modes.dark, 'string', `${name}.dark is not a string`)
    assert.ok(modes.light.length > 0, `${name}.light is empty`)
    assert.ok(modes.dark.length > 0, `${name}.dark is empty`)
  }
}

// ─── The contract the API enforces ─────────────────────────────
test('every emitted value is a { light, dark } pair', () => {
  const cases = [
    base,
    { ...base, preset: 'nord' },
    { ...base, accentColor: '#123456' },
    { ...base, accentColor: '#123456', darkAccentColor: '#abcdef' },
    { ...base, darkAccentColor: '#abcdef' },
    { ...base, fontFamily: 'mono' },
    { ...base, customCss: '--dsw-alias-link: #00ff00;' },
  ]
  for (const prefs of cases) {
    assertPairedShape(resolveOverrides(prefs, false).overrides)
  }
})

test('no emitted value is ever a bare string', () => {
  // overrideTokens throws a teaching error for a bare string; this guards the
  // shape before it can reach the service.
  const { overrides } = resolveOverrides(
    { ...base, preset: 'dracula', accentColor: '#112233', customCss: '--dsw-alias-link: red;' },
    true,
  )
  for (const modes of Object.values(overrides)) {
    assert.equal(typeof modes, 'object')
  }
})

test('every emitted token name is a verified dsh token', () => {
  const verified = new Set(VERIFIED_TOKENS)
  const names = overriddenTokenNames({
    ...base,
    preset: 'tokyo-night',
    accentColor: '#123456',
    darkAccentColor: '#abcdef',
    fontFamily: 'serif',
    customCss: '--dsw-alias-link: #00ff00;',
  })
  const unverified = names.filter((n) => !verified.has(n))
  assert.deepEqual(unverified, [], `unverified tokens: ${unverified.join(', ')}`)
})

// ─── Presets ───────────────────────────────────────────────────
test('every preset emits surface and accent tokens on BOTH sides', () => {
  for (const preset of PRESETS) {
    const { overrides } = resolveOverrides({ ...base, preset: preset.id }, false)
    for (const [name, lightValue] of Object.entries(preset.tokens)) {
      assert.equal(overrides[name].light, lightValue, `${preset.id}: ${name} lost its light value`)
      assert.equal(
        overrides[name].dark, preset.darkTokens[name],
        `${preset.id}: ${name} ignored its dark palette`,
      )
    }
    // The whole point of the surface family: without it a preset only recolors
    // buttons and links and the app body never changes appearance.
    for (const name of SURFACE_TOKEN_NAMES) {
      assert.ok(preset.tokens[name] !== undefined, `${preset.id} is missing surface token ${name}`)
    }
  }
})

test('a preset WITH a dark palette uses it on the dark side', () => {
  const preset = PRESETS.find((p) => p.darkTokens !== undefined)
  assert.ok(preset !== undefined, 'expected at least one dark-aware preset')
  const { overrides } = resolveOverrides({ ...base, preset: preset.id }, true)
  for (const [name, darkValue] of Object.entries(preset.darkTokens)) {
    assert.equal(overrides[name].dark, darkValue, `${name} ignored its dark palette`)
    assert.equal(overrides[name].light, preset.tokens[name], `${name} lost its light value`)
  }
})

test('no preset selected means no preset tokens at all', () => {
  const { overrides } = resolveOverrides({ ...base, preset: null, fontFamily: 'system' }, false)
  assert.equal(overrides['--dsw-alias-state-business-primary'], undefined)
})

// ─── Accent precedence ─────────────────────────────────────────
test('an explicit accent overrides the preset accent, per side', () => {
  const { overrides } = resolveOverrides({
    ...base, preset: 'forest', accentColor: '#101010', darkAccentColor: '#f0f0f0',
  }, true)
  assert.equal(overrides['--dsw-alias-state-business-primary'].light, '#101010')
  assert.equal(overrides['--dsw-alias-state-business-primary'].dark, '#f0f0f0')
})

test('with no dark accent, the light accent fills both sides', () => {
  const { overrides } = resolveOverrides({ ...base, accentColor: '#88c0d0' }, true)
  assert.equal(overrides['--dsw-alias-state-business-primary'].light, '#88c0d0')
  assert.equal(overrides['--dsw-alias-state-business-primary'].dark, '#88c0d0')
})

test('a dark-only accent leaves the preset light value in place', () => {
  const { overrides } = resolveOverrides({ ...base, preset: 'nord', darkAccentColor: '#ff0000' }, true)
  assert.equal(
    overrides['--dsw-alias-state-business-primary'].light,
    getPreset('nord').tokens['--dsw-alias-state-business-primary'],
  )
  assert.equal(overrides['--dsw-alias-state-business-primary'].dark, '#ff0000')
})

test('the accent drives the whole family, not one token', () => {
  const { overrides } = resolveOverrides({ ...base, accentColor: '#123456' }, false)
  for (const name of [
    '--dsw-alias-state-business-primary',
    '--dsw-alias-brand-primary',
    '--dsw-alias-link',
    '--dsw-alias-button-primary-fill',
  ]) {
    assert.equal(overrides[name].light, '#123456', `${name} did not follow the accent`)
  }
})

// ─── Contrast guard ────────────────────────────────────────────
test('the contrast guard may only change the dark side', () => {
  const { overrides } = resolveOverrides({ ...base, accentColor: '#050505' }, true)
  assert.equal(overrides['--dsw-alias-state-business-primary'].light, '#050505')
  assert.notEqual(overrides['--dsw-alias-state-business-primary'].dark, '#050505')
})

test('contrastAdjusted is reported only when the guard fired', () => {
  assert.equal(resolveOverrides({ ...base, accentColor: '#88c0d0' }, true).contrastAdjusted, false)
  assert.equal(resolveOverrides({ ...base, accentColor: '#050505' }, true).contrastAdjusted, true)
  // No accent at all cannot be adjusted.
  assert.equal(resolveOverrides({ ...base }, true).contrastAdjusted, false)
})

// ─── Fonts ─────────────────────────────────────────────────────
test('font family is mode-independent, so both sides are equal', () => {
  const { overrides } = resolveOverrides({ ...base, fontFamily: 'serif' }, false)
  for (const name of ['--dsw-font-family', '--dsw-font-mono']) {
    assert.equal(overrides[name].light, overrides[name].dark, `${name} sides differ`)
  }
})

// ─── Custom CSS ────────────────────────────────────────────────
test('custom CSS wins over everything else, per token', () => {
  const { overrides } = resolveOverrides({
    ...base, preset: 'forest', accentColor: '#123456', customCss: '--dsw-alias-brand-primary: #0000ff;',
  }, false)
  assert.equal(overrides['--dsw-alias-brand-primary'].light, '#0000ff')
  assert.equal(overrides['--dsw-alias-brand-primary'].dark, '#0000ff')
})

test('custom CSS outside the dsh namespaces never reaches the layer', () => {
  const { overrides } = resolveOverrides(
    { ...base, customCss: '--evil: red;\nposition: fixed;' },
    false,
  )
  assert.equal(overrides['--evil'], undefined)
  assert.equal(overrides['position'], undefined)
})

test('custom CSS cannot smuggle in an extra rule', () => {
  const { overrides } = resolveOverrides(
    { ...base, customCss: '--dsw-alias-link: red; } body { display: none;' },
    false,
  )
  const value = overrides['--dsw-alias-link']?.light ?? ''
  assert.ok(!value.includes('}'), `brace escaped: ${value}`)
  assert.ok(!value.includes('{'), `brace escaped: ${value}`)
})

// ─── Displayed accent ──────────────────────────────────────────
test('the reported accent follows the host mode', () => {
  const prefs = { ...base, accentColor: '#111111', darkAccentColor: '#eeeeee' }
  assert.equal(resolveOverrides(prefs, false).accent.light, '#111111')
  assert.equal(resolveOverrides(prefs, true).accent.dark, '#eeeeee')
})

test('default preferences produce a COMPLETELY empty override set', () => {
  // Installing the plugin and changing nothing must not write a single token.
  // An earlier version asserted this by filtering to names starting with
  // '--dsw-alias-state', which conveniently excluded --dsh-content-font-size
  // and --dsw-font-family — the two tokens it actually wrote, and the reason the
  // official Appearance font-size stepper appeared broken. Assert the whole set.
  const { overrides } = resolveOverrides(base, false)
  assert.deepEqual(
    Object.keys(overrides), [],
    `default preferences must not override anything, got: ${Object.keys(overrides).join(', ')}`,
  )
})

test('default preferences never touch the host font-size axis', () => {
  // --dsh-content-font-size belongs to the official Appearance row. Overriding
  // it at defaults would make that control silently inert.
  const { overrides } = resolveOverrides(base, false)
  assert.equal(overrides['--dsh-content-font-size'], undefined)
})

test("the legacy 'comfortable' density introduces no override either", () => {
  // 'comfortable' meant 14px in 0.5.0 and means "leave the host alone" now, so a
  // stored value from an older version must not resurrect the override.
  const { overrides } = resolveOverrides({ ...base, density: 'comfortable' }, false)
  assert.equal(overrides['--dsh-content-font-size'], undefined)
})

test('density never reaches the override layer, at any value', () => {
  // Regression guard for the whole 0.5.x line: density was once a token, then a
  // shadowing override, and both were wrong. It is host state now, written
  // through ctx.theme.setFontSize.
  for (const density of ['compact', 'comfortable', 'spacious', 'default', 'gigantic']) {
    const { overrides } = resolveOverrides({ ...base, density }, false)
    assert.equal(
      overrides['--dsh-content-font-size'], undefined,
      `density '${density}' leaked into the override layer`,
    )
  }
})

test('the host font family is left alone unless an alternative is chosen', () => {
  // dsh ships its own platform-appropriate stack; "System" means "keep it".
  const { overrides } = resolveOverrides({ ...base, fontFamily: 'system' }, false)
  assert.equal(overrides['--dsw-font-family'], undefined)
  assert.equal(overrides['--dsw-font-mono'], undefined)
})

test('choosing an alternative font family does write both family tokens', () => {
  for (const fontFamily of ['mono', 'serif']) {
    const { overrides } = resolveOverrides({ ...base, fontFamily }, false)
    assert.ok(overrides['--dsw-font-family'] !== undefined, `${fontFamily} missed --dsw-font-family`)
    assert.ok(overrides['--dsw-font-mono'] !== undefined, `${fontFamily} missed --dsw-font-mono`)
  }
})

test('a preset or accent alone does not drag in unrelated axes', () => {
  const { overrides } = resolveOverrides({ ...base, preset: 'nord', accentColor: '#123456' }, false)
  assert.equal(overrides['--dsh-content-font-size'], undefined)
  assert.equal(overrides['--dsw-font-family'], undefined)
})
