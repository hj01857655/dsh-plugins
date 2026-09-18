# Design — dsh-prompt-vcs

## Positioning

Agent prompts change constantly: the user edits AGENTS.md, a plugin adds a rule, a skill
file gets rewritten. There is no history. When the agent starts behaving differently and
you wonder "what changed?", the answer is gone.

This plugin is git for prompts: every change to the agent's instruction surface is
snapshotted, diffable, and rollbackable.

One sentence: **every change to your agent's instructions is recorded with a diff, and
any change can be undone.**

## What it does

- **Watch the instruction surface.** The files that shape agent behaviour: `AGENTS.md`,
  `CLAUDE.md`, skill files under `skills/`, and the profile's model/system-prompt
  config. A file watcher + change event hook captures modifications.
- **Snapshot on change.** When a watched file changes, store the diff (unified format)
  + metadata (timestamp, changed-by, file path) in `.promptvcs/history.jsonl`.
  `changed-by` is attributed: user edit, plugin write (with plugin id), or agent
  self-modification.
- **Timeline.** `promptvcs log` shows the history: when, what file, who changed it,
  how many lines added/removed.
- **Diff.** `promptvcs diff <hash>` shows the unified diff for a specific change.
  `promptvcs diff <= <hash>` shows everything between two points.
- **Rollback.** `promptvcs rollback <hash>` restores a file to its state at a given
  change. The rollback itself is recorded in history (so you can undo the undo).
- **Panel.** A settings page with the timeline and inline diffs.

## Architecture

| Half | Entry | Owns |
|---|---|---|
| host | `apply(ctx)` | file watcher, diff engine, history store, rollback engine |
| client | `exports["./client"]` | settings page: timeline, diff view, rollback action |

## Milestones

| # | Milestone |
|---|---|
| M0 | Skeleton + file watcher + change detection |
| M1 | Diff engine + append-only history store |
| M2 | Timeline + diff view + rollback |
| M3 | Panel: timeline, inline diffs, rollback button |
| M4 | CLI: `promptvcs log`, `promptvcs diff`, `promptvcs rollback` |

## Non-goals

- Not a full VCS. No branching, no merging, no remote sync. Linear history with
  rollback is sufficient for the "what changed?" question.
- Not a general file watcher. Only the agent instruction surface is tracked;
  source code has git already.
