# dsh-theme-studio

[![npm version](https://img.shields.io/npm/v/dsh-theme-studio?color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/dsh-theme-studio)
[![npm downloads](https://img.shields.io/npm/dm/dsh-theme-studio?color=cb3837)](https://www.npmjs.com/package/dsh-theme-studio)
[![CI](https://github.com/hj01857655/dsh-theme-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/hj01857655/dsh-theme-studio/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/dsh-theme-studio?color=blue)](LICENSE)
[![node](https://img.shields.io/node/v/dsh-theme-studio?color=339933&logo=node.js&logoColor=white)](package.json)
[![GitHub stars](https://img.shields.io/github/stars/hj01857655/dsh-theme-studio?color=yellow)](https://github.com/hj01857655/dsh-theme-studio/stargazers)
[![dsh plugin](https://img.shields.io/badge/dsh-plugin-4B8BBE)](https://github.com/topics/dsh-plugin)

A [dsh](https://github.com/deepseek-ai/deepseek-harness) plugin that customizes the UI theme: accent presets, a custom accent color, content density, font family, an animation toggle, and raw design-token overrides.

## What it can and cannot change

This plugin only writes design tokens that **actually exist in dsh**, verified by reading the shipped stylesheets (`@deepseek-ai/dsh-client-ui-theme/lib/client.js`). Every token it writes is listed in `src/tokens.ts` and enforced by `tests/tokens.test.mjs`.

Changes go through **`ctx.theme.overrideTokens()`** — dsh's own theme service — not direct DOM writes. See [Mechanism](#mechanism) for what that buys.

That constraint has two visible consequences:

- **No border-radius control.** dsh hardcodes `border-radius` per component — including `50%` circles and `corner-shape: round` — and ships no radius token. There is no faithful way to offer this, so it is not offered.
- **The animation toggle is a stylesheet, not a token.** dsh ships no motion tokens, so disabling animations injects a rule compressing transition and animation durations to `0.001ms` rather than `0s` — a zero duration can stop `transitionend` / `animationend` from firing and hang components that wait on them. The sheet is owned by this plugin's effect scope, so unloading removes it.

## Features

- **12 presets**: Ocean, Forest, Sunset, Monochrome, Nord, Dracula, Gruvbox, Solarized, Tokyo Night, Catppuccin, Rosé, Ember
- **Dark-aware presets** — a preset whose dark accent differs from its light one adapts automatically when dsh enters dark mode
- **Custom accent color**, plus a separate dark-mode accent
- **Contrast guard** — a dark-mode accent below a WCAG luminance floor is lightened in steps, and the panel reports that it was adjusted
- **Density**: Compact / Comfortable / Spacious, via the verified `--dsh-content-font-size` token — see the note below about the official stepper
- **Font family**: System / Monospace / Serif
- **Animation toggle**
- **Custom CSS** — override any `--dsw-*` or `--dsh-*` token
- **Import / export** themes as validated JSON
- **Live preview** rendering the real tokens, showing the accent value currently in effect

## Install

```bash
dsh plugin add dsh-theme-studio
```

From source:

```bash
git clone https://github.com/hj01857655/dsh-theme-studio.git
cd dsh-theme-studio
npm install && npm run build
dsh plugin add link:.
```

## How it works

The plugin registers a `settings.section` slot (order 47). Preferences persist in `localStorage`.

### Mechanism

Every theme change goes through dsh's theme service:

```ts
export const inject = ['slots', 'locale', 'theme']
…
ctx.theme.overrideTokens('dsh-theme-studio', overrides)
```

`overrideTokens` stacks a partial token layer over the active theme. The service handles the rest:

- **Layers compose in order, last writer wins per token.** Two theme plugins can coexist without either silently clobbering the other's unrelated tokens.
- **Every value is a `{ light, dark }` pair.** A single value would go illegible on the other color scheme, so the API rejects one. `src/apply.ts` builds the pairs; `tests/apply.test.mjs` asserts the shape of every value it can emit.
- **The layer is disposable.** Unloading the plugin removes exactly its layer, restoring whatever the host had underneath — including a font size the user chose in the official Appearance row.

The layer is keyed by source (`dsh-theme-studio`), and re-publishing replaces it wholesale, so a shrinking override set can never leave a stale token behind.

An earlier version wrote custom properties straight onto `document.body` with `style.setProperty`. That happened to work — dsh's presenter only retracts variables it wrote itself — but it bypassed the stacking order, the paired values and the dispose story, and made every reset the plugin's own responsibility.

### Density shadows the official font-size stepper

`--dsh-content-font-size` is the axis the official Appearance row owns. Overriding it here **shadows** that setting rather than changing it: while a density is selected, the official stepper appears inert, and your saved value returns untouched once this plugin is removed. The panel says so. (Calling `ctx.theme.setFontSize` instead would have written to your durable host settings, which a reset could not have restored.)

### The preview is not a mock

It renders with the same variable names the application uses, so a wrong token looks wrong in the preview too, rather than being masked by a hardcoded fallback color.

## License

MIT
