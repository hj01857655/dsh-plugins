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
  '--dsw-alias-interactive-bg-hover',
  '--dsw-alias-interactive-bg-hover-accent',
  '--dsw-alias-button-primary-fill',
  '--dsw-alias-button-primary-hover',
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
 * Density → content font size.
 *
 * `--dsh-content-font-size` is the verified knob: dsh's own theme bootstrap
 * writes it on `body`, and 22 shipped stylesheets read it, so changing it moves
 * the whole content column.
 */
export const DENSITY_TOKENS: Record<string, Record<string, string>> = {
  compact: { '--dsh-content-font-size': '13px' },
  comfortable: { '--dsh-content-font-size': '14px' },
  spacious: { '--dsh-content-font-size': '15px' },
}

/** Font family → the two verified family tokens. */
export const FONT_TOKENS: Record<string, Record<string, string>> = {
  system: {
    '--dsw-font-family': "system-ui, -apple-system, 'Segoe UI', sans-serif",
    '--dsw-font-mono': "'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
  },
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
