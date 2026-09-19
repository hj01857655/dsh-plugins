# Changelog

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
