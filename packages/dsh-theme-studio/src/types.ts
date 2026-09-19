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
  /** CSS custom property → value, applied to document.documentElement.style */
  tokens: Record<string, string>
}

/** User-selectable density preference. */
export type Density = 'compact' | 'comfortable' | 'spacious'

/** User-selectable border-radius preference. */
export type Radius = 'sharp' | 'rounded' | 'soft'

/** User-selectable font family preference. */
export type FontFamily = 'system' | 'mono' | 'serif'

/** Complete theme preferences persisted in localStorage. */
export interface ThemePreferences {
  preset: string | null
  accentColor: string | null
  density: Density
  radius: Radius
  fontFamily: FontFamily
  customCss: string
}

/** Default preferences — nothing overridden, dsh's built-in theme wins. */
export const DEFAULT_PREFERENCES: ThemePreferences = {
  preset: null,
  accentColor: null,
  density: 'comfortable',
  radius: 'rounded',
  fontFamily: 'system',
  customCss: '',
}

/** localStorage key for persisting preferences. */
export const STORAGE_KEY = 'dsh-theme-studio'
