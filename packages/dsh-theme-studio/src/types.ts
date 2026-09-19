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

/** User-selectable density preference. */
export type Density = 'compact' | 'comfortable' | 'spacious'

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

/** Default preferences — nothing overridden, dsh's built-in theme wins. */
export const DEFAULT_PREFERENCES: ThemePreferences = {
  preset: null,
  accentColor: null,
  darkAccentColor: null,
  density: 'comfortable',
  fontFamily: 'system',
  animations: true,
  customCss: '',
}

/** localStorage key for persisting preferences. */
export const STORAGE_KEY = 'dsh-theme-studio'

/** Element carrying the plugin's injected stylesheet id. */
export const STYLE_ELEMENT_ID = 'dsh-theme-studio-overrides'
