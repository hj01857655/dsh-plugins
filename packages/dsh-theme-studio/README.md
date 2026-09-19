# dsh-theme-studio

A [dsh](https://github.com/deepseek-ai/deepseek-harness) plugin that customizes the UI theme: accent presets, a custom accent color, content density, font family, an animation toggle, and raw design-token overrides.

## What it can and cannot change

This plugin only writes design tokens that **actually exist in dsh**, verified by reading the shipped stylesheets (`@deepseek-ai/dsh-client-ui-theme/lib/client.js`). Every token it writes is listed in `src/tokens.ts` and enforced by `tests/tokens.test.mjs`.

That constraint has two visible consequences:

- **No border-radius control.** dsh hardcodes `border-radius` per component — including `50%` circles and `corner-shape: round` — and ships no radius token. There is no faithful way to offer this, so it is not offered.
- **The animation toggle is a stylesheet, not a token.** dsh ships no motion tokens, so disabling animations injects a rule compressing transition and animation durations to `0.001ms` rather than `0s` — a zero duration can stop `transitionend` / `animationend` from firing and hang components that wait on them.

## Features

- **12 presets**: Ocean, Forest, Sunset, Monochrome, Nord, Dracula, Gruvbox, Solarized, Tokyo Night, Catppuccin, Rosé, Ember
- **Dark-aware presets** — a preset whose dark accent differs from its light one adapts automatically when dsh enters dark mode
- **Custom accent color**, plus a separate dark-mode accent
- **Contrast guard** — a dark-mode accent below a WCAG luminance floor is lightened in steps, and the panel reports that it was adjusted
- **Density**: Compact / Comfortable / Spacious (via the verified `--dsh-content-font-size` token)
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

Two implementation details are load-bearing:

1. **Properties are written to `document.body`, not `documentElement`.** dsh defines its palette on `body` and `body[data-ds-dark-theme]`. A custom property set on `documentElement` is inherited into `body`, but body's own declaration for the same property wins — so writing to `documentElement` changes nothing at all. An earlier version made exactly that mistake.
2. **The preview is not a mock.** It renders with the same variable names the application uses, so a wrong token looks wrong in the preview too, rather than being masked by a fallback color.

## License

MIT
