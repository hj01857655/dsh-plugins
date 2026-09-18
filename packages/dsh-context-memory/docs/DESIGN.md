# Design — dsh-context-memory

## Positioning

Every agent session starts from zero. Decisions, constraints, and hard-won pitfalls are
re-explained every time, and the notes file you write to compensate has no way to tell
you when one of its lines stopped being true.

This plugin gives the agent a memory, and treats each memory as a claim that can be
checked rather than a fact that has been filed.

One sentence: **remember what the agent learned, and re-check the parts of it that can
be checked instead of trusting that they stayed true.**

## What it does

- **Record with provenance.** Every memory is a `remember` event carrying text, kind,
  source (user / agent / plugin), session id, step, and — when the statement has a
  checkable shape — a compiled guard.
- **Fold, never mutate.** Current state is a fold over an append-only log. Nothing
  overwrites a record, so history answers "what did the agent believe, and why".
- **Recall by relevance.** Ranked by token overlap, recency, and verification strength,
  with the score breakdown returned on every hit.
- **Supersede with a reason.** There is no delete. A retired memory keeps why it was
  retired, because the wrong memories are what explain past decisions.
- **Detect conflicts.** Active memories sharing a subject are reported together; the
  plugin does not choose between them.
- **Verify.** Compiled guards are re-run; a memory that fails is reported, and a check
  that cannot run is reported separately.
- **Panel.** Settings page: active, superseded, conflicts, per-memory verification, and
  provenance.

## Architecture

| Half | Entry | Owns |
|---|---|---|
| host | `apply(ctx)` | fold, guard compilation, verification, panel and verify routes, CLI |
| client | `exports["./client"]` | settings page: memory list, conflicts, verification status |

## Milestones

| # | Milestone |
|---|---|
| M0 | Skeleton + append-only log + fold |
| M1 | Remember with provenance; id folded from the subject |
| M2 | Recall ranking with an explainable score |
| M3 | Supersede with a reason; conflict detection |
| M4 | Guard compilation + verification + exit code |
| M5 | Panel and CLI |

## Invariants

These are the properties the tests exist to protect.

1. **A check that cannot run is never reported as a memory that is wrong.**
   `classify` maps a missing binary (POSIX 127, cmd.exe 9009) and shell "not found"
   output to `broken`, which is counted and displayed separately from `violated` and
   does not fail `verify`.

2. **Nothing is recorded as verified because it was stored.** `verification` is only
   ever written by a `verify` event, which is only written after a guard actually ran.

3. **No memory text is ever executed.** Guards come from a fixed set of templates that
   interpolate quoted file paths and literal search strings. This matters because the
   agent can write memories; a memory-supplied command would be an injection path.

4. **A statement with no faithful check on this platform stays uncheckable.** No
   approximate command is emitted, because a check that exits 0 while verifying nothing
   makes every later "verified" a lie.

5. **A superseded memory is not a weaker answer.** Recall excludes it entirely; ranking
   it low would put a known-wrong memory back in front of the agent.

6. **Conflicts are reported, not resolved.** The log does not say which of two
   disagreeing memories is right, so the plugin does not guess.

7. **Re-remembering is not superseding.** Remembering an existing subject refreshes its
   guard and keeps its original creation time; it does not silently retire the previous
   statement, because a repeat is not evidence that the old one became false.

## Non-goals

- Not a vector database. Ranking is lexical and predictable, which is what makes the
  score explainable; an embedding index would trade that for recall this plugin does not
  need at personal-memory scale.
- Not cloud sync. The memory is a file in the project, reviewable and diffable like any
  other.
- Not automatic extraction from conversations. A memory is written deliberately; silently
  promoting model output into the agent's long-term beliefs would create exactly the
  unfounded assertions this plugin is built to catch.
