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

## What it does

- **Watch the instruction surface.** `AGENTS.md`, `CLAUDE.md`, skill files.
- **Snapshot on change.** Unified diff + attribution (user / plugin / agent) stored in `.promptvcs/history.jsonl`.
- **Timeline.** `promptvcs log` shows every change: when, what file, who changed it.
- **Diff.** `promptvcs diff <hash>` shows the unified diff for a specific change.
- **Rollback.** `promptvcs rollback <hash>` restores a file to its state before a change.
- **Panel.** Timeline with inline diffs and rollback button.

## CLI

```sh
dsh-prompt-vcs log               # show change history
dsh-prompt-vcs diff <hash>       # show diff for a change
dsh-prompt-vcs rollback <hash>   # undo a change
```

## License

MIT
