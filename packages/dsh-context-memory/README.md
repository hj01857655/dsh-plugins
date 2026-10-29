# dsh-context-memory

[![npm version](https://img.shields.io/npm/v/dsh-context-memory?color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/dsh-context-memory)
[![npm downloads](https://img.shields.io/npm/dm/dsh-context-memory?color=cb3837)](https://www.npmjs.com/package/dsh-context-memory)
[![CI](https://github.com/hj01857655/dsh-context-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/hj01857655/dsh-context-memory/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/dsh-context-memory?color=blue)](LICENSE)
[![node](https://img.shields.io/node/v/dsh-context-memory?color=339933&logo=node.js&logoColor=white)](package.json)
[![GitHub stars](https://img.shields.io/github/stars/hj01857655/dsh-context-memory?color=yellow)](https://github.com/hj01857655/dsh-context-memory/stargazers)
[![dsh plugin](https://img.shields.io/badge/dsh-plugin-4B8BBE)](https://github.com/topics/dsh-plugin)

Cross-session memory for your dsh agent — remembered, recalled, and re-verified instead of assumed.

**Stable since 1.0.** Beyond explicit "记住…" capture, every finished turn's tool
results are harvested into the review queue on their own — failed commands first — so
the memory fills without being asked, and the panel shows the automatic seams working.

## Install

```sh
dsh plugin --profile web add dsh-context-memory
```

## Tools

| Tool | What it does |
|---|---|
| `memory_remember` | Record a durable memory (conventions, decisions, preferences, pitfalls). |
| `memory_recall` | Ranked retrieval with verification state; Chinese matches on 2-grams. |
| `memory_forget` | Supersede a memory by id or query — reason required, record kept. |
| `memory_conflicts` | Subjects with disagreeing active records. |
| `memory_stats` | Active / retired / contradicted / uncheckable / conflicts + pending candidates + log path. |
| `memory_verify` | Run all stored filesystem checks now; report the four buckets plus only the verdicts that changed. |
| `memory_accept` | Accept a pending candidate as a memory (optional kind/scope override); recorded as agent provenance. |
| `memory_dismiss` | Decline a pending candidate, keeping the answer so it is not proposed again. |

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
  score, so a ranking is never something you have to trust. Chinese and English are
  tokenized equally, so a Chinese question finds a Chinese memory.
- **Forget with a reason.** A memory is superseded, never deleted. The wrong memories are
  the most valuable records in the log — they are the only thing that can explain a past
  decision.
- **Conflict detection.** Two active memories about the same subject are reported as a
  conflict, with both texts shown. The plugin does not pick a winner; the log does not say
  which one is right, and guessing would be the unfounded assertion this plugin exists to
  remove.
- **Verification.** A memory whose statement has a checkable shape is compiled into a
  guard and re-checked — automatically at most once a day, and on demand from the CLI or
  the panel. This is the part a notes file cannot do.
- **Two scopes.** A convention of this checkout and a preference that follows you are
  different claims, and they are stored in different logs.

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

| Outcome | Meaning | Reaches the model as guidance? |
|---|---|---|
| `passed` | The check ran and the memory holds. | yes, and it ranks higher |
| `violated` | The check ran and the world disagrees with the memory. | **no** — reported separately as contradicted |
| `broken` | The check itself could not run — its operand is unreadable. **Not** evidence about the memory. | yes |
| `uncheckable` | No check could be compiled. The memory is still stored and recalled; it is just not verified. | yes |

A `violated` memory stays in the log and in the panel, but recall skips it and the
injected context puts it in its own block, marked as not to be relied on. A claim the
filesystem denies has no score at which it is safe to hand to the agent, so it is filtered
rather than down-weighted.

`verify` exits non-zero **only** for `violated`. A broken guard is a defect in the check,
and letting it turn a pipeline red is how a typo would get a true memory marked false —
after which you learn to ignore the output.

Nothing is ever marked as verified because it was stored, and a memory supplied by the
agent is never executed: a guard supplies a path and a search string to `fs`, never a
program or an argument list.

### What can be checked

Eight statement shapes compile to a guard. Four are about a file's text; four are about a
file's structure, which is answered by `JSON.parse` and a line count — still in-process,
still with no program taken from the memory.

| Statement | Predicate | Read as |
|---|---|---|
| `the file X exists` / `never commit X` | `exists` / `absent` | `fs.stat` |
| `the file X contains Y` / `the file X must not contain Y` | `contains` / `lacks` | substring |
| `package.json depends on X` / `package.json does not depend on X` | `depends` | key in `dependencies`, `devDependencies`, `peerDependencies` or `optionalDependencies` |
| `package.json script build runs tsc --noEmit` / `package.json has no deploy script` | `script` | exact value in `scripts` |
| `tsconfig enables strict` / `tsconfig does not enable strict` | `option` | top-level or `compilerOptions`; `jsconfig` works too |
| `the file X has at most N lines` / `at least N lines` | `lineLimit` | content lines, not a trailing newline |

The structural predicates exist because the text ones cannot answer structural questions
honestly. `the file package.json contains tsx` passes when `tsx` appears in a description,
a `files` entry, or another script's command string — a check that reports `passed` while
verifying nothing. `package.json depends on tsx` reads the key. Likewise a script command
is matched exactly, not by prefix: `build runs tsc` and `build runs tsc --noEmit` are
different claims and must not verify each other.

Everything else stays `uncheckable`, deliberately. `the build uses pnpm` needs a
definition of "build tool"; any approximation would produce a check that passes for some
other reason. A statement with no unambiguous predicate is more honest left unverified.

## Where memories live

| Scope | Directory | Use it for |
|---|---|---|
| `project` (default) | `<projectRoot>/.memory/` | build tooling, layout, pitfalls of this checkout |
| `user` | `$DSH_HOME/context-memory/` | preferences that follow you across every project |

The project root is found by climbing to the nearest `.git` or `pnpm-workspace.yaml`, and
the session's own working directory is what the climb starts from — so a session opened in
`packages/app/src` and one opened at the root share a log. A directory with no marker above
it is its own project.

The session directory comes from the host's `workingDirectory` service when one is
mounted, and from the session header's `cwd` when it is not. The plugin does **not**
declare that service as a dependency: it is only mounted by hosts whose `dsh-base` bundle
includes it, and declaring it would leave the whole plugin `pending (waiting for service:
workingDirectory)` on a host that does not — which looks exactly like the plugin not being
installed.

## CLI

```sh
dsh-context-memory remember "the file package.json exists"
dsh-context-memory remember "always answer in Chinese" --global
dsh-context-memory list
dsh-context-memory recall "构建用什么"
dsh-context-memory conflicts
dsh-context-memory candidates      # statements noticed but not remembered
dsh-context-memory accept 4f2a9c1b8e30
dsh-context-memory dismiss 9c1e77b0d3aa
dsh-context-memory forget 4f2a9c1b8e30 "moved to bun"
dsh-context-memory verify        # exit 1 only on a real violation
```

## Model tools (pull)

Injection is one direction only. Two tools give the model the other one, so it can ask
rather than wait to be told:

| Tool | Arguments | Returns |
|---|---|---|
| `memory_recall` | `query?`, `limit?` (1–20, default 5), `include?` | Matching memories with id, kind, scope, and verification state |
| `memory_remember` | `text`, `kind?`, `subject?`, `scope?` | The new id, and the check that will re-verify it (or an explicit "none could be compiled") |

`memory_recall`'s `include` chooses the population: `guidance` (default — active and not
contradicted), `contradicted`, `superseded`, or `all`. The default matches what the push
path may offer, because unsolicited text and an answer to a question are not the same
thing; widening it is a per-call decision the caller makes by name. Omit `query` to list
the newest memories instead of the most relevant — "what do you remember" has no lexical
content to rank.

`memory_remember` writes with `source: 'agent'`, so the panel can tell what the user said
from what the model decided to write down. A statement already on file reports
`updated: true` with its original id and creation time, rather than claiming a new record.

Both tools are registered through `ctx.inject(['tools'])`, not a static dependency. A host
with no tool registry — the CLI, a headless profile — loses exactly these two tools and
nothing else; the pre-step, the service, and the panel keep working.

## Auto capture and recall injection (0.6.0+)

The plugin hooks into `agent/pre-step` to close the loop automatically:

- **Auto capture.** When the user's message contains an explicit memory statement
  ("记住…", "remember that…"), the plugin distills and stores it before the agent sees
  the request. Each captured memory carries session provenance — which agent, which
  session — so "why does the agent think it knows this" always has an answer.

- **Recall injection.** Before each agent step, the top-5 memories whose subject
  overlaps the user's text are folded into the request as a collapsible context message
  (source `plugin/dsh-context-memory`, form `recall`). Contradicted memories go into a
  separate block marked as not to be relied on, and unresolved conflicts are listed with
  both sides. The injection position is right after the claimed batch — the same
  slot the host's own context plugins use.
- **Automatic re-verification.** At most once a day, the guards are re-run before the
  recall is composed, so a memory the world has since disproved is never offered in the
  very step that would have used it. Only a changed outcome is appended to the log.

- **Candidate proposals.** Statements that look like durable facts but were never asked to
  be kept — "我们用 sqlite 存会话数据" with no "记住" — are proposed to the panel instead of
  being written to the log. Accepting one turns it into a memory; dismissing it records
  the answer so it is not asked again. See below.

Both features can be toggled from the panel's 「集成」 card. When auto capture is off,
memories are still stored via the CLI and service API. When recall injection is off,
the plugin still records but does not inject.

## Candidates: what the plugin noticed but was not allowed to keep

Explicit verbs are safe to act on because the user asked. Widening the patterns to
ordinary declarative sentences is not: the same shape produces "we use sqlite" and "we use
two queues in this diagram", and writing both to the log makes recall worse than the
narrow rule it replaced.

So the wide net **proposes** and does not write:

| Step | Where it lives | Effect on recall |
|---|---|---|
| A declarative sentence with a technical token is noticed | `.memory/candidates.jsonl` | none — it is not a memory |
| You accept it (panel, `accept <id>`) | `.memory/events.jsonl` | it becomes a memory, `source: 'user'` |
| You dismiss it (`dismiss <id>`) | stays in `candidates.jsonl` as dismissed | none, and it is not proposed again |

What the proposal rule requires, in order: not a question, not a directive to the agent,
at least six characters, and a token that looks like a name (`pnpm`, `@scope/pkg`, a path).
That last condition is what separates "we use pnpm" from "我们用两个队列" — the first names
something a future reader could act on, the second is ordinary conversation. At most three
are proposed per message; a message that trips more patterns is usually about something
else.

The queue is append-only and folded the same way the memory log is, so two processes
reading it agree on which questions are still open, and "we offered this and you declined"
stays answerable.

## Panel

A `Context memory` page inside Settings: active, contradicted, and superseded memories,
verification status per memory, conflicts, provenance, and integration toggles. The host
registers `GET /api/context-memory.panel` and rebuilds the payload from the log on every
request, so the panel shows what is on disk rather than what was in memory at startup. A
headless host has no web connection and simply skips the route.

## Layout

| Path | Role |
|---|---|
| `src/index.ts` | Host half — `apply(ctx)`, exposes the `contextMemory` service |
| `src/memory.ts` | Fold the logs, remember, supersede, conflicts, verify |
| `src/store.ts` | Append-only `.memory/events.jsonl` for one scope |
| `src/scope.ts` | Project-root discovery and the user-global directory |
| `src/guard.ts` | Statement → filesystem predicate; run it; classify pass / violated / broken |
| `src/recall.ts` | Relevance ranking with an explainable score; CJK 2-gram tokenizer |
| `src/identity.ts` | Id derived from the normalised subject, so repeats fold |
| `src/capture.ts` | Pure distiller: explicit verbs in, statements out; wide-net proposals |
| `src/candidates.ts` | Append-only proposal queue — noticed, decided, never auto-remembered |
| `src/cli.ts` / `src/bin.ts` | Command-line entry, usable without dsh |
| `src/tools.ts` | Model-facing `memory_recall` / `memory_remember` |
| `src/routes.ts` | Panel and verify routes on the host's web connection |
| `src/client/view.tsx` | Browser half — pure rendering, statically tested in Node |
| `src/client/index.tsx` | Browser half — fetch and settings registration |
| `tests/activation.test.mjs` | Boots the plugin in a real cordis `Context` — the checks the rest of the suite cannot make |
| `tests/tools.test.mjs` | Runs both tools through a real `ToolRuntime` — registration, argument validation, output validation |
| `tests/candidates.test.mjs` | Proposals are questions: they never reach recall without an acceptance |
| `tests/routes.test.mjs` | The candidate route table on a real connection registration |

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

