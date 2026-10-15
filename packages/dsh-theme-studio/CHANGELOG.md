# Changelog

## 0.6.0

**Density now writes the official font size instead of shadowing it.**

The previous three releases all approached this one control wrongly. 0.5.0 made
`density` write `--dsh-content-font-size` as a token, which meant installing the
plugin silently disabled the Appearance stepper. 0.5.1 made the default inert,
but any *explicit* choice still shadowed that control — the layer sits on top of
the theme snapshot, so the official stepper kept displaying a number the UI no
longer rendered, and two controls disagreed.

Both problems have the same root: the font size was treated as this plugin's
state. It is not — `ctx.theme` owns it, `setFontSize()` is the only write entry,
and `getTheme().fontSize` reads it back. Density is now a preset over that value:

- **Writing** goes through `ctx.theme.setFontSize()`, so the official Appearance
  stepper shows the same number and stays usable.
- **Reading** comes from `ctx.theme.getTheme().fontSize`, so the highlighted
  preset follows edits made in the official control — including to *nothing* when
  the user picks a size between presets (15px or 17px).
- **The override layer no longer contains `--dsh-content-font-size` at all**, in
  any configuration. `tests/tokens.test.mjs` and `tests/apply.test.mjs` both
  assert this. The custom-CSS escape hatch can still set it, because that is the
  user asking rather than the plugin deciding.
- **`reset()` hands the font size back.** The original value is captured on the
  first change, so a reset does not strand the last density the user picked —
  that value lives in the host, not in this plugin's storage.

Structural: `density` left `ThemePreferences` entirely (storing a copy would be a
second source of truth that could disagree with the official control),
`DENSITY_TOKENS` was replaced by `DENSITY_FONT_SIZE` in px with
`densityForFontSize()` for the reverse lookup, and `parseTheme` deliberately
ignores a legacy `density` key from an older export rather than resurrecting it
as an override.

Verified end to end: 17 assertions over the real compiled output, covering the
layer's contents, preset round-tripping, and legacy-import behaviour.

## 0.5.2

**One self-gate for preferences, so neither entry point can bypass it.**

Both the localStorage load and `parseTheme` did call `normalizePreferences`, but
that function only *migrated* the legacy `'comfortable'` value — it did not
validate enums. The import path was safe only because it kept its own whitelist
ahead of the call; the load path had nothing:

```
stored { density: 'gigantic' }  →  normalizePreferences  →  'gigantic'  →  no option highlighted
imported { density: 'gigantic' } →  whitelist  →  'default'
```

The visible symptom is a segmented control with nothing selected. Worse, this is
exactly the asymmetry the 0.5.0 default bug came from — a value the panel cannot
represent reaching the override layer.

`normalizePreferences` is now the single place that validates, for every field:

- **Enums**: unknown `density` / `fontFamily` fall back to the inert default
  (`DENSITY_VALUES` / `FONT_VALUES` are the one source of truth; the import path
  no longer keeps a second copy).
- **Colors**: `normalizeColor` moved here from the parser, so a stored
  `accentColor: 'javascript:alert(1)'` is rejected just as an imported one is.
- **Types**: a non-boolean `animations`, non-string `customCss`, or non-string
  `preset` from a hand-edited file falls back instead of reaching the DOM.

`parseTheme` now only checks primitive types and hands everything to the
normalizer, so the two paths cannot drift apart again.

6 tests added pinning the invariant: both entry points reject unknown enums
identically, every value the panel can emit round-trips unchanged, normalizing is
idempotent, and a hand-edited file cannot smuggle a bad color or type through
either side. Verified by disabling the density check: 3 assertions fail.

## 0.5.1

**Fixed: installing the plugin disabled the official font-size control.**

The 0.5.0 default `density: 'comfortable'` wrote
`--dsh-content-font-size: 14px` into the override layer. Because an override
layer sits on top of the theme snapshot, the panel shadowed the Appearance
font-size stepper **before the user touched anything** — that control silently
stopped working on install.

Defaults are now inert by construction:

- `density` gained a `default` setting (「跟随官方」) which emits no token at all.
  `DENSITY_TOKENS` has no `default` or `comfortable` key — absence is how "do not
  override" is expressed.
- `FONT_TOKENS` lost its `system` entry for the same reason. dsh already ships a
  platform-appropriate `--dsw-font-family` stack, so "System" now means "keep it"
  rather than writing a near-identical one over it.
- `normalizePreferences()` migrates a stored or imported `'comfortable'` to
  `'default'`, so a preference written by 0.5.0 cannot resurrect the override.

A default preference set now produces a **completely empty** override layer;
`tests/apply.test.mjs` asserts exactly that.

Two tests were also wrong in a way worth naming. The 0.5.0 assertion "an empty
override set is produced for default preferences" filtered its check to names
starting with `--dsw-alias-state`, which excluded `--dsh-content-font-size` and
`--dsw-font-family` — precisely the two tokens it did write. The assertion could
never fail. It now checks the whole key set.

## 0.5.0

**Rewritten to use dsh's theme service instead of writing to the DOM.**

Theme changes now go through `ctx.theme.overrideTokens()`, the plugin gains the
`theme` injection, and `package.json` declares `@deepseek-ai/dsh-client-ui-theme`
as a client dependency.

What this fixes, beyond style:

- **Paired `{ light, dark }` values.** The override API requires both, because a
  single value goes illegible when the user switches color scheme. The previous
  version applied whichever value matched the mode at the time it ran.
- **Stacking and disposal.** The layer is keyed by source, re-publishing replaces
  it wholesale, and unloading removes exactly it — restoring what the host had
  underneath. Nothing is left behind in `document.body.style`.
- **Dark-mode tracking via the documented channel.** `theme/change` is now the
  source of truth, not a `MutationObserver` on `body[data-ds-dark-theme]`.
- **The motion stylesheet is owned.** It used to be parked in `document.head`
  with no owner, so unloading left it there; it is now created and removed inside
  the plugin's effect scope.

Structural changes:

- `src/apply.ts` became a pure module: preferences → override layer. No DOM. This
  is what makes "every value is a pair" testable at all.
- `src/client/index.tsx` owns the bridge between the panel and `ctx.theme`; the
  panel is a pure view and never touches the service or the DOM.
- `parseCustomCss` moved to `src/io.ts`, where the namespace check lives: only
  `--dsw-*` and `--dsh-*` names are accepted, and braces/comments are rejected so
  a line cannot smuggle in a new rule.
- Density now shadows the official Appearance font-size stepper rather than
  calling `setFontSize`, which would have written to the user's durable host
  settings. The panel states this.
- `tests/apply.test.mjs` rewritten for the new module: 22 tests covering pair
  shape, accent precedence, the contrast guard, and custom-CSS boundaries.
- `tests/tokens.test.mjs` gained a guard over the write path — the token names
  `resolveOverrides` can actually emit — since `overrideTokens` validates the
  shape of a value but not its name.

Verified by injecting `--accent` into `accentTokens()`: four assertions fail,
including "invented tokens reached the layer: --accent".

## 0.4.1

**Removed the hardcoded fallbacks in `view.tsx`.**

0.4.0 fixed `ui.tsx`, but `view.tsx` still carried 19 `var(--token, fallback)`
sites across 11 tokens — the same class of mistake, one file over. All fallbacks
are gone; the token names were already correct.

The guard test now scans every `.ts`/`.tsx` under `src/client/` rather than only
`ui.tsx`, with an assertion that fails if `view.tsx` stops being scanned.

## 0.4.0

**Fixed: the panel did not follow the host theme.**

ui.tsx read invented custom properties — `--accent`, `--border`, `--bg-primary`,
`--text-primary` and friends. dsh defines none of them, so the hardcoded
fallbacks applied in every theme: each panel rendered its own fixed palette
instead of following the host.

The visible symptom was `surface: 'var(--bg-primary, #fff)'` on the modal,
input, select and textarea backgrounds — **white panels in dark mode**, with text
in the host's near-white label color.

Every name is now a real dsh token, pinned in `tests/ui-tokens.test.mjs`:

- accent → `--dsw-alias-brand-primary`
- surfaces → `--dsw-alias-bg-layer-1` / `-2`
- border → `--dsw-alias-border-l2`
- text / muted → `--dsw-alias-label-primary` / `--dsw-alias-label-tertiary`
- state colors → `--dsw-alias-state-*-primary` with `-tertiary` / `-secondary` tints
- modal scrim → `--dsw-alias-bg-mask-1`
- shadows → `--dsw-elevation-panel` / `--dsw-elevation-prominent`

`#fff` on the primary button became `--dsw-alias-label-primary-inverted`: dsh's
brand color is near-black in light mode and near-white in dark, so the literal
white would have disappeared against the fill.

Fallbacks are gone on purpose. If a token were ever missing, the declaration
becomes invalid at computed-value time and the property inherits, which degrades
gracefully — a hardcoded fallback instead bakes in a color that is wrong in one
of the two themes. The guard test fails on any fallback for exactly that reason.

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
