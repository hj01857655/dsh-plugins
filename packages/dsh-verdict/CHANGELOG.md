# Changelog

## 0.5.0

**Fixed: panels did not follow the host theme.**

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

## 0.2.0

Ecosystem sync: every plugin in this suite shares one version, so a version number
identifies a set that was tested together rather than one plugin's own history.

- Fix the Model Arena panel rendering "Cannot read properties of undefined": the host
  route returned the bare run list while the view reads `payload.recentRuns`.
- The client `inject` field now names services (`slots`, `connection`) instead of the
  packages that provide them.
- README badges cover version, downloads, CI, license, Node requirement, stars, and the
  dsh plugin topic.

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] — 2026-09-18

### Added

- Rule capture with identity derived from text, so repeated lessons collapse into one
  rule instead of near-duplicates (`verdict learn`).
- Promotion into the project agent file behind a stable marker, with the written file
  verified after the write.
- The guard compiler: a rule is promoted only when it has an executable check, and the
  compiler refuses shapes it cannot express faithfully on the current platform —
  file existence, forbidden files, forbidden root globs (`no *.pem files`), and required
  file contents (`the file README.md must mention install`).
- Automatic re-verification (`verdict check`): exit code 1 only for real violations; a
  guard that cannot run is reported as broken and never turns a pipeline red.
  Recurrence counts episodes, not runs, so a long-lived failure cannot inflate itself
  into a promotion.
- Skill distillation from repeated successful sessions (`verdict session`, `verdict
  skills --write`); a skill is written only when its procedure actually repeats.
- Before/after snapshots (`verdict diff before|after|`) with the honest answer: no
  verdict without both snapshots, and guard-availability changes reported separately
  from improvements.
- Static load-path diagnostics (`verdict doctor`, `verdict inventory --audit`) covering
  everything about loading that can be checked without a running dsh.
- The dsh settings page: `settings.section` slot fed by `GET /api/verdict.panel`, with
  a `POST /api/verdict.skills.write` action; hosts without a web connection skip it.
- Scheduled re-verification for resident hosts (every six hours; the timer never keeps
  a process alive on its own).
- The CLI is usable without dsh, so every claim the plugin makes can be checked
  independently.

### Fixed

- Cordis dependency injection: host and client halves use `ctx.inject` instead of
  direct property access, fixing `cannot get property without inject` on real dsh.
- `package.json` declares `dsh.bundle.patch` so dsh loads the plugin as a profile layer.

### Verified

- Loads inside dsh `0.1.5-rc.2`; panel API and settings page confirmed on real
  hardware.
