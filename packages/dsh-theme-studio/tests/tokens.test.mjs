/**
 * The guard that stops this plugin from writing token names dsh doesn't have.
 *
 * The 0.1.x/0.2.x versions shipped `--accent`, `--border`, `--dsh-radius-medium`
 * and `--dsh-transition-fast`. None exist in dsh, so the panel changed nothing
 * while its own preview (reading the same invented names) looked right. These
 * tests fail if any such name comes back.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FONT_SIZE_MAX, FONT_SIZE_MIN } from '@deepseek-ai/dsh-client-ui-theme'
import {
  DENSITY_FONT_SIZE, FONT_TOKENS, SURFACE_TOKEN_NAMES, TEXT_FONT_SIZE_MAX, TEXT_FONT_SIZE_MIN,
  VERIFIED_TOKENS, accentTokens, densityForFontSize, isVerifiedToken, tint,
} from '../lib/tokens.js'
import { PRESETS, getPreset } from '../lib/themes.js'
import { DEFAULT_PREFERENCES } from '../lib/types.js'
import { overriddenTokenNames } from '../lib/apply.js'

/** Names an earlier version invented; they must never reappear. */
const INVENTED = [
  '--accent',
  '--accent-hover',
  '--border',
  '--bg-secondary',
  '--text-primary',
  '--dsh-spacing-unit',
  '--dsh-radius-small',
  '--dsh-radius-medium',
  '--dsh-radius-large',
  '--dsh-font-family',
  '--dsh-transition-fast',
  '--dsh-transition-normal',
  '--dsw-alias-state-business-secondary',
]

function everyTokenName() {
  const names = new Set()
  const maps = [accentTokens('#123456')]
  for (const map of Object.values(FONT_TOKENS)) maps.push(map)
  for (const map of maps) {
    for (const name of Object.keys(map)) names.add(name)
  }
  for (const preset of PRESETS) {
    for (const name of Object.keys(preset.tokens)) names.add(name)
    if (preset.darkTokens !== undefined) {
      for (const name of Object.keys(preset.darkTokens)) names.add(name)
    }
  }
  return [...names]
}

test('every token name the override layer can contain is verified', () => {
  // This is the guard for the write path: `ctx.theme.overrideTokens` validates
  // the SHAPE of a value but not its name, so an unverified name would be
  // accepted and silently do nothing. Check the union over a spread of
  // preference combinations rather than a single sample.
  const combos = []
  for (const preset of PRESETS.map((p) => p.id).concat([null])) {
    combos.push({ ...DEFAULT_PREFERENCES, preset })
  }
  for (const fontFamily of ['system', 'mono', 'serif']) {
    combos.push({ ...DEFAULT_PREFERENCES, fontFamily })
  }
  for (const density of ['compact', 'comfortable', 'spacious']) {
    combos.push({ ...DEFAULT_PREFERENCES, density })
  }
  combos.push({ ...DEFAULT_PREFERENCES, accentColor: '#123456', darkAccentColor: '#abcdef' })
  combos.push({ ...DEFAULT_PREFERENCES, customCss: '--dsw-alias-link: #0f0;\n--dsh-content-font-size: 15px;' })

  const seen = new Set()
  for (const prefs of combos) {
    for (const name of overriddenTokenNames(prefs)) seen.add(name)
  }
  assert.ok(seen.size > 10, `expected a broad token set, saw ${seen.size}`)

  const unverified = [...seen].filter((n) => !isVerifiedToken(n))
  assert.deepEqual(
    unverified, [],
    `the override layer can emit unverified tokens: ${unverified.join(', ')}`,
  )
})

test('the override layer never emits an invented token name', () => {
  const emitted = new Set()
  for (const preset of PRESETS.map((p) => p.id).concat([null])) {
    for (const name of overriddenTokenNames({ ...DEFAULT_PREFERENCES, preset })) emitted.add(name)
  }
  const present = [...emitted].filter((n) => INVENTED.includes(n))
  assert.deepEqual(present, [], `invented tokens reached the layer: ${present.join(', ')}`)
})

test('every token written by this plugin is a verified dsh token', () => {
  const unverified = everyTokenName().filter((n) => !isVerifiedToken(n))
  assert.deepEqual(
    unverified, [],
    `these tokens are not in VERIFIED_TOKENS: ${unverified.join(', ')}`,
  )
})

test('no invented token name comes back', () => {
  const present = everyTokenName().filter((n) => INVENTED.includes(n))
  assert.deepEqual(present, [], `invented tokens reappeared: ${present.join(', ')}`)
})

test('VERIFIED_TOKENS contains no plain --accent/--border style names', () => {
  for (const name of VERIFIED_TOKENS) {
    assert.ok(
      name.startsWith('--dsw-') || name.startsWith('--dsh-'),
      `${name} is not in a dsh namespace`,
    )
    assert.ok(name.length > 8, `${name} looks truncated`)
  }
})

test('VERIFIED_TOKENS has no duplicates', () => {
  assert.equal(new Set(VERIFIED_TOKENS).size, VERIFIED_TOKENS.length)
})

test('accentTokens: lights up the whole accent family from one color', () => {
  const tokens = accentTokens('#4d6bfe')
  // The single most visible one: the primary button.
  assert.equal(tokens['--dsw-alias-button-primary-fill'], '#4d6bfe')
  assert.equal(tokens['--dsw-alias-state-business-primary'], '#4d6bfe')
  assert.equal(tokens['--dsw-alias-link'], '#4d6bfe')
  // A hover tint must be derived from the accent, not a fixed gray.
  const hover = tokens['--dsw-alias-interactive-bg-hover-accent']
  assert.ok(hover.startsWith('rgba(77, 107, 254'), `hover tint not derived: ${hover}`)
})

test('accentTokens: tolerates 3-digit hex and rejects junk without throwing', () => {
  assert.equal(accentTokens('#abc')['--dsw-alias-link'], '#abc')
  assert.equal(accentTokens('garbage')['--dsw-alias-link'], 'garbage')
})

test('tint: converts hex to rgba at the requested alpha', () => {
  assert.equal(tint('#000000', 0.5), 'rgba(0, 0, 0, 0.5)')
  assert.equal(tint('#ffffff', 0.1), 'rgba(255, 255, 255, 0.1)')
  assert.equal(tint('#abc', 0.2), 'rgba(170, 187, 204, 0.2)')
})

test('the mirrored text-size range matches the host package', () => {
  // The panel guards its reset with these two numbers, and mirrors them rather
  // than importing them so the browser bundle does not pull in the theme
  // service. This test is the seam: if dsh widens or narrows the text role, the
  // guard here fails before the plugin throws at reset time. The host's root
  // entry exports these for the text role (`FONT_SIZE_SPECS.text` in source).
  assert.equal(TEXT_FONT_SIZE_MIN, FONT_SIZE_MIN)
  assert.equal(TEXT_FONT_SIZE_MAX, FONT_SIZE_MAX)
})

test('DENSITY_FONT_SIZE: every preset is writable through setFontSize', () => {
  // setFontSize throws outside the text role's range, and a preset outside it
  // would be unreachable or clamped — the button would lie about what it
  // applied. The row covers the middle of the range on purpose; the official
  // Appearance stepper still addresses every integer.
  for (const [name, px] of Object.entries(DENSITY_FONT_SIZE)) {
    assert.ok(Number.isInteger(px), `${name} is not an integer`)
    assert.ok(
      px >= TEXT_FONT_SIZE_MIN && px <= TEXT_FONT_SIZE_MAX,
      `${name} is outside the host's ${TEXT_FONT_SIZE_MIN}..${TEXT_FONT_SIZE_MAX} text range: ${px}`,
    )
  }
  assert.ok(Object.keys(DENSITY_FONT_SIZE).length >= 3, 'expected at least three densities')
})

test('DENSITY_FONT_SIZE: the content font size is NOT a token this plugin writes', () => {
  // The font size belongs to the official Appearance row (via setFontSize). An
  // override layer sits on top of the theme snapshot, so writing it here would
  // hide the official setting instead of changing it, leaving the stepper
  // showing a number the UI no longer rendered.
  const written = new Set()
  for (const preset of PRESETS.map((p) => p.id).concat([null])) {
    for (const name of overriddenTokenNames({ ...DEFAULT_PREFERENCES, preset })) written.add(name)
  }
  for (const fontFamily of ['system', 'mono', 'serif']) {
    for (const name of overriddenTokenNames({ ...DEFAULT_PREFERENCES, fontFamily })) written.add(name)
  }
  for (const density of Object.keys(DENSITY_FONT_SIZE)) {
    for (const name of overriddenTokenNames({ ...DEFAULT_PREFERENCES, density })) written.add(name)
  }
  assert.ok(
    !written.has('--dsh-content-font-size'),
    'the override layer must never contain the official font-size axis',
  )
})

test('densityForFontSize: matches each preset, and reports a miss as null', () => {
  for (const [name, px] of Object.entries(DENSITY_FONT_SIZE)) {
    assert.equal(densityForFontSize(px), name, `${px}px should map to ${name}`)
  }
  // Every integer the host accepts is reachable in the official stepper, and
  // only six of them are presets: a size between presets must select nothing
  // rather than silently highlighting a neighbour.
  const presetSizes = new Set(Object.values(DENSITY_FONT_SIZE))
  for (let px = TEXT_FONT_SIZE_MIN; px <= TEXT_FONT_SIZE_MAX; px += 1) {
    const matched = densityForFontSize(px)
    if (presetSizes.has(px)) assert.ok(matched !== null, `${px}px should match a preset`)
    else assert.equal(matched, null, `${px}px should match nothing`)
  }
})

test('FONT_TOKENS: no entry for the host default font', () => {
  // dsh ships its own platform-appropriate stack; 'system' means "keep it".
  assert.equal(FONT_TOKENS['system'], undefined)
  assert.deepEqual(Object.keys(FONT_TOKENS).sort(), ['mono', 'serif'])
})

test('FONT_TOKENS: every family sets both family and mono', () => {
  for (const [key, map] of Object.entries(FONT_TOKENS)) {
    assert.ok(map['--dsw-font-family'] !== undefined, `${key} missing --dsw-font-family`)
    assert.ok(map['--dsw-font-mono'] !== undefined, `${key} missing --dsw-font-mono`)
  }
})

// ─── Presets ───────────────────────────────────────────────────
test('PRESETS: unique ids, real accents, at least 10', () => {
  const ids = new Set()
  for (const p of PRESETS) {
    assert.ok(!ids.has(p.id), `duplicate preset id ${p.id}`)
    ids.add(p.id)
    assert.ok(
      p.tokens['--dsw-alias-state-business-primary'] !== undefined,
      `${p.id} has no accent`,
    )
  }
  assert.ok(PRESETS.length >= 10, `expected >= 10 presets, got ${PRESETS.length}`)
})

test('PRESETS: darkTokens differ from light in at least one token', () => {
  // darkTokens is always present now (surfaceTokens derives per-mode values),
  // so the old "accent must differ" check no longer applies — a same-accent
  // preset like Ocean still darkens its surfaces. What must stay true is the
  // original intent: a dark palette that is byte-identical to light is a
  // no-op that would still show the "adapts to dark" badge.
  for (const p of PRESETS) {
    assert.notDeepEqual(
      p.darkTokens, p.tokens,
      `${p.id} declares a dark palette identical to its light one`,
    )
    assert.equal(
      p.darkTokens['--dsw-alias-bg-base'] !== undefined, true,
      `${p.id} dark palette is missing surface tokens`,
    )
  }
})

test('PRESETS: every preset covers the whole surface family in both modes', () => {
  // A preset that leaves a surface name out of its map falls through to
  // surfaceTokens(), which tints that name with the accent. For the derived
  // presets that is the intent; for a hand-picked palette it is a silent leak.
  // One Dark shipped with eleven of the nineteen names listed, so a blue
  // caption, code block and scrollbar appeared against a neutral canvas.
  // Listing a name explicitly is the only way to say "keep the host value".
  for (const preset of PRESETS) {
    for (const side of ['tokens', 'darkTokens']) {
      const palette = preset[side]
      assert.ok(palette !== undefined, `${preset.id} has no ${side}`)
      const missing = SURFACE_TOKEN_NAMES.filter((name) => palette[name] === undefined)
      assert.deepEqual(
        missing, [],
        `${preset.id}.${side} leaves ${missing.length} surface token(s) to the accent: ${missing.join(', ')}`,
      )
    }
  }
})

test('getPreset: finds known ids, misses unknown ones', () => {
  assert.ok(getPreset('ocean') !== undefined)
  assert.ok(getPreset('nope') === undefined)
})
