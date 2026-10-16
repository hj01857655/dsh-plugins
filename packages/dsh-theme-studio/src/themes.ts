/**
 * Theme presets for dsh-theme-studio.
 *
 * Each preset only sets tokens listed in `VERIFIED_TOKENS` — real dsh design
 * tokens, read out of the shipped stylesheets. The accent bundle comes from
 * `accentTokens()` so a preset and a hand-picked color produce the same shape.
 *
 * @module themes
 */

import type { ThemePreset } from './types.js'
import { accentTokens, surfaceTokens } from './tokens.js'

/**
 * Every preset ships a full palette per mode: the accent family from
 * `accentTokens()` plus the surface/text/border family from `surfaceTokens()`.
 * The surface half is what makes a preset change how the whole app reads —
 * accents alone only recolor buttons and links while every background, label
 * and border stays dsh-default, which users rightly report as "no effect".
 *
 * Both modes are always built (the dark side derives its surfaces from the
 * near-black anchor), because `overrideTokens` requires `{ light, dark }`
 * pairs: a light-only palette would paint a light surface over dark mode.
 */
function preset(
  id: string,
  name: string,
  description: string,
  lightAccent: string,
  darkAccent = lightAccent,
): ThemePreset {
  return {
    id,
    name,
    description,
    tokens: { ...surfaceTokens(lightAccent, false), ...accentTokens(lightAccent) },
    darkTokens: { ...surfaceTokens(darkAccent, true), ...accentTokens(darkAccent) },
  }
}

/**
 * Low Contrast is dsh's own palette with its luminance range compressed. The
 * values are the shipped defaults — read out of the ui-theme stylesheets
 * (`body` for light, `body[data-ds-dark-theme]` for dark) — softened rather
 * than replaced: the accent blue and the "brand is ink" mapping stay, the
 * neutrals move toward the text, and the border/hover alphas about halve.
 *
 * Each label sits at the softest value that still clears a WCAG target, so
 * "low contrast" stays readable: 7:1 for primary text, 4.6:1 for secondary,
 * 3.2:1 for tertiary, against #f2f3f5 (light) and #1f2023 (dark).
 */
/** The softened light side of dsh's defaults. */
const LOW_CONTRAST_LIGHT_SURFACES: Record<string, string> = {
  '--dsw-alias-bg-base': '#f2f3f5',
  '--dsw-alias-bg-layer-1': '#f2f3f5',
  '--dsw-alias-bg-layer-2': '#f2f3f5',
  '--dsw-alias-bg-layer-3': '#f2f3f5',
  '--dsw-alias-bg-module-platform': '#e9ebee',
  '--dsw-alias-interactive-bg-hover': '#2631480a',
  '--dsw-alias-label-primary': '#515253',
  '--dsw-alias-label-secondary': '#6c6e70',
  '--dsw-alias-label-tertiary': '#86888a',
  '--dsw-alias-border-l2': '#00000012',
  '--dsw-alias-border-l3': '#00000017',
  '--dsw-alias-state-business-primary': '#4176e6',
  '--dsw-alias-state-business-tertiary': '#e2e9f6',
  '--dsw-alias-brand-primary': '#515253',
  '--dsw-alias-brand-text': '#515253',
  '--dsw-alias-link': '#4176e6',
  '--dsw-alias-button-primary-fill': '#515253',
  '--dsw-alias-button-primary-hover': '#494a4c',
  '--dsw-alias-interactive-bg-hover-accent': '#4176e61f',
}

/** The softened dark side of dsh's defaults. */
const LOW_CONTRAST_DARK_SURFACES: Record<string, string> = {
  '--dsw-alias-bg-base': '#1f2023',
  '--dsw-alias-bg-layer-1': '#26272a',
  '--dsw-alias-bg-layer-2': '#2d2e32',
  '--dsw-alias-bg-layer-3': '#35363a',
  '--dsw-alias-bg-module-platform': '#242528',
  '--dsw-alias-interactive-bg-hover': '#ffffff0f',
  '--dsw-alias-label-primary': '#a8abae',
  '--dsw-alias-label-secondary': '#87898b',
  '--dsw-alias-label-tertiary': '#6d6f71',
  '--dsw-alias-border-l2': '#ffffff14',
  '--dsw-alias-border-l3': '#ffffff1c',
  '--dsw-alias-state-business-primary': '#7aaaff',
  '--dsw-alias-state-business-tertiary': '#2f3a4f',
  '--dsw-alias-brand-primary': '#a8abae',
  '--dsw-alias-brand-text': '#a8abae',
  '--dsw-alias-link': '#7aaaff',
  '--dsw-alias-button-primary-fill': '#a8abae',
  '--dsw-alias-button-primary-hover': '#989a9d',
  '--dsw-alias-interactive-bg-hover-accent': '#ffffff2b',
}

/** Low Contrast: the host's own palette, gentler. */
function lowContrast(): ThemePreset {
  return {
    id: 'low-contrast',
    name: 'Low Contrast',
    description: "dsh's own palette, softened",
    tokens: { ...surfaceTokens('#4176e6', false), ...accentTokens('#4176e6'), ...LOW_CONTRAST_LIGHT_SURFACES },
    darkTokens: { ...surfaceTokens('#7aaaff', true), ...accentTokens('#7aaaff'), ...LOW_CONTRAST_DARK_SURFACES },
  }
}

/**
 * One Dark's surfaces are part of the palette rather than a tint of its accent:
 * Atom picked `#282c34` for the canvas and `#abb2bf` for text, and blending a
 * blue toward a near-black anchor cannot reach either. Each map therefore
 * replaces only the surface/label/border half of a mode; the accent half still
 * comes from `accentTokens()`, so the preset keeps the shape of the derived
 * ones and the guard tests cover it unchanged.
 */
const ONE_DARK_SURFACES: Record<string, string> = {
  '--dsw-alias-bg-base': '#282c34',
  '--dsw-alias-bg-layer-1': '#2c313c',
  '--dsw-alias-bg-layer-2': '#323741',
  '--dsw-alias-bg-layer-3': '#3b4048',
  '--dsw-alias-bg-module-platform': '#2c313c',
  '--dsw-alias-interactive-bg-hover': 'rgba(97, 175, 239, 0.10)',
  '--dsw-alias-label-primary': '#abb2bf',
  '--dsw-alias-label-secondary': '#9aa1ad',
  '--dsw-alias-label-tertiary': '#5c6370',
  '--dsw-alias-border-l2': 'rgba(255, 255, 255, 0.12)',
  '--dsw-alias-border-l3': '#4b5263',
}

/** One Light: the light side of the same palette, used when dsh is in light mode. */
const ONE_LIGHT_SURFACES: Record<string, string> = {
  '--dsw-alias-bg-base': '#fafafa',
  '--dsw-alias-bg-layer-1': '#f0f0f1',
  '--dsw-alias-bg-layer-2': '#e5e5e6',
  '--dsw-alias-bg-layer-3': '#d4d4d5',
  '--dsw-alias-bg-module-platform': '#f0f0f1',
  '--dsw-alias-interactive-bg-hover': 'rgba(64, 120, 242, 0.08)',
  '--dsw-alias-label-primary': '#383a42',
  '--dsw-alias-label-secondary': '#696c77',
  '--dsw-alias-label-tertiary': '#a0a1a7',
  '--dsw-alias-border-l2': 'rgba(0, 0, 0, 0.10)',
  '--dsw-alias-border-l3': '#c9c9ca',
}

/**
 * One Dark, the first preset whose surfaces are not derived from its accent.
 * The accent values are Atom's blue for each mode, so buttons, links and focus
 * rings still come from the shared accent bundle.
 */
function oneDark(): ThemePreset {
  return {
    id: 'one-dark',
    name: 'One Dark',
    description: "Atom's classic dark palette",
    tokens: { ...surfaceTokens('#4078f2', false), ...accentTokens('#4078f2'), ...ONE_LIGHT_SURFACES },
    darkTokens: { ...surfaceTokens('#61afef', true), ...accentTokens('#61afef'), ...ONE_DARK_SURFACES },
  }
}

export const PRESETS: readonly ThemePreset[] = [
  preset('ocean', 'Ocean', 'Deep blue, close to dsh default', '#4d6bfe'),
  preset('forest', 'Forest', 'Calm green', '#16a34a', '#22c55e'),
  preset('sunset', 'Sunset', 'Warm orange', '#ea580c', '#fb923c'),
  preset('monochrome', 'Monochrome', 'No color accent at all', '#5c5c5c', '#9e9e9e'),
  preset('nord', 'Nord', 'Frost blue', '#5e81ac', '#88c0d0'),
  preset('dracula', 'Dracula', 'Purple, brighter on dark', '#7c5cd6', '#bd93f9'),
  preset('gruvbox', 'Gruvbox', 'Retro warm earth tones', '#b57614', '#fe8019'),
  preset('solarized', 'Solarized', 'Schoonover precision palette', '#268bd2', '#5fa8d3'),
  preset('tokyo-night', 'Tokyo Night', 'City lights blue', '#3d59a1', '#7aa2f7'),
  preset('catppuccin', 'Catppuccin', 'Soft pastel', '#7287fd', '#cba6f7'),
  preset('rose', 'Rosé', 'Muted pink', '#b3276b', '#f472b6'),
  preset('ember', 'Ember', 'Deep red', '#b91c1c', '#ef4444'),
  lowContrast(),
  oneDark(),
]

/** Look up a preset by id. */
export function getPreset(id: string): ThemePreset | undefined {
  return PRESETS.find((p) => p.id === id)
}
