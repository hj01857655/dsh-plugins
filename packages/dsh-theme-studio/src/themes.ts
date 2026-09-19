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
import { accentTokens } from './tokens.js'

/** Every preset is built from one accent color per mode. */
function preset(
  id: string,
  name: string,
  description: string,
  lightAccent: string,
  darkAccent?: string,
): ThemePreset {
  const base: ThemePreset = { id, name, description, tokens: accentTokens(lightAccent) }
  // A dark entry equal to the light one would be a no-op that still shows the
  // "adapts to dark" badge, so it is only kept when the color actually changes.
  if (darkAccent !== undefined && darkAccent.toLowerCase() !== lightAccent.toLowerCase()) {
    base.darkTokens = accentTokens(darkAccent)
  }
  return base
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
]

/** Look up a preset by id. */
export function getPreset(id: string): ThemePreset | undefined {
  return PRESETS.find((p) => p.id === id)
}
