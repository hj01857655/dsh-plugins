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

/** User-selectable density preference. `default` leaves the host in charge. */
export type Density = 'default' | 'compact' | 'spacious'

/** User-selectable font family preference. */
export type FontFamily = 'system' | 'mono' | 'serif'

/** Complete theme preferences persisted in localStorage. */
export interface ThemePreferences {
  preset: string | null
  accentColor: string | null
  /** Separate accent color for dark mode; null = use accentColor */
  darkAccentColor: string | null
  density: Density
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
  accentColor: null,
  darkAccentColor: null,
  density: 'default',
  fontFamily: 'system',
  animations: true,
  customCss: '',
}

/**
 * Bring a stored preference set up to the current shape.
 *
 * `density` used to offer `'comfortable'` as its default, which wrote
 * `--dsh-content-font-size: 14px` and shadowed the official Appearance font-size
 * stepper. That value now means "leave it alone", so a stored `'comfortable'`
 * migrates to `'default'` instead of silently applying an override the user
 * never asked for.
 */
export function normalizePreferences(raw: Partial<ThemePreferences>): ThemePreferences {
  const merged = { ...DEFAULT_PREFERENCES, ...raw }
  if ((merged.density as string) === 'comfortable') merged.density = 'default'
  return merged
}

/** localStorage key for persisting preferences. */
export const STORAGE_KEY = 'dsh-theme-studio'

/** Element carrying the plugin's injected stylesheet id. */
export const STYLE_ELEMENT_ID = 'dsh-theme-studio-overrides'
