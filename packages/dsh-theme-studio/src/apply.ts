/**
 * Applying a theme to the live document.
 *
 * The important detail here is WHERE the properties are written. dsh defines
 * its whole palette on `body` and `body[data-ds-dark-theme]`
 * (`@deepseek-ai/dsh-client-ui-theme/lib/client.js`). Custom properties set on
 * `documentElement` are inherited into `body`, but body's own declaration for
 * the same property wins — so writing to `documentElement` produces exactly
 * zero visible change. Everything is therefore written to `document.body`.
 *
 * Dark mode is read from the same attribute dsh's theme plugin toggles, so a
 * preset's dark palette follows the host without a separate user action.
 *
 * These functions touch the DOM, so the pure resolution logic lives in
 * `resolve.ts` and is what the tests exercise.
 *
 * @module apply
 */

import type { ThemePreferences } from './types.js'
import { STYLE_ELEMENT_ID } from './types.js'
import { DENSITY_TOKENS, FONT_TOKENS, MOTION_OFF_CSS, accentTokens } from './tokens.js'
import { getPreset } from './themes.js'
import { ensureDarkContrast } from './io.js'

/** The element dsh defines its palette on — writing anywhere else is ignored. */
function themeTarget(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.body ?? null
}

/**
 * True when a custom-CSS property name belongs to dsh's own token namespaces.
 *
 * This is the boundary for the escape hatch: users may override any token dsh
 * actually owns, but not arbitrary CSS (`position`, `display`, …) which could
 * break layout in ways the panel can't undo.
 */
export function isDshToken(name: string): boolean {
  return /^--dsh-\S+$/.test(name) || /^--dsw-\S+$/.test(name)
}

/** dsh marks dark mode with this attribute on <body>. */
export function isDarkMode(): boolean {
  if (typeof document === 'undefined') return false
  return document.body.hasAttribute('data-ds-dark-theme')
}

/** Watch the dark-mode attribute; returns an unsubscribe function. */
export function observeDarkMode(onChange: (dark: boolean) => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {}
  }
  const observer = new MutationObserver(() => onChange(isDarkMode()))
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-ds-dark-theme'],
  })
  return () => observer.disconnect()
}

/**
 * Resolve the accent color for the current mode.
 *
 * In dark mode the accent is pushed through the contrast guard, because a color
 * that reads well on white can sink into a dark surface. Returns whether the
 * guard changed anything so the panel can say so instead of silently swapping
 * the user's pick.
 */
export function resolveAccent(prefs: ThemePreferences, dark: boolean): {
  accent: string | null
  adjusted: boolean
} {
  const chosen = dark ? (prefs.darkAccentColor ?? prefs.accentColor) : prefs.accentColor
  if (chosen === null || chosen.trim() === '') return { accent: null, adjusted: false }
  if (!dark) return { accent: chosen, adjusted: false }
  const guarded = ensureDarkContrast(chosen)
  return { accent: guarded.color, adjusted: guarded.adjusted }
}

/**
 * Parse `--property: value;` lines from the custom CSS textarea.
 *
 * Only names approved by the caller are kept, so a typo or a deliberately
 * broad override can't reach the document.
 */export function parseCustomCss(css: string, allow: (name: string) => boolean): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of css.split('\n')) {
    // Reject values containing braces or a comment opener so a line can't
    // smuggle in a new rule or escape the declaration it looks like.
    const match = line.match(/^\s*(--[\w-]+)\s*:\s*([^;{}/*]+?)\s*;?\s*$/)
    if (match === null) continue
    if (!allow(match[1])) continue
    out[match[1]] = match[2]
  }
  return out
}

/** Remove every property this plugin may have set on the target. */
export function clearManagedProperties(fullCustomCss = ''): void {
  const target = themeTarget()
  if (target === null) return
  const names = new Set<string>([
    ...Object.keys(accentTokens('#000000')),
    ...Object.values(DENSITY_TOKENS).flatMap((t) => Object.keys(t)),
    ...Object.values(FONT_TOKENS).flatMap((t) => Object.keys(t)),
  ])
  for (const line of fullCustomCss.split('\n')) {
    const match = line.match(/^\s*(--[\w-]+)\s*:/)
    if (match !== null) names.add(match[1])
  }
  for (const name of names) target.style.removeProperty(name)
}

/** Ensure the plugin's own stylesheet exists; returns it or null. */
function motionStylesheet(): HTMLStyleElement | null {
  if (typeof document === 'undefined') return null
  let el = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null
  if (el === null) {
    el = document.createElement('style')
    el.id = STYLE_ELEMENT_ID
    document.head.appendChild(el)
  }
  return el
}

/**
 * Apply a preference set to the document.
 *
 * Returns whether the dark-mode contrast guard changed the accent, so the panel
 * can report a real adjustment rather than an assumed one.
 */
export function applyTheme(prefs: ThemePreferences, dark = isDarkMode()): boolean {
  const target = themeTarget()
  if (target === null) return false

  clearManagedProperties(prefs.customCss)

  const tokens: Record<string, string> = {}

  // Preset accents first, so an explicit accent color overrides its preset.
  if (prefs.preset !== null) {
    const found = getPreset(prefs.preset)
    if (found !== undefined) {
      Object.assign(tokens, found.tokens)
      if (dark && found.darkTokens !== undefined) Object.assign(tokens, found.darkTokens)
    }
  }

  const { accent, adjusted } = resolveAccent(prefs, dark)
  if (accent !== null) Object.assign(tokens, accentTokens(accent))

  Object.assign(tokens, DENSITY_TOKENS[prefs.density] ?? {})
  Object.assign(tokens, FONT_TOKENS[prefs.fontFamily] ?? {})

  for (const [name, value] of Object.entries(tokens)) {
    target.style.setProperty(name, value)
  }

  // Custom CSS is user-authored, so it goes last and wins — but it stays
  // inside dsh's own variable namespaces, so a typo can't write arbitrary
  // properties onto the element.
  const custom = parseCustomCss(prefs.customCss, isDshToken)
  for (const [name, value] of Object.entries(custom)) {
    target.style.setProperty(name, value)
  }

  const sheet = motionStylesheet()
  if (sheet !== null) sheet.textContent = prefs.animations ? '' : MOTION_OFF_CSS

  return adjusted
}

/** Remove everything the plugin applied, including the motion stylesheet. */
export function resetTheme(): void {
  clearManagedProperties()
  const sheet = typeof document !== 'undefined'
    ? document.getElementById(STYLE_ELEMENT_ID)
    : null
  if (sheet !== null) sheet.textContent = ''
}
