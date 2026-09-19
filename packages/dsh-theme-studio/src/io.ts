/**
 * Theme import/export and color utilities for dsh-theme-studio.
 *
 * Kept free of DOM access so the logic is testable outside a browser.
 *
 * @module io
 */

import type { ThemePreferences } from './types.js'
import { DEFAULT_PREFERENCES } from './types.js'

/** The wire format for exported themes. */
export interface ExportedTheme {
  $schema: 'dsh-theme-studio/v1'
  name?: string
  preferences: ThemePreferences
  exportedAt: string
}

/** Serialize preferences into a portable JSON string. */
export function exportTheme(prefs: ThemePreferences, name?: string): string {
  const payload: ExportedTheme = {
    $schema: 'dsh-theme-studio/v1',
    preferences: prefs,
    exportedAt: new Date().toISOString(),
  }
  if (name !== undefined) payload.name = name
  return JSON.stringify(payload, null, 2)
}

const DENSITIES = new Set(['compact', 'comfortable', 'spacious'])
const RADII = new Set(['sharp', 'rounded', 'soft'])
const FONTS = new Set(['system', 'mono', 'serif'])

function asColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  return /^#[0-9a-fA-F]{3,8}$/.test(trimmed) ? trimmed : null
}

/**
 * Parse a theme JSON document.
 *
 * Every field is validated and falls back to the default rather than throwing,
 * so a partially-hand-edited file still applies what it can. The only hard
 * failure is input that is not a JSON object at all — that returns `null` so
 * the caller can report a real import error instead of silently applying defaults.
 */
export function parseTheme(raw: string): ThemePreferences | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const doc = parsed as Record<string, unknown>
  // Accept both the envelope and a bare preferences object.
  const source = (doc['preferences'] !== null && typeof doc['preferences'] === 'object' && !Array.isArray(doc['preferences']))
    ? doc['preferences'] as Record<string, unknown>
    : doc

  const result: ThemePreferences = { ...DEFAULT_PREFERENCES }

  if (typeof source['preset'] === 'string' || source['preset'] === null) {
    result.preset = source['preset'] as string | null
  }
  result.accentColor = asColor(source['accentColor'])
  result.darkAccentColor = asColor(source['darkAccentColor'])
  if (typeof source['density'] === 'string' && DENSITIES.has(source['density'])) {
    result.density = source['density'] as ThemePreferences['density']
  }
  if (typeof source['radius'] === 'string' && RADII.has(source['radius'])) {
    result.radius = source['radius'] as ThemePreferences['radius']
  }
  if (typeof source['fontFamily'] === 'string' && FONTS.has(source['fontFamily'])) {
    result.fontFamily = source['fontFamily'] as ThemePreferences['fontFamily']
  }
  if (typeof source['animations'] === 'boolean') result.animations = source['animations']
  if (typeof source['customCss'] === 'string') result.customCss = source['customCss']

  return result
}

/** Parse `#rgb` or `#rrggbb` into RGB components; `null` when unparseable. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const value = hex.trim().replace(/^#/, '')
  if (value.length === 3) {
    const [r, g, b] = value.split('')
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)]
  }
  if (value.length === 6) {
    return [
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16),
    ]
  }
  return null
}

/** WCAG relative luminance, 0 (black) → 1 (white). */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (rgb === null) return 0
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Convert RGB components back into a `#rrggbb` string. */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return '#' + [r, g, b].map((n) => clamp(n).toString(16).padStart(2, '0')).join('')
}

/** Blend a color toward white by `amount` (0–1). */
export function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (rgb === null) return hex
  const [r, g, b] = rgb
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
  )
}

/** Blend a color toward black by `amount` (0–1). */
export function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (rgb === null) return hex
  const [r, g, b] = rgb
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount))
}

/**
 * Ensure an accent color stays legible on a dark background.
 *
 * A mid-tone accent that reads well on white can sit too close to a dark
 * surface. Rather than silently swapping the user's color, we lighten it in
 * steps until it clears a luminance floor and report whether we changed it, so
 * the panel can say so instead of the user wondering why their pick looks off.
 */
export function ensureDarkContrast(hex: string): { color: string; adjusted: boolean } {
  const MIN_LUMINANCE = 0.18
  // An unparseable value can't be measured, so it can't be corrected either —
  // returning it unadjusted keeps the panel from claiming it fixed something.
  if (hexToRgb(hex) === null) return { color: hex, adjusted: false }
  if (luminance(hex) >= MIN_LUMINANCE) return { color: hex, adjusted: false }
  let current = hex
  for (let i = 0; i < 10; i += 1) {
    current = lighten(current, 0.12)
    if (luminance(current) >= MIN_LUMINANCE) return { color: current, adjusted: true }
  }
  return { color: current, adjusted: true }
}
