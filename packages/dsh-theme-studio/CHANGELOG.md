# Changelog

## 0.3.0

**Fixed: the plugin previously had no effect on the UI.**

Two independent bugs, both invisible in the panel:

1. Every property was written to `document.documentElement`. dsh defines its
   palette on `body` and `body[data-ds-dark-theme]`, and body's own declaration
   wins over the value inherited from html — so all writes were overridden.
2. The token names were invented. Only 3 of 16 (`--dsw-alias-state-business-primary`,
   `--dsw-alias-interactive-bg-hover`, `--dsh-content-font-size`) exist in dsh;
   `--accent`, `--border`, `--dsh-radius-*`, `--dsh-transition-*` and
   `--dsw-alias-state-business-secondary` do not.

The panel's preview read the same invented names with fallbacks, so it changed
color and made the misconfiguration look like success.

Also in this release:

- Every name now comes from `src/tokens.ts`, verified against the shipped dsh
  stylesheets, and `tests/tokens.test.mjs` fails if an unverified name is written.
- Properties go to `document.body` (`tests/apply.test.mjs` asserts documentElement
  is never touched).
- Border-radius control removed: dsh hardcodes radii per component and ships no
  radius token, so there was no honest implementation.
- Animation toggle reimplemented as a stylesheet using `0.001ms` rather than `0s`,
  so `transitionend` and `animationend` still fire.
- Accent now drives the whole family (business, brand, link, primary button,
  hover tint) instead of a single token.
- Switching a preset off clears the properties it had set.
- Custom CSS parse rejects braces and comments and only accepts `--dsw-*` /
  `--dsh-*` names, so a typo cannot write arbitrary CSS.
- 12 presets (was 10); 47 tests (was 26), including a DOM double that tests the
  real apply path.

## 0.2.0

- 4 new presets: Gruvbox, Solarized, Tokyo Night, Catppuccin.
- Dark-mode aware presets via `darkTokens`; the panel watches `body[data-ds-dark-theme]`.
- Separate dark-mode accent color.
- Contrast guard: a dark accent below the WCAG luminance floor is lightened in
  steps, and the panel reports that it was adjusted.
- Animation toggle (disables UI transitions).
- Theme import/export as JSON, with validation; accepts both the envelope and a
  bare preferences object, and reports a real error for non-theme input.
- Unified token resolution: switching a preset off now clears the properties it
  had set instead of leaving them behind.
- 26 tests across theme data and color/IO logic.

## 0.1.0

- Initial release.
- 6 pre-built theme presets (Ocean, Forest, Sunset, Monochrome, Nord, Dracula).
- Custom accent color picker.
- Density, border radius, and font family controls.
- Custom CSS variable override textarea.
- Live preview area.
- Preferences persisted in localStorage.
