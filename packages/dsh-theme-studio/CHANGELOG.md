# Changelog

## 0.8.2

**The panel stopped explaining itself; the README already does.**

The verified-token count and the two constraints behind this plugin — no
border-radius control, an animation toggle built from a stylesheet — were a
paragraph of documentation sitting in the settings panel. That is README material,
not a control, and "What it can and cannot change" has carried the same
explanation with its reasoning since 0.6.0. The paragraph is gone from the panel.

The README's feature list now also matches the plugin: the preset previews and the
12..17px density range it gained in 0.8.1, instead of the three density steps it
described for 0.7.x.
## 0.8.1

**Removed the per-token editor; the preset grid now previews real themes.**

0.8.0 exposed all 37 tokens as editable rows. That was a developer surface — two
palettes, five collapsible groups and a text field per token, for a job almost
nobody has and which the custom CSS box already covers. It is gone, together with
the preference field, the import path and the tests it needed.

What goes in its place is work on what the panel is actually for, choosing a theme:

- A preset card no longer reduces a theme to two accent dots. It shows a
  miniature page in that preset's own colors — light on the left, dark on the
  right — so the surfaces, labels and borders a preset changes are visible before
  it is applied.
- A token a preset does not define falls back to the same name read live from dsh
  itself, so the "None (use default)" card previews the host's palette instead of
  a guess.
- Density keeps the full 12..17px range introduced in 0.8.0.
## 0.8.0

**Per-token editing, and the full 12..17px density range.**

The panel used to offer a preset, one accent color and three font sizes. It now
also exposes every token it is allowed to write as an editable row: 37 tokens in
five groups, edited one palette at a time, because dsh declares its palette twice
(`body` and `body[data-ds-dark-theme]`) and a value set for light mode must leave
the dark declaration alone.

- Token edits are applied after presets, the accent bundle and the font family,
  and before custom CSS — that box stays the final word, so a line written there
  still wins over a token edited in the panel.
- A value edited for one mode only keeps the other mode's value from the layers
  above; when nothing defined it, the edited value is used for both. This is what
  `ctx.theme.overrideTokens` requires, since it takes both palette values per
  token.
- Values are validated on the way in and on the way out: anything that could
  escape the declaration (a semicolon, braces, angle brackets, a newline) is
  rejected and unknown token names are dropped, so a hand-edited export cannot
  grow the override layer past the verified token surface.
- Edits commit on blur or Enter rather than on each keystroke: a half-typed
  `#4d` would otherwise reach the override layer and come back as a missing
  token in the next frame's write-back check.
- Density now covers the whole range `setFontSize` accepts: 12, 13, 14, 15, 16
  and 17px. Existing choices keep their meaning — `compact` is still 13px,
  `comfortable` 14px and `spacious` 16px.
## 0.7.6

**Removed three dictionary keys the radius control left behind.**

`radiusSection` (both languages) and `radiusUnavailable` (English) had no reader: 0.3.0 removed the
border-radius control once it turned out dsh ships no radius token, but the copy stayed in the
dictionaries. Nothing renders them, so this is a cleanup with no behaviour change.
## 0.7.5

**The stored theme is applied when the plugin loads, not when the panel is first opened.**

From community PR #1 (thanks @kurtontheway), rebased onto the current panel: `apply()` installed the
override layer but nothing called it, so a stored theme only came back the moment the user opened Theme
Studio — after a restart the app painted the host's default palette until then. The bridge is now invoked
with the stored preferences at load, and `loadPreferences` / `savePreferences` moved to
`src/client/preferences.ts` so the load path can read them without a cycle through `view.tsx`.
`tests/client-startup.test.mjs` runs the compiled browser bundle and asserts exactly one layer is
published at load with the stored preset's values — and none when nothing is stored.

This release therefore carries everything that landed since 0.7.0: the self-verifying apply, the alias
tokens the shell actually paints with, the two community presets, and this startup fix.
## 0.7.4

**Two community presets land: Low Contrast and One Dark.**

Both arrived as pull requests against the pre-monorepo repository and were migrated with their original
author and commit messages (thanks @kurtontheway). Low Contrast is dsh's own palette with its luminance
range compressed: every label sits at the softest value that still clears its WCAG target (7:1 primary,
4.6:1 secondary, 3.2:1 tertiary). One Dark brings Atom's classic `#282c34` / `#abb2bf` pair as the first
preset whose surfaces are not derived from its accent, with One Light on the light side and Atom blue for
the accent family. The suite is 14 presets now; the panel count and the README were updated to match.
## 0.7.3

**Presets now cover every alias token the shell paints with, not only the ones the settings page uses.**

Auditing what `ui-layout`, `ui-sidebar`, `ui-chat` and `ui-conversation` actually read found 20 alias
tokens in use and only 10 of them covered by the preset surface. The ten missing ones are exactly the
ones the settings page barely touches and the conversation leans on: `--dsw-alias-label-caption`,
`--dsw-alias-border-l1`, the two `--dsw-alias-scrollbar-*` tokens, `--dsw-alias-markdown-code-block`
(every code block in the transcript) and the two `--dsw-alias-turn-trigger-bg*` tokens. Those kept the
host palette while the surface that owns the settings repainted, which is what "switching a preset only
changes the settings page" looks like from the outside.

`surfaceTokens()` derives all ten from the same two anchors as the rest of the family. Semantic states
(`--dsw-alias-state-error-*` and friends) are still deliberately not derived from the accent: an error
has to stay an error in every theme.
## 0.7.2

**The panel now verifies its own write instead of assuming it landed.**

`overrideTokens` publishes a snapshot and dsh's own presenter (in `ui-layout`) writes the
tokens onto `body`. Nothing in this plugin could tell whether that write happened — a token
the host kept, or a presenter that never ran, looked exactly like a theme that simply did not
paint, which is what "switching a preset only changes the settings page" looks like from the
outside.

Every apply now reads `document.body.style` back on the next frame and reports the shortfall
(`verify()` on the bridge); the panel raises an error toast naming the tokens that did not
land. Silence means they are on `body`.

## 0.7.1

**Client half now type-checks against the host's own client types.**

The panel used to declare a local mirror of the `slots` and `locale` services (plus `theme`
for the theme panel), so nothing checked the registration against the host. It now imports
`SlotRegistry`, `LocaleRuntime` and `ThemeRuntime` from the official client packages and
declares its locale namespace through `LocaleNamespaceMap` — which is what the host's
registration signature requires before it will accept `locale: NS`.

That check immediately found missing dictionary keys: strings the panel asked for that
neither dictionary defined (they rendered as the raw key). They are now translated in both.

## 0.7.0

**dsh 0.2.0-rc.2 alignment: host-provided packages move to pinned peer dependencies.**

Every `@deepseek-ai/*` package the host supplies — `dsh-llm`, `dsh-agent`, `dsh-session`,
`dsh-tools` and friends — is now declared in `peerDependencies`, pinned to `0.2.0-rc.2`, with
`@deepseek-ai/cordis` at `~4.0.4`. That is how the official plugins declare them. The previous
declarations were older ranges in the wrong section, which let a stale core copy be installed
into a dsh profile and stop the host from starting.

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
