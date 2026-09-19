/**
 * The verified dsh design-token surface this plugin is allowed to write.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * An earlier version of this plugin invented its own variable names
 * (`--accent`, `--border`, `--dsh-radius-medium`, `--dsh-transition-fast`).
 * None of them exist in dsh, so nothing the panel did had any effect on the
 * real UI — while the panel's own preview, which read the same invented
 * fallbacks, changed color and made it look like it worked.
 *
 * Every name below was read out of the shipped dsh stylesheets
 * (`@deepseek-ai/dsh-client-ui-theme/lib/client.js`), which define the palette
 * on `body` and `body[data-ds-dark-theme]`. Anything not on this list must not
 * be written by this plugin, and `tests/tokens.test.mjs` enforces that.
 *
 * Two consequences that are load-bearing:
 *
 * 1. The palette lives on `body`, not `:root`/`html`. A custom property set on
 *    `documentElement` is inherited INTO body, but body's own declaration wins
 *    — so this plugin must write to `document.body`, which `applyTheme` does.
 * 2. dsh hardcodes `border-radius` per component (including many `50%` circles
 *    and `corner-shape: round`), and ships no motion tokens at all. Radius
 *    therefore has no faithful token target and is deliberately not offered;
 *    animation-reduction is done with a stylesheet instead (see `motionCss`).
 *
 * @module tokens
 */

/**
 * Surface tokens this plugin derives from one base color per mode.
 *
 * These names were verified in the shipped stylesheet's `body` and
 * `body[data-ds-dark-theme]` blocks (`design-platform.css`): they drive the app
 * background, panel layers, composer surface, label colors and the two mid
 * border levels. The accent bundle (`accentTokens`) covers a disjoint set —
 * coloring the buttons and links alone never changes how the app READS, which
 * is why early presets looked like "no effect" on the real UI.
 */
export const SURFACE_TOKEN_NAMES: readonly string[] = [
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-layer-3',
  '--dsw-alias-bg-module-platform',
  '--dsw-alias-interactive-bg-hover',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-secondary',
  '--dsw-alias-label-tertiary',
  '--dsw-alias-border-l2',
  '--dsw-alias-border-l3',
] as const

/**
 * Token names confirmed present in dsh, kept here as data so the guard test can
 * check every map this plugin builds against it.
 */
export const VERIFIED_TOKENS: readonly string[] = [
  // Accent / business
  '--dsw-alias-state-business-primary',
  '--dsw-alias-state-business-tertiary',
  '--dsw-alias-brand-primary',
  '--dsw-alias-brand-text',
  '--dsw-alias-link',
  '--dsw-alias-interactive-bg-hover-accent',
  '--dsw-alias-button-primary-fill',
  '--dsw-alias-button-primary-hover',
  // Surfaces, labels and borders — the family presets derive per mode
  // (see surfaceTokens); verified in design-platform.css body blocks.
  ...SURFACE_TOKEN_NAMES,
  // Typography
  '--dsw-font-family',
  '--dsw-font-mono',
  '--dsw-font-xs-13',
  '--dsw-font-xs-strong-13',
  '--dsw-font-xxs-12',
  '--dsw-font-xxxs-11',
  '--dsw-font-s-14',
  '--dsw-font-l-20',
  '--dsh-content-font-size',
  '--dsh-content-font-delta',
] as const

/** Fast membership test used by the presets and the guard test. */
const VERIFIED = new Set<string>(VERIFIED_TOKENS)

/** True when `name` is a token this plugin has verified against dsh. */
export function isVerifiedToken(name: string): boolean {
  return VERIFIED.has(name)
}

/** Turn `#rrggbb` into an `rgba()` tint at the given alpha. */
export function tint(hex: string, alpha: number): string {
  const value = hex.trim().replace(/^#/, '')
  let r: number
  let g: number
  let b: number
  if (value.length === 3) {
    r = parseInt(value[0] + value[0], 16)
    g = parseInt(value[1] + value[1], 16)
    b = parseInt(value[2] + value[2], 16)
  } else if (value.length === 6) {
    r = parseInt(value.slice(0, 2), 16)
    g = parseInt(value.slice(2, 4), 16)
    b = parseInt(value.slice(4, 6), 16)
  } else {
    return hex
  }
  if ([r, g, b].some((n) => Number.isNaN(n))) return hex
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * The accent bundle: every token that should follow one accent color.
 *
 * Applying one color to all of these keeps the primary button, links, active
 * nav item, focus accents and hover tint in step. Deriving the hover tint from
 * the accent rather than using a fixed value is what makes a custom color look
 * deliberate instead of half-applied.
 */
export function accentTokens(hex: string): Record<string, string> {
  return {
    '--dsw-alias-state-business-primary': hex,
    '--dsw-alias-state-business-tertiary': tint(hex, 0.12),
    '--dsw-alias-brand-primary': hex,
    '--dsw-alias-brand-text': hex,
    '--dsw-alias-link': hex,
    '--dsw-alias-interactive-bg-hover-accent': tint(hex, 0.10),
    '--dsw-alias-button-primary-fill': hex,
    '--dsw-alias-button-primary-hover': hex,
  }
}

/**
 * Blend `hex` toward `target`; `amount` is the target's weight (0..1).
 * Unparseable input passes through unchanged — callers downstream of
 * `normalizeColor` never hit this, but `tint()` set the precedent.
 */
export function mix(hex: string, target: string, amount: number): string {
  const parse = (value: string): [number, number, number] | null => {
    const v = value.trim().replace(/^#/, '')
    if (v.length === 3) return [parseInt(v[0] + v[0], 16), parseInt(v[1] + v[1], 16), parseInt(v[2] + v[2], 16)]
    if (v.length === 6) return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]
    return null
  }
  const from = parse(hex)
  const to = parse(target)
  if (from === null || to === null) return hex
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  const ch = (i: number) => clamp(from[i] * (1 - amount) + to[i] * amount)
  const part = (n: number) => n.toString(16).padStart(2, '0')
  return `#${part(ch(0))}${part(ch(1))}${part(ch(2))}`
}

/**
 * Derive the surface/text/border family from one base color for one mode.
 *
 * `dark` flips the anchor: surfaces blend toward a near-black canvas and
 * labels toward a near-white text color, mirroring how dsh's own dark palette
 * is built. `amount` (0..0.2) is how strongly the base hue tints neutrals —
 * small values keep a theme close to the host look, larger ones read clearly
 * as a different theme.
 */
export function surfaceTokens(hex: string, dark: boolean, amount = 0.15): Record<string, string> {
  const t = Math.max(0, Math.min(0.2, amount))
  const bg = (weight: number) => mix(hex, dark ? '#0d1017' : '#ffffff', 1 - weight * t)
  const label = (weight: number) => mix(hex, dark ? '#e8eaf0' : '#1a1d26', 0.55 + 0.25 * weight)
  return {
    '--dsw-alias-bg-base': bg(0.35),
    '--dsw-alias-bg-layer-1': bg(0.55),
    '--dsw-alias-bg-layer-2': bg(0.8),
    '--dsw-alias-bg-layer-3': bg(1),
    '--dsw-alias-bg-module-platform': bg(0.7),
    '--dsw-alias-interactive-bg-hover': tint(hex, dark ? 0.12 : 0.08),
    '--dsw-alias-label-primary': label(1),
    '--dsw-alias-label-secondary': label(0.5),
    '--dsw-alias-label-tertiary': label(0),
    '--dsw-alias-border-l2': dark ? 'rgba(255, 255, 255, 0.12)' : tint(hex, 0.14),
    '--dsw-alias-border-l3': dark ? 'rgba(255, 255, 255, 0.16)' : tint(hex, 0.2),
  }
}

/**
 * Density → the content font size, in px.
 *
 * These are NOT token overrides. `--dsh-content-font-size` belongs to the
 * official Appearance row, which owns it through `ctx.theme.setFontSize()`; a
 * value written as an override layer would sit on top of that setting, so the
 * official stepper would keep displaying a number the UI no longer rendered.
 * Density therefore goes through the same entry point the official control uses,
 * and the two stay in agreement.
 *
 * Values must stay inside dsh's own `FONT_SIZE_MIN..FONT_SIZE_MAX` (12..17) or
 * `setFontSize` throws.
 */
export const DENSITY_FONT_SIZE: Record<string, number> = {
  compact: 13,
  comfortable: 14,
  spacious: 16,
}

/** The density whose size is closest to `px`; `null` when it matches none. */
export function densityForFontSize(px: number): string | null {
  for (const [name, size] of Object.entries(DENSITY_FONT_SIZE)) {
    if (size === px) return name
  }
  return null
}

/**
 * Font family → the two verified family tokens.
 *
 * As with density, `'system'` has no entry on purpose: dsh already ships
 * `--dsw-font-family` with a platform-appropriate stack, so "System" means
 * "leave the host's own choice alone" rather than "write a near-identical stack
 * over it". Only the two genuine alternatives write anything.
 */
export const FONT_TOKENS: Record<string, Record<string, string>> = {
  mono: {
    '--dsw-font-family': "'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
    '--dsw-font-mono': "'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
  },
  serif: {
    '--dsw-font-family': "Georgia, 'Times New Roman', serif",
    '--dsw-font-mono': "'Cascadia Code', Consolas, monospace",
  },
}

/**
 * CSS that suppresses motion, injected as a stylesheet rather than set as
 * tokens (dsh ships no motion tokens).
 *
 * Durations are `0.001ms` rather than `0s` on purpose: a zero duration can stop
 * `transitionend` / `animationend` from firing, and components that wait on
 * those events would hang. A near-zero duration keeps every event firing while
 * being visually instant — the same approach the `prefers-reduced-motion`
 * convention uses.
 */
export const MOTION_OFF_CSS = `
*, *::before, *::after {
  transition-duration: 0.001ms !important;
  transition-delay: 0ms !important;
  animation-duration: 0.001ms !important;
  animation-delay: 0ms !important;
  animation-iteration-count: 1 !important;
  scroll-behavior: auto !important;
}
`.trim()
