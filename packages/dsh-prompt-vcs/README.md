# dsh-prompt-vcs

[![npm version](https://img.shields.io/npm/v/dsh-prompt-vcs?color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/dsh-prompt-vcs)
[![npm downloads](https://img.shields.io/npm/dm/dsh-prompt-vcs?color=cb3837)](https://www.npmjs.com/package/dsh-prompt-vcs)
[![CI](https://github.com/hj01857655/dsh-prompt-vcs/actions/workflows/ci.yml/badge.svg)](https://github.com/hj01857655/dsh-prompt-vcs/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/dsh-prompt-vcs?color=blue)](LICENSE)
[![node](https://img.shields.io/node/v/dsh-prompt-vcs?color=339933&logo=node.js&logoColor=white)](package.json)
[![GitHub stars](https://img.shields.io/github/stars/hj01857655/dsh-prompt-vcs?color=yellow)](https://github.com/hj01857655/dsh-prompt-vcs/stargazers)
[![dsh plugin](https://img.shields.io/badge/dsh-plugin-4B8BBE)](https://github.com/topics/dsh-plugin)

Every change to your agent's instructions is recorded with a diff, and any change can be undone.

## Install

```sh
dsh plugin --profile web add dsh-prompt-vcs
```

Or from source:

```sh
dsh plugin --profile web add github:hj01857655/dsh-prompt-vcs
```

## What it does

- **Watch the instruction surface.** `AGENTS.md`, `CLAUDE.md`, skill files — any file
  that shapes how the agent behaves.
- **Snapshot on change.** Unified diff + attribution (user / plugin / agent) stored in
  `.promptvcs/history.jsonl` (append-only).
- **Timeline.** `promptvcs log` shows every change: when, what file, who changed it,
  how many lines were added or removed.
- **Diff.** `promptvcs diff <hash>` shows the unified diff for a specific change —
  additions, deletions, and context lines.
- **Rollback.** `promptvcs rollback <hash>` restores a file to its state before a change.
  The rollback itself is recorded as a new change, so the timeline stays complete.
- **File stats.** Per-file change frequency and size of changes over time.
- **Panel.** Timeline with inline diffs, per-file stats, and rollback button.

## CLI

```sh
dsh-prompt-vcs log               # show change history
dsh-prompt-vcs diff <hash>       # show diff for a change
dsh-prompt-vcs rollback <hash>   # undo a change
```

## Panel

A `Prompt VCS` page inside Settings. The host registers `GET /api/prompt-vcs.panel` and
rebuilds the payload from the history log on every request. A headless host simply skips
the route.

The panel shows:

- Change timeline with inline unified diffs
- Per-file change frequency
- Attribution per change (user / plugin / agent)
- Rollback action per change

## Layout

| Path | Role |
|---|---|
| `src/index.ts` | Host half — `apply(ctx)`, exposes the `promptVcs` service |
| `src/vcs.ts` | Core VCS logic — record, timeline, rollback, file stats |
| `src/diff.ts` | Unified diff algorithm |
| `src/store.ts` | Append-only `.promptvcs/history.jsonl` |
| `src/cli.ts` / `src/bin.ts` | Command-line entry, usable without dsh |
| `src/routes.ts` | Panel and rollback routes on the host's web connection |
| `src/client/view.tsx` | Browser half — pure rendering |
| `src/client/index.tsx` | Browser half — fetch and settings registration |
| `src/client/locales.ts` | zh / en dictionaries |

## Develop

```sh
npm ci
npm run typecheck
npm run build
npm test
```

## License

MIT
