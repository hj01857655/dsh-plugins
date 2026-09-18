# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0-alpha.1] — unreleased

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
