# Changelog

## 1.2.0

**A proposal now says where it came from, the re-check cadence is a choice instead of a
constant, and the user-global log can leave the machine.**

1.0 and 1.1 built a review queue and handed the agent the ability to work it. What the
queue still withheld was the one fact a reviewer needs to decide: whether the sentence
came from the person or from a tool.

### Candidate origin

`Candidate` gained `origin` (`user-text` | `turn-harvest`) and, for harvested proposals,
`reason` (`error` | `command` | `discovery`). The panel shows a per-row badge, `candidates`
prints it, and both stay silent in the ordinary case: a capture-seam proposal omits
`origin` entirely, so records written before 1.2 read exactly as before and the log keeps
the smallest shape that still says the right thing.

The two seams are not equally strong evidence — a failed command's error line is a
different claim from a sentence someone typed — and a queue that showed only the text
forced the reviewer to reconstruct that from memory.

### The re-check interval is a pref

`REVERIFY_INTERVAL_MS` was a 24-hour constant. How stale a checkable memory may get is a
property of the project — a repo under active edit wants hours, a dormant one wants days —
so it became `reverifyIntervalMs` with a one-minute floor (below that, the pre-step's own
throttle is the real answer). The panel offers hourly / daily / weekly / monthly; the CLI
and any other caller can set it through the same route.

### `export` / `import` cover the global log

Both commands took `--scope user` (`--global` also accepted). The user-global log is the
one that most needs a backup: it holds the preferences that follow a person across
projects, and it is the only log a checkout cannot carry. Import keeps its cross-scope
deduplication — a statement already declared global is not written into the project log
as well.

## 1.1.0

**The agent can finish the review loop itself, the queue depth is visible to it, and a
log can leave the machine that wrote it.**

1.0 made the harvest propose. Until now only the panel and the CLI could decide, which
left the model able to see a growing queue and unable to act on it — the one population
in the plugin that a session reaches but cannot resolve.

### `memory_accept` / `memory_dismiss`

Two tools that act on exactly one pending candidate. `memory_accept` records the
statement as a memory, optionally overriding `kind` and `scope`; `memory_dismiss`
retires the proposal so the same sentence is not offered again. Both report a miss
(`ok: false` plus a reason) rather than throwing when the id is unknown or already
decided, and neither can write a memory the queue never held — the id must name an open
candidate, which is the same gate the panel uses.

Accepting through a tool records `source: 'agent'`, not `'user'`: provenance names who
decided, and a later "why does the agent believe this" has to distinguish a person
confirming from the agent confirming its own proposal. `ContextMemory.accept` grew an
optional `source` for this; the panel and CLI keep the `user` default.

### `memory_stats` reports the queue

The stats tool gained `pendingCandidates`, and its rendered line names the two tools that
decide when the count is non-zero. A model that checks its own memory health now learns
there is something to resolve instead of reading a number it cannot act on.

### `export` / `import`

`events.jsonl` was always the portable artifact — the fold reproduces every state from it
alone. Two CLI commands make that usable: `export <file>` copies the project log,
`import <file>` merges another log in, skipping events whose id the project already
holds, so re-importing an overlapping backup is a no-op and a fresh machine inherits the
history without duplicates.

## 1.0.0

**The memory now tends itself: a finished turn's tool results join the review queue on
their own, the panel shows the automatic seams working, and the whole surface is
declared stable.**

The engine — capture, guards, recall ranking, conflict surfacing — was already at the
quality 1.0 promises and carries 165 tests. What 1.0 adds is the part that makes a
memory live without being asked: most durable facts a session produces never reach the
"记住…" trigger, because they arrive as tool output.

### Turn-end harvest

Every committed `turn/end` folds that turn's `tool/result` events into the candidate
queue: failed commands first (a failed command is the cheapest durable lesson a log
holds), then command-shaped facts, at most three per turn, deduplicated against the log
and the open queue by the same id derivation a memory uses. Nothing is written without
a person — the harvest proposes, the queue's confirm step decides. Subagent sessions
are excluded: their tool output belongs to their task, not to the project log. Each
turn is harvested once per session, so a replayed log never re-proposes. Switchable
through the panel (`harvest`) like every other seam.

### Activity counters

The panel gains an "automatic activity" strip — steps injected, turns harvested, and
pending candidates highlighted — served by a new `GET /api/context-memory.stats` route.
A memory plugin whose only feedback is silence looks broken even when it works; the
counters are cheap proof of life, polled on the panel's own reload cadence.

### Stability declaration

`peerDependencies` stay `^0.2.1-rc.2` (covering rc.2–rc.4 as shipped); the engine, the
event shapes, and the queue format are declared stable: from here, breaking them takes
a major.

## 0.9.0

**A memory a check contradicts is no longer offered as guidance, Chinese queries return
results, a project's memory follows the project rather than the launch directory, the model
can ask what is remembered, a guard can read a file's structure instead of scanning its
text, and an ordinary declarative sentence is offered for confirmation instead of being
silently dropped or silently kept.**

These close defects that made the plugin quietly worse than having no memory at all, and
add the two abilities the design was missing: a structural check, and a capture rule wider
than an explicit verb.

### A contradicted memory is filtered out, not down-weighted

`verify` has always sorted outcomes three ways, but the verdict never reached recall:
the fold recorded `verification` on the state and left `status: 'active'` alone, and
`scoreMemory` deducted 0.2 from the score. So a memory the filesystem had explicitly
denied still ranked, still fit under `Relevant memories from previous sessions`, and
still reached the model — as advice. That is worse than the plugin not existing, because
the user believes the agent has remembered something.

The population is now split. `guidance()` and `recall()` exclude contradicted memories;
`contradicted()` returns them; the panel lists them under their own heading; and the
pre-step renders them as a separate block that says not to rely on them and to correct
or supersede them. They stay in the log — a memory the world disproved is the most
informative record it holds — and they are never ranked.

A `broken` check still says nothing about the memory: an unusable check leaves the
memory in `guidance()`. Only `violated` is evidence.

Conflicts are computed over guidance only. A memory whose check denied it is not an open
question — the world already answered it — so presenting one as a live conflict would be
the opposite of resolving it.

### Chinese recall was zero

`tokenize` split on `/[^a-z0-9_.-]+/`, which is every CJK code point, so any Chinese query
produced an empty token list and matched nothing:

```
tokenize('这个项目构建用 pnpm')  → ['pnpm']
tokenize('构建用什么')           → []
```

`capture.ts` had always accepted Chinese memory verbs, so the plugin could store Chinese
statements and never find them again.

CJK runs are now cut into overlapping 2-grams alongside the existing Latin tokens —
`构建用什么` becomes `构建 / 建用 / 用什 / 什么`. Two characters is the smallest unit that
carries meaning in Chinese, and 2-grams need no dictionary, no dependency, and no model.
Straddling grams are what let a query match a memory whose surrounding wording differs.

### Memory follows the project, not the process

`apply()` used `resolve(process.cwd())`. dsh sessions carry their own working directory,
and it can move: `workingDirectory.set()` is called by the worktree plugin and the SDK
server. So a session started one level down inside a checkout wrote to a different log,
and a session that moved wrote somewhere else again.

The pre-step now asks the host — `ctx.workingDirectory.ensure(agent, signal)` — and falls
back to the session header's original `cwd`. `findProjectRoot` then climbs to the top of
the checkout, which is what makes `packages/app/src` and the repository root the same
project. The marker set is `.git` and `pnpm-workspace.yaml`; `package.json` is
deliberately not one, because a stray `package.json` in a home directory would merge every
unrelated folder beneath it into one project.

The CLI resolves the same way, so `cd packages/x && dsh-context-memory list` sees the
root's log. Subagents are skipped: they run in their own session and must not inherit the
parent's project just by sharing a process.

### Two scopes instead of one

A project convention and a working preference are different claims. `remember` takes a
`scope`: `project` (default, `<projectRoot>/.memory/`) or `user`
(`$DSH_HOME/context-memory/`, resolved through `@deepseek-ai/dsh-home-paths`). The fold
reads both logs; a memory carries the scope it was written under, and the two populations
do not leak into each other. The CLI gains `--scope` and `--global`, the panel route
accepts `scope`, and a log written by 0.8.x reads as `project`, which is what it was.

The id is unchanged by scope, so promoting a statement from project to user keeps its
identity visible rather than appearing as two unrelated hashes.

### `verify` can run without writing

`verify(now, { record, changedOnly })`: `record: false` computes results without appending;
`changedOnly: true` appends only when the outcome differs from the last recorded one. The
pre-step re-checks at most once a day and uses `changedOnly`, so guarding against staleness
no longer grows the log by one line per memory per day.

### The plugin did not load on the runtime it was built for

The peer set was pinned to `0.2.0-rc.2`. The installed dsh is `0.2.1-rc.2` — both the
CLI and the desktop app — and `dsh` refuses to mount a bundle whose peers disagree with
the running version:

```
dsh: skipping profile bundle "dsh-context-memory": Error: Plugin
dsh-context-memory@0.9.0 is incompatible with dsh 0.2.1-rc.2 ...
```

That is a hard skip, not a warning: nothing in this release would have run. Peers are now
`^0.2.1-rc.2` (which `semver` reads as "≥ 0.2.1-rc.2 and < 0.3.0"), with
`@deepseek-ai/cordis` at `~4.0.5`, matching the versions the official 0.2.1-rc.2 plugins
declare.

`@deepseek-ai/dsh-working-directory` is a **devDependency only**. It is imported for its
types — the package augments cordis's `Context` with `workingDirectory`, so the call site
is checked against the signature the host was built with instead of a hand-written mirror
— and `import type {}` erases at build time, so there is nothing to resolve at runtime.
`src/working-directory.ts`, which restated that interface by hand, is gone.

### `workingDirectory` is read opportunistically, not required

`export const inject = ['workingDirectory']` was wrong, and measurably so. That service is
mounted by a row in the `dsh-base` bundle's patch, and this machine's global install has
`@deepseek-ai/dsh-base@0.2.0-rc.2` next to `dsh@0.2.1-rc.2` — npm reports it as
`invalid`, the host boots anyway, and the row that mounts `working-directory` is simply
absent. Declaring the dependency made the whole plugin wait:

```
dsh-context-memory (dsh-context-memory): pending (waiting for service: workingDirectory)
```

A pending fiber is indistinguishable from an absent one: no pre-step, no service, no
recall. It now reads `ctx.get('workingDirectory')` — which returns `undefined` rather than
throwing for an unprovided service, confirmed against cordis 4.0.5 — and falls back to the
session header's `cwd`, which is what the plugin used before it knew the service existed.
`inject` is `[]`.

`tests/activation.test.mjs` is new and covers both cases: the empty declaration, and a
full pre-step on a host with no `workingDirectory` service at all. These are the checks the
rest of the suite could not make — every other test constructs `ContextMemory` directly,
so all of them pass on a plugin the host would refuse to load.

### The model can ask, not only be told

Memory had one direction: the pre-step pushes what the plugin thinks is relevant. A model
that needed to know "what did we already decide about this" had no way to ask, so the one
question memory exists to answer was the one it could not pose.

Two tools now fill the pull half.

`memory_recall(query?, limit?, include?)` ranks stored memories and returns each with its
id, kind, scope, and verification state. `include` selects the population — `guidance`
(default), `contradicted`, `superseded`, `all` — and the default deliberately matches what
the push path may offer. The two directions want different answers to "what is true":
unsolicited text influences the turn, so it may only carry guidance; an answer to a
question someone asked may include what a check disproved, if they asked for it by name.
Omitting `query` returns the newest rather than nothing, because "what do you remember"
has no lexical content to rank.

`memory_remember(text, kind?, subject?, scope?)` records with `source: 'agent'`, so the
panel still separates what the user said from what the model wrote down. The reply carries
the compiled check, or says plainly that none could be compiled. A statement already on
file reports `updated: true` with its original id and creation time — the log is
append-only and folds by id, so the honest answer is "refreshed", not "recorded".

Both register through `ctx.inject(['tools'])`. A static `inject` entry would make the tool
registry a precondition for the whole plugin, and this plugin must keep working on a host
that mounts none — the CLI, a headless profile. There, exactly two tools are absent and
everything else runs. `tests/activation.test.mjs` asserts that.

`tests/tools.test.mjs` runs both through a real `ToolRuntime` rather than calling the
executor: `defineTool` compiles the schema at registration and validates arguments and
output per call, so a direct call would pass on a definition the registry rejects.

Writing these tests found a real gap in the injection path as well. `runGuard` reports a
reason when a check *cannot run*, but a check that ran and came back false returns an
empty `output` — so every contradicted memory was rendered as "contradicted" with no
indication of which path or string had been tested. `describeContradiction` now falls back
to the check's own description, and the pre-step block and `verify` output both use it.

### Guards can read a file's structure, not only its text

Four predicates answered questions about a file's *text*. That made the most common
verifiable claims in a JS/TS project uncheckable, and the workaround was worse than
admitting it: `the file package.json contains tsx` compiles, passes, and verifies nothing —
`tsx` is in the description, in a `files` entry, or inside another script's command string.
A memory that has never been checked is honest; one whose check passes for the wrong reason
is not.

Four structured predicates now parse the file instead of scanning it:

| Statement | Predicate |
|---|---|
| `package.json depends on X` / `does not depend on X` | `depends` — a key in `dependencies`, `devDependencies`, `peerDependencies` or `optionalDependencies` |
| `package.json script build runs tsc --noEmit` / `has no deploy script` | `script` — exact value of `scripts.build` |
| `tsconfig enables strict` / `does not enable strict` | `option` — top level or `compilerOptions` |
| `the file X has at most N lines` / `at least N lines` | `lineLimit` — content lines |

Still no shell: `JSON.parse` and a line count are in-process. The memory still supplies
operands only — a key name, a script name, a bound — never a program.

Three decisions in there are load-bearing:

- **Exact script match, not prefix.** `build runs tsc` and `build runs tsc --noEmit` are
  different claims; a prefix match would let one verify the other.
- **`compilerOptions` is searched.** Every real `tsconfig.json` puts `strict` inside it, so
  a top-level-only lookup would report a correct memory as `violated` — and a false
  contradiction is the one outcome this module must not produce.
- **A negated option means "not on", not "not present".** `tsconfig does not enable strict`
  carries `value: true, absent: true`, so an explicit `"strict": false` satisfies it. Testing
  only for key absence would call that memory violated.

`usableGuard` changed from four `||` comparisons to a whitelist. An unknown `kind` — from a
newer version, or a hand-edited log — is dropped and the memory becomes `uncheckable`,
instead of reaching `runGuard` and being answered by whichever branch its fallthrough
happens to be.

One gap surfaced while shaking out the real host: a `lineLimit` guard with neither `max`
nor `min` (only reachable from a hand-edited log) counted the lines and reported `passed`,
which is a check that verified nothing. It is `broken` now, and tested.

### Capture notices more, but writes only what was asked for

The capture rules required an explicit verb — "记住…", "remember that…", "以后…". That
kept the log clean and made the plugin miss the most ordinary way a person states a fact:
"我们用 sqlite 存会话数据" is exactly the kind of thing a memory is for, and nothing
captured it.

Widening the regex would have been the wrong fix. The same sentence shape produces "we use
sqlite" and "we use two queues in this diagram"; a rule that cannot tell them apart and
writes both is a rule that makes recall worse than the narrow one it replaced.

So capture now has two tiers, and the wide one does not write:

| Tier | Trigger | Outcome |
|---|---|---|
| explicit | a memory verb | written to the log, as before |
| implicit | a declarative shape plus a technical token | **proposed**, in `.memory/candidates.jsonl` |

A proposal becomes a memory only when someone accepts it — from the panel's 「待确认」 card
or with `dsh-context-memory accept <id>`. Dismissing records the answer, so the same
sentence is not offered again on every step.

What the proposal rule actually requires, and why each condition is there:

- **A technical token** (`pnpm`, `@scope/pkg`, a path) — the only cheap proxy for
  "something a future reader could act on". Without it, "我们用两个队列" becomes a candidate.
- **Not a question, not a directive** — "我们用 sqlite 吗？" asks, and "帮我用 pnpm 装一下"
  instructs this turn; neither is a claim about the project.
- **At most three per message** — a message that trips more patterns is usually about
  something else, and ten rows at once get ignored exactly like none.

The queue is a second append-only log beside `events.jsonl`, folded the same way. Two
processes reading it agree on which questions are open, and "we offered this and you
declined" stays answerable. A candidate has no scope, no guard, and no claim on recall;
`accept` is the only path from a heuristic into the log, and it writes with
`source: 'user'` because a person said yes.

`tests/candidates.test.mjs` (13) checks that boundary from both sides — pending never
appears in `recall`, accepting writes once, dismissing writes nothing, and a decided id
cannot be re-answered. `tests/routes.test.mjs` (6) covers the panel route, including the
one that matters: there is no route that remembers an unaccepted proposal.

### Declarations

`src/scope.ts` is new (root discovery, user path). `src/tools.ts` is new.
`src/candidates.ts` is new (the append-only proposal queue). `MemoryStore`
now takes the `.memory` directory rather than the project directory, because the caller is
the one that knows which scope it is. `ContextMemory.record` returns the memory plus
whether it already existed, so the tool does not have to re-derive the id to answer that.
`recall` and `ContextMemory.recall` take a trailing `target`, defaulting to `guidance`.
`Guard` grows from four members to eleven (eight predicates; three with a negated variant).
`runGuard` is a flat dispatch per kind rather than "exists/absent, then read and search",
which is what let the structured kinds be added without each one inheriting the text
branch's assumptions. `ContextMemory` gains `propose` / `candidates` / `accept` / `dismiss`,
where `accept` is the only method that writes a candidate into the log.

138 tests, up from 60. Of those, 110 came with the recall/guard work (four activation,
eight tool, twenty-two guard); the widening added eight capture cases, thirteen for the
queue itself, six through the real route registration, and one that runs a declarative
statement through the real `agent/pre-step` waterfall and asserts it is proposed, not
remembered.



## 0.8.0

**Checks are evaluated against the filesystem instead of compiled into shell commands.**

A guard used to be a shell command string, run through
`spawnSync(..., { shell: true })`, with a different spelling per platform. That made the
one question this module exists to answer — did the check run at all? — undecidable on
Windows: cmd.exe reports both "the program is missing" and "the check ran and failed" as
exit status 1, and its own diagnostic is a localized resource string. On a zh-CN host it
arrives as GBK bytes decoding to mojibake under `utf8`, so a classifier reading the text
answered differently depending on the system language. It also meant a guard could not
distinguish the two outcomes the plugin is built around, so a defective check could mark
a true memory as contradicted.

`Guard` is now a predicate over the filesystem — `exists`, `absent`, `contains`,
`lacks` — with a path and, where relevant, a search string. Evaluation is `fs`, so:

- Nothing from memory text is executed. A statement supplies operands, never a program,
  an argument list, or shell syntax; `$(whoami)` in a path is a filename, not a command.
- There is no quoting layer to get wrong, and no `%VAR%` expansion inside quotes.
- The result does not depend on the host language, because no output is parsed.
- `broken` (the check could not be carried out: a directory named as a file, a path the
  filesystem refuses to answer for) is now a fact about a return value rather than a
  guess about stderr, and it still never reaches the caller's exit code.

Guards recorded by earlier versions as `{ command }` are dropped on fold, so those
memories report as `uncheckable` — honest about not being runnable here — rather than
being read through a shape this version no longer understands. The log itself is not
rewritten.

`shellQuote` and `compileGuard`'s `platform` parameter are gone, and `classify` no longer
takes an output string. `describeGuard` renders a check for the CLI and the log.

## 0.7.1

**Client half now type-checks against the host's own client types.**

The panel used to declare a local mirror of the `slots` and `locale` services (plus `theme`
for the theme panel), so nothing checked the registration against the host. It now imports
`SlotRegistry`, `LocaleRuntime` and `ThemeRuntime` from the official client packages and
declares its locale namespace through `LocaleNamespaceMap` — which is what the host's
registration signature requires before it will accept `locale: NS`.

That check immediately found missing dictionary keys: strings the panel asked for that
neither dictionary defined (they rendered as the raw key). They are now translated in both.

## 0.7.0

**dsh 0.2.0-rc.2 alignment: host-provided packages move to pinned peer dependencies.**

Every `@deepseek-ai/*` package the host supplies — `dsh-llm`, `dsh-agent`, `dsh-session`,
`dsh-tools` and friends — is now declared in `peerDependencies`, pinned to `0.2.0-rc.2`, with
`@deepseek-ai/cordis` at `~4.0.4`. That is how the official plugins declare them. The previous
declarations were older ranges in the wrong section, which let a stale core copy be installed
into a dsh profile and stop the host from starting.

The recall message this plugin injects now declares its own `MessageSourceMap` kind
(`dsh-context-memory`, form `recall`). 0.2.0-rc.2 removed the shared catch-all `plugin` kind:
a producer declares its own kind by augmenting the map in its own module, as the official
`dsh-agent-loop` does for `runtime-context`.

## 0.5.1

**Fixed: the previous release only covered `ui.tsx`.**

The 0.5.0 fix replaced the invented tokens in `ui.tsx` but missed
`view.tsx`, which still read `--error`, `--warning`, `--success` and
`--accent` with hardcoded fallbacks. dsh defines none of those, so the
fallbacks applied in every theme.

Fixed here, 17 sites across the seven plugin panels:

- `var(--error, #e53935)` → `var(--dsw-alias-state-error-primary)`
- `var(--warning, #ed6c02)` → `var(--dsw-alias-state-warn-primary)`
- `var(--success, #2e7d32)` → `var(--dsw-alias-state-success-primary)`
- `var(--accent, #4B8BBE)` → `var(--dsw-alias-brand-primary)`

Also replaced literal colours in the same files (alert card tints, dimmed text,
code-block background) with the matching dsh tokens.

The guard test now scans **every `.ts`/`.tsx` under `src/client/`** instead of
only `ui.tsx` — that narrow scope is exactly how these 17 sites slipped through.
An added assertion fails if `view.tsx` stops being scanned.

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

## 0.1.2

- **Fix the client half never activating.** The browser half declared package names
  (`@deepseek-ai/dsh-client-ui-settings`) as cordis services, but services are named by
  their runtime identity — the settings shell is `slots`, the host bridge is
  `connection`. The fiber therefore never resolved and the plugin stayed pending, which
  the loader reported as "did not activate". It now injects `slots` and registers into
  the `settings.section` slot the way the official client artifacts do.

## 0.1.1

- **Fix the browser half never registering.** The client bundle was emitted as plain ESM
  with `react` external, which prints a top-level `import` — invalid inside the loader's
  concatenated script bundle, so evaluation aborted and every module after it failed with
  "...loaded without registering ... via __ModuleLoader__.load". The bundle is now emitted
  in the loader's lazy-CJS factory form (`window.__ModuleLoader__.load({ id, factory })`).
- Point the `./client` export's `types` at `lib/client/index.d.ts`.

## 0.1.0

Initial release.

- **Remember** — append-only `.memory/events.jsonl`; every memory carries provenance
  (session, step, author) so the question "why does the agent think it knows this" has
  an answer.
- **Recall** — relevance-ranked retrieval (token overlap, recency, verification
  strength) instead of dumping every stored memory into context.
- **Forget with a reason** — a memory is superseded, never silently deleted, and the
  supersede event keeps the reason on the record.
- **Conflict detection** — two active memories about the same subject are reported as a
  conflict; the plugin does not pick a winner for you.
- **Verification** — a checkable memory is compiled into a platform-aware guard and
  re-checked on demand. `dsh-context-memory verify` exits non-zero only for a memory
  whose guard ran and failed; a guard that cannot run is reported separately and is
  never counted as a broken memory.
- **Panel** — a `Context memory` settings page listing memory, verification status,
  conflicts, and provenance.
