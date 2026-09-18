# dsh-prompt-vcs

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
