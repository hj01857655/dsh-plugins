# dsh-theme-studio

A [dsh](https://github.com/deepseek-ai/deepseek-harness) plugin that lets you customize the UI theme: pick pre-built color presets, set a custom accent color, adjust density, border radius, and font family, or write custom CSS variable overrides.

## Features

- **6 pre-built presets**: Ocean, Forest, Sunset, Monochrome, Nord, Dracula
- **Custom accent color** picker with hex input
- **Density** control: Compact / Comfortable / Spacious
- **Border radius** control: Sharp / Rounded / Soft
- **Font family** selection: System / Monospace / Serif
- **Custom CSS** textarea for advanced `--property: value;` overrides
- **Live preview** with badges, cards, and buttons
- **Instant apply** — changes take effect immediately via CSS custom properties
- **Persistent** — preferences saved in `localStorage`, no server round-trips

## Install

```bash
dsh plugin add dsh-theme-studio
```

Or from source:

```bash
git clone https://github.com/hj01857655/dsh-theme-studio.git
cd dsh-theme-studio
npm install && npm run build
dsh plugin add link:.
```

## How it works

The plugin registers a `settings.section` slot (order 47) that renders a Theme Studio page in the dsh Settings panel. All theme state is client-side: preferences persist in `localStorage` and are applied by setting CSS custom properties on `document.documentElement.style`.

The overrides target dsh's `--dsw-alias-*` semantic token layer, so they cascade through every component that reads the design tokens — no component patching required.

## License

MIT
