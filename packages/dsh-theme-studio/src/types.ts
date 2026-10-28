/**
 * Shared types for dsh-theme-studio.
 *
 * @module types
 */

/** A named preset that overrides a set of CSS custom properties. */
export interface ThemePreset {
  id: string
  name: string
  description: string
  /** Accent tokens for light mode. */
  tokens: Record<string, string>
  /** Accent tokens for dark mode, applied when dsh is dark. */
  darkTokens?: Record<string, string>
}

/**
 * A user-authored theme: the same shape as a preset, persisted locally.
 *
 * Ids are namespaced `custom:<slug>` when referenced from preferences, so a
 * custom theme can never collide with a built-in preset id and a preference
 * stored by 2.0 stays readable by code that only knows the built-ins.
 */
export interface CustomTheme extends ThemePreset {
  createdAt: string
  updatedAt: string
}

/** localStorage key holding the custom-theme list. */
export const CUSTOM_THEMES_KEY = 'dsh-theme-studio.themes'

/** The prefix that marks a preference value as pointing at a custom theme. */
export const CUSTOM_ID_PREFIX = 'custom:'

/** User-selectable density, expressed as a dsh content font size. */
export type Density = 'tight' | 'compact' | 'comfortable' | 'relaxed' | 'spacious' | 'maximum'

/** The accepted density values. */
export const DENSITY_VALUES: readonly Density[] = [
  'tight', 'compact', 'comfortable', 'relaxed', 'spacious', 'maximum',
]

/** User-selectable font family. `system` leaves the host in charge. */
export type FontFamily = 'system' | 'mono' | 'serif'

/** The accepted font family values. */
export const FONT_VALUES: readonly FontFamily[] = ['system', 'mono', 'serif']

/**
 * What this plugin persists.
 *
 * Note what is absent: the content font size. That value belongs to the host —
 * `ctx.theme.setFontSize()` writes it through the settings scope and
 * `getTheme().fontSize` reads it back — so storing a copy here would be a second
 * source of truth that could disagree with the official Appearance control.
 * Density is a view over the host's value, not state of its own.
 */
export interface ThemePreferences {
  preset: string | null
  /**
   * The preset dark mode uses. `null` follows `preset` — the single-theme
   * behaviour of every release before 0.9.0 — while setting it lets each mode
   * take its half of a different theme's pair.
   */
  darkPreset: string | null
  accentColor: string | null
  /** Separate accent color for dark mode; null = use accentColor */
  darkAccentColor: string | null
  fontFamily: FontFamily
  animations: boolean
  customCss: string
}

/**
 * Default preferences — nothing overridden, dsh's built-in theme wins.
 *
 * Every default here must be inert: installing the plugin and changing nothing
 * leaves zero tokens in the override layer. A default that writes a token would
 * shadow the equivalent official control before the user ever chose anything.
 */
export const DEFAULT_PREFERENCES: ThemePreferences = {
  preset: null,
  darkPreset: null,
  accentColor: null,
  darkAccentColor: null,
  fontFamily: 'system',
  animations: true,
  customCss: '',
}

/**
 * Bring any preference set — stored, imported, or hand-written — up to the
 * current shape, validating every field.
 *
 * This is the single self-gate for the plugin's preferences. Both entry points
 * (the localStorage load and `parseTheme`) funnel through it, so a value that
 * reaches the panel is always one the panel can represent.
 *
 * Two historical hazards this exists to close:
 *
 * 1. `density` used to offer `'comfortable'` as its default, which wrote
 *    `--dsh-content-font-size: 14px` and shadowed the official Appearance
 *    font-size stepper — installing the plugin and touching nothing silently
 *    disabled that control. `'comfortable'` now means "leave the host alone" and
 *    migrates to `'default'`.
 * 2. The load path used a bare `{ ...DEFAULT, ...raw }` merge with no enum
 *    validation, while the import path validated against its own whitelist. A
 *    stored `density: 'gigantic'` therefore survived, and the panel's segmented
 *    control rendered with no option selected. Validation now happens here, once.
 */
export function normalizePreferences(raw: Partial<ThemePreferences>): ThemePreferences {
  const merged = { ...DEFAULT_PREFERENCES, ...raw }

  // Enum validation — anything unrecognised falls back to the inert default.
  if (!FONT_VALUES.includes(merged.fontFamily)) merged.fontFamily = DEFAULT_PREFERENCES.fontFamily

  // Non-enum fields still need a shape check: these values arrive from JSON a
  // user may have hand-edited, and a non-string would reach the DOM later.
  if (typeof merged.animations !== 'boolean') merged.animations = DEFAULT_PREFERENCES.animations
  if (typeof merged.customCss !== 'string') merged.customCss = DEFAULT_PREFERENCES.customCss
  if (merged.preset !== null && typeof merged.preset !== 'string') merged.preset = null
  if (merged.darkPreset !== null && typeof merged.darkPreset !== 'string') merged.darkPreset = null
  merged.accentColor = normalizeColor(merged.accentColor)
  merged.darkAccentColor = normalizeColor(merged.darkAccentColor)

  return merged
}

/**
 * Accept a CSS hex color, or `null` for anything else.
 *
 * Kept here rather than in the parser so both the stored and the imported path
 * reject a malformed color identically — a value like `javascript:alert(1)`
 * must never reach `overrideTokens`.
 */
export function normalizeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  return /^#[0-9a-fA-F]{3,8}$/.test(trimmed) ? trimmed : null
}

/** localStorage key for persisting preferences. */
export const STORAGE_KEY = 'dsh-theme-studio'

/** Element carrying the plugin's injected stylesheet id. */
export const STYLE_ELEMENT_ID = 'dsh-theme-studio-overrides'
