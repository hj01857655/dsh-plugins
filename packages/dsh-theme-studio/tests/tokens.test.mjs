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

import {
  DENSITY_TOKENS, FONT_TOKENS, VERIFIED_TOKENS, accentTokens, isVerifiedToken, tint,
} from '../lib/tokens.js'
import { PRESETS, getPreset } from '../lib/themes.js'

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
  for (const map of Object.values(DENSITY_TOKENS)) maps.push(map)
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

test('DENSITY_TOKENS: only writes the verified content font size', () => {
  for (const map of Object.values(DENSITY_TOKENS)) {
    assert.deepEqual(Object.keys(map), ['--dsh-content-font-size'])
  }
  const sizes = Object.values(DENSITY_TOKENS).map((m) => parseInt(m['--dsh-content-font-size']))
  assert.deepEqual(sizes, [13, 14, 15])
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

test('PRESETS: darkTokens are only present when they differ from light', () => {
  for (const p of PRESETS) {
    if (p.darkTokens === undefined) continue
    assert.notEqual(
      p.darkTokens['--dsw-alias-state-business-primary'],
      p.tokens['--dsw-alias-state-business-primary'],
      `${p.id} declares a dark palette identical to its light one`,
    )
  }
})

test('getPreset: finds known ids, misses unknown ones', () => {
  assert.ok(getPreset('ocean') !== undefined)
  assert.ok(getPreset('nope') === undefined)
})
