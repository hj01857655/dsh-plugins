/**
 * Pre-built theme presets for dsh-theme-studio.
 *
 * Each preset overrides a set of CSS custom properties on document.documentElement.
 * The property names target dsh's `--dsw-alias-*` semantic layer so the overrides
 * cascade through every component that reads the design tokens.
 *
 * @module themes
 */

import type { ThemePreset } from './types.js'

export const PRESETS: readonly ThemePreset[] = [
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep blue accent with cool neutrals',
    tokens: {
      '--accent': '#2563eb',
      '--accent-hover': '#1d4ed8',
      '--dsw-alias-state-business-primary': '#2563eb',
      '--dsw-alias-state-business-secondary': '#dbeafe',
      '--dsw-alias-interactive-bg-hover': 'rgba(37,99,235,0.08)',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Green accent with earthy neutrals',
    tokens: {
      '--accent': '#16a34a',
      '--accent-hover': '#15803d',
      '--dsw-alias-state-business-primary': '#16a34a',
      '--dsw-alias-state-business-secondary': '#dcfce7',
      '--dsw-alias-interactive-bg-hover': 'rgba(22,163,74,0.08)',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm orange accent with amber highlights',
    tokens: {
      '--accent': '#ea580c',
      '--accent-hover': '#c2410c',
      '--dsw-alias-state-business-primary': '#ea580c',
      '--dsw-alias-state-business-secondary': '#fed7aa',
      '--dsw-alias-interactive-bg-hover': 'rgba(234,88,12,0.08)',
    },
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    description: 'Grayscale only — no color accent',
    tokens: {
      '--accent': '#404040',
      '--accent-hover': '#262626',
      '--dsw-alias-state-business-primary': '#404040',
      '--dsw-alias-state-business-secondary': '#e5e5e5',
      '--dsw-alias-interactive-bg-hover': 'rgba(64,64,64,0.08)',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    description: 'Frost blue inspired by the Nord palette',
    tokens: {
      '--accent': '#5e81ac',
      '--accent-hover': '#4c6f96',
      '--dsw-alias-state-business-primary': '#5e81ac',
      '--dsw-alias-state-business-secondary': '#e5ebf1',
      '--dsw-alias-interactive-bg-hover': 'rgba(94,129,172,0.08)',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    description: 'Purple accent with dark mode flair',
    tokens: {
      '--accent': '#bd93f9',
      '--accent-hover': '#a678e8',
      '--dsw-alias-state-business-primary': '#bd93f9',
      '--dsw-alias-state-business-secondary': '#3a3a5c',
      '--dsw-alias-interactive-bg-hover': 'rgba(189,147,249,0.12)',
    },
  },
] as const

/** Density → CSS custom property overrides */
export const DENSITY_TOKENS: Record<string, Record<string, string>> = {
  compact: {
    '--dsh-content-font-size': '13px',
    '--dsh-spacing-unit': '4px',
  },
  comfortable: {
    '--dsh-content-font-size': '14px',
    '--dsh-spacing-unit': '6px',
  },
  spacious: {
    '--dsh-content-font-size': '15px',
    '--dsh-spacing-unit': '8px',
  },
}

/** Radius → CSS custom property overrides */
export const RADIUS_TOKENS: Record<string, Record<string, string>> = {
  sharp: {
    '--dsh-radius-small': '2px',
    '--dsh-radius-medium': '4px',
    '--dsh-radius-large': '6px',
  },
  rounded: {
    '--dsh-radius-small': '6px',
    '--dsh-radius-medium': '10px',
    '--dsh-radius-large': '14px',
  },
  soft: {
    '--dsh-radius-small': '10px',
    '--dsh-radius-medium': '16px',
    '--dsh-radius-large': '22px',
  },
}

/** Font family → CSS custom property overrides */
export const FONT_TOKENS: Record<string, Record<string, string>> = {
  system: { '--dsh-font-family': "system-ui, -apple-system, sans-serif" },
  mono: { '--dsh-font-family': "'JetBrains Mono', 'Fira Code', monospace" },
  serif: { '--dsh-font-family': "'Georgia', 'Times New Roman', serif" },
}

/** Look up a preset by id. */
export function getPreset(id: string): ThemePreset | undefined {
  return PRESETS.find((p) => p.id === id)
}
