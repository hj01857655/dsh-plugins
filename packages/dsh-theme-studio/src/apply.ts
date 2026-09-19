/**
 * Resolving preferences into dsh's theme-override wire format.
 *
 * This module is deliberately pure: it turns a preference set into the
 * `{ light, dark }` token pairs that `ctx.theme.overrideTokens` accepts, and
 * never touches the DOM.
 *
 * The split matters because the override API requires BOTH palette values per
 * token. The natural place to get that wrong — picking one value for whichever
 * mode you happen to be in — is exactly what a pure function can be checked for
 * in tests, and what the old DOM-writing version did implicitly.
 *
 * The previous version wrote custom properties straight onto `document.body`.
 * That appeared to work, because dsh's presenter only retracts variables it
 * wrote itself, but it forfeited the stacking order, the paired light/dark
 * values and the dispose story, and left two theme plugins able to overwrite
 * each other with no way to say who won.
 *
 * One deliberate consequence of using a layer rather than a writer: overriding
 * `--dsh-content-font-size` SHADOWS the Appearance font-size stepper instead of
 * changing the stored setting (`ctx.theme.setFontSize` would have mutated the
 * user's durable host settings, and a later reset could not have restored their
 * original value). While a density is chosen here, the official stepper appears
 * inert; removing the layer restores it exactly. The panel says so.
 *
 * @module apply
 */

import type { ThemePreferences } from './types.js'
import { DENSITY_TOKENS, FONT_TOKENS, accentTokens } from './tokens.js'
import { getPreset } from './themes.js'
import { ensureDarkContrast, parseCustomCss } from './io.js'

/** One token's value in each palette — the shape `overrideTokens` demands. */
export interface TokenModes {
  light: string
  dark: string
}

/** Token name → paired values; the `ctx.theme.overrideTokens` argument. */
export type TokenOverrides = Record<string, TokenModes>

/** Result of resolving preferences into an override layer. */
export interface ResolvedTheme {
  overrides: TokenOverrides
  /** True when the dark-mode contrast guard changed the chosen accent. */
  contrastAdjusted: boolean
  /** The accent in effect per mode, for the panel to display. */
  accent: { light: string | null; dark: string | null }
}

/**
 * Resolve the accent color into a light/dark pair.
 *
 * Each side is guarded independently: a color that reads well on white can sink
 * into a dark surface, and a dark-mode accent can be too pale on white. The
 * guard only ever touches the dark side, because that is the case it was
 * measured for.
 */
function resolveAccentPair(prefs: ThemePreferences): {
  light: string | null
  dark: string | null
  adjusted: boolean
} {
  const lightRaw = prefs.accentColor
  const darkRaw = prefs.darkAccentColor ?? prefs.accentColor

  const light = lightRaw !== null && lightRaw.trim() !== '' ? lightRaw : null

  let dark: string | null = null
  let adjusted = false
  if (darkRaw !== null && darkRaw.trim() !== '') {
    const guarded = ensureDarkContrast(darkRaw)
    dark = guarded.color
    adjusted = guarded.adjusted
  }

  return { light, dark, adjusted }
}

/**
 * Build the override layer for a preference set.
 *
 * Precedence, lowest to highest: preset accents → explicit accent color →
 * density and font axes → the user's custom CSS. A later source overwrites an
 * earlier one per token, which is what makes "pick a preset, then tweak the
 * accent" behave the way a user expects.
 *
 * @param prefs - the stored preferences.
 * @param isDark - whether the host is in dark mode now. Used only to decide
 *   which accent the panel reports as active; the emitted layer always carries
 *   both values.
 */
export function resolveOverrides(prefs: ThemePreferences, isDark: boolean): ResolvedTheme {
  const overrides: TokenOverrides = {}

  // 1. Preset accents. A preset without a dark palette repeats its light value,
  //    which is what the API requires rather than what a single-value design
  //    would have produced.
  if (prefs.preset !== null) {
    const preset = getPreset(prefs.preset)
    if (preset !== undefined) {
      for (const [name, value] of Object.entries(preset.tokens)) {
        overrides[name] = { light: value, dark: preset.darkTokens?.[name] ?? value }
      }
    }
  }

  // 2. An explicit accent color wins over the preset, per mode.
  const { light, dark, adjusted } = resolveAccentPair(prefs)
  if (light !== null) {
    const lightTokens = accentTokens(light)
    const darkTokens = dark !== null && dark !== light ? accentTokens(dark) : null
    for (const [name, value] of Object.entries(lightTokens)) {
      overrides[name] = { light: value, dark: darkTokens?.[name] ?? value }
    }
  } else if (dark !== null) {
    // Only a dark accent is set: keep whatever the preset gave the light side.
    for (const [name, value] of Object.entries(accentTokens(dark))) {
      const existing = overrides[name]
      if (existing !== undefined) existing.dark = value
      else overrides[name] = { light: value, dark: value }
    }
  }

  // 3. Density and font axes are mode-independent, so both sides repeat.
  for (const map of [DENSITY_TOKENS[prefs.density], FONT_TOKENS[prefs.fontFamily]]) {
    if (map === undefined) continue
    for (const [name, value] of Object.entries(map)) {
      overrides[name] = { light: value, dark: value }
    }
  }

  // 4. Custom CSS last — it is the user's explicit escape hatch.
  for (const [name, value] of Object.entries(parseCustomCss(prefs.customCss))) {
    overrides[name] = { light: value, dark: value }
  }

  return {
    overrides,
    contrastAdjusted: adjusted,
    accent: { light, dark: isDark ? dark : light },
  }
}

/**
 * Every token name this plugin may write, for the guard test.
 *
 * `ctx.theme.overrideTokens` validates the *shape* of a value but not the name,
 * so an unverified name is accepted and then silently does nothing. The guard
 * checks these against dsh's shipped stylesheets.
 */
export function overriddenTokenNames(prefs: ThemePreferences): string[] {
  return Object.keys(resolveOverrides(prefs, false).overrides)
}
