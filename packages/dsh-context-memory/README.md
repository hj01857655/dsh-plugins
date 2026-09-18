# dsh-context-memory

[![npm version](https://img.shields.io/npm/v/dsh-context-memory)](https://www.npmjs.com/package/dsh-context-memory) [![CI](https://github.com/hj01857655/dsh-context-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/hj01857655/dsh-context-memory/actions/workflows/ci.yml)

Cross-session memory for your dsh agent — remembered, recalled, and re-verified instead of assumed.

## Install

```sh
dsh plugin --profile web add dsh-context-memory
```

## What it does

Every session with your agent starts from nothing. What you decided yesterday, which
approach failed, the constraint you explained once — all of it is gone, and you explain
it again.

This plugin keeps it, and — unlike a note file — re-checks the parts that can be checked.

- **Remember.** A memory carries provenance: which session, which step, whether it came
  from you, the agent, or a plugin. "Why does the agent think it knows this" has an
  answer.
- **Recall.** Retrieval is ranked (token overlap, recency, verification strength) instead
  of pasting every memory into the context window. Each hit reports the breakdown of its
  score, so a ranking is never something you have to trust.
- **Forget with a reason.** A memory is superseded, never deleted. The wrong memories are
  the most valuable records in the log — they are the only thing that can explain a past
  decision.
- **Conflict detection.** Two active memories about the same subject are reported as a
  conflict. The plugin does not pick a winner; the log does not say which one is right,
  and guessing would be the unfounded assertion this plugin exists to remove.
- **Verification.** A memory whose statement has a checkable shape is compiled into a
  platform-aware guard and re-checked on demand. This is the part a notes file cannot do.

## The point

A memory is a claim about the world. Storing it makes it *available*; it does not make it
*true*. Statements like "the file README.md exists" or "config.json contains pnpm" were
true when you said them and stop being true quietly.

So `verify` turns each checkable memory back into a check and runs it:

```sh
dsh-context-memory verify
```

```
passed      4f2a9c1b8e30  the file package.json exists
violated    7d1e0a55c9f2  the file README.md contains Installation
uncheckable 2b8f31aa0456  we settled on pnpm because yarn hoisting broke the build
broken      a91c4e77b0d3  the file scripts/release.sh exists

passed 1, violated 1, broken 1, uncheckable 1
```

Four outcomes, and the distinction between them is the whole point:

| Outcome | Meaning |
|---|---|
| `passed` | The check ran and the memory holds. |
| `violated` | The check ran and the world disagrees with the memory. |
| `broken` | The check itself could not run — a typo, a missing binary. **Not** evidence about the memory. |
| `uncheckable` | No check could be compiled. The memory is still stored and recalled; it is just not verified. |

`verify` exits non-zero **only** for `violated`. A broken guard is a defect in the check,
and letting it turn a pipeline red is how a typo would get a true memory marked false —
after which you learn to ignore the output.

Nothing is ever marked as verified because it was stored, and a memory supplied by the
agent is never executed as a command: guards come from templates that only ever
interpolate quoted file paths and literal search strings.

## CLI

```sh
dsh-context-memory remember "the file package.json exists"
dsh-context-memory list
dsh-context-memory recall "how do we install"
dsh-context-memory conflicts
dsh-context-memory forget 4f2a9c1b8e30 "moved to bun"
dsh-context-memory verify        # exit 1 only on a real violation
```

## Panel

A `Context memory` page inside Settings: active and superseded memories, verification
status per memory, conflicts, and provenance. The host registers
`GET /api/context-memory.panel` and rebuilds the payload from the log on every request,
so the panel shows what is on disk rather than what was in memory at startup. A headless
host has no web connection and simply skips the route.

## Layout

| Path | Role |
|---|---|
| `src/index.ts` | Host half — `apply(ctx)`, exposes the `contextMemory` service |
| `src/memory.ts` | Fold the log, remember, supersede, conflicts, verify |
| `src/store.ts` | Append-only `.memory/events.jsonl` |
| `src/guard.ts` | Statement → platform-aware check; run it; classify pass / violated / broken |
| `src/recall.ts` | Relevance ranking with an explainable score |
| `src/identity.ts` | Id derived from the normalised subject, so repeats fold |
| `src/cli.ts` / `src/bin.ts` | Command-line entry, usable without dsh |
| `src/routes.ts` | Panel and verify routes on the host's web connection |
| `src/client/view.tsx` | Browser half — pure rendering, statically tested in Node |
| `src/client/index.tsx` | Browser half — fetch and settings registration |

## Why the log is append-only

Current state is always a fold over the events, recomputed on each read. The
alternative — a mutable store — lets the last writer decide what was always true, and
"what did the agent believe on Tuesday, and why" becomes unanswerable. The log is the
evidence, so a torn trailing line after a crash is dropped (recoverable) while damage
anywhere else is reported rather than skipped.

## Develop

```sh
npm ci
npm run typecheck
npm run build
npm test
```

## License

MIT
