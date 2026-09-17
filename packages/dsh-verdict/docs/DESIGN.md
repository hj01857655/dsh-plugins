# Design

## Positioning

Most learning/memory plugins stop at **record, recall, suggest, generate**. This one does
all of that **and then closes the loop**: a lesson that has been promoted into a rule is
compiled into a machine-checkable predicate, and the plugin re-runs it. A rule that stops
holding is reported by the harness — not left to someone's memory.

One sentence: **every rule this plugin learns can be machine-verified later, and it says
so when one stops being true.**

## Capability coverage

We do not ship less than the neighbours. Every capability below is in scope; the last row
is the highlight that nothing else in the catalogue does.

| Capability | Who has it today | Here |
|---|---|---|
| Cross-session memory: capture, durable store, recall | `deja-vu` (822★), `dsh-mnemon` (378★), `graph-memory` (626★) | yes |
| Background self-evolution over stored learnings | `dsh-memory-evolve` (314★) | yes |
| Turn successful sessions into reusable skills | `dsh-run2skill` (108★) | yes |
| Skill management / curation UI | `dsh-memory-evolve` | yes |
| Baseline + drift detection | `aegis` (1198★) — but for **code architecture** | yes — for **agent configuration** |
| Plugin inventory / audit | `dsh-harbor` (24★) | yes |
| **Compile a promoted rule into an executable check, and re-verify it automatically** | **nobody** | **the highlight** |

## The highlight, stated precisely

A rule is only checkable if it has three coupled things:

1. **a stable identity** — so a repeat is recognised as the same problem, not a new one;
2. **a written home** — the rule is actually placed in a project file, and its presence
   there is verifiable afterwards;
3. **an executable form** — a command that exits non-zero exactly when the rule is
   violated.

Capture-only plugins stop at (1) or earlier. That is why the last row of the table is
empty across the catalogue: closing it means owning all three, and the third one turns a
note into a test.

Concretely, the plugin:

- writes the rule into the project's agent file behind an invisible marker, so the claim
  "this rule lives here" is checkable rather than asserted;
- compiles the rule into a guard command, and refuses to accept a guard that cannot run
  (a broken guard is not a violated rule — conflating them makes the check untrustworthy);
- re-runs guards on a schedule and on relevant events, and surfaces a regression in the
  host;
- treats an ongoing violation as **one** regression, not one per run, so the recurrence
  counter that feeds promotion cannot be inflated.

## Architecture

| Half | Entry | Owns |
|---|---|---|
| host | `main` → `apply(ctx)` | ledger store, capture pipeline, rule promotion (file write + marker), guard compiler, checker, scheduler |
| client | `exports["./client"]` | sidebar panel: rules with verified / ineffective state; before-and-after view for a change |

Integration points inside dsh:

- **project agent file** (`AGENTS.md`) — the rule's home; written and re-read, never
  hand-edited by the plugin's users;
- **session records** — evidence for what actually happened, not what was remembered;
- **events / hooks** — triggers, so verification does not depend on anyone remembering.

## Milestones

| # | Milestone | State |
|---|---|---|
| M0 | Skeleton: manifest, `cordis.patch.yml`, `apply`, typecheck | done |
| M1 | Load path verified on a running dsh | not started |
| M2 | Capture + durable store + recall | done |
| M3 | Promote: write rule into `AGENTS.md` behind a marker | done |
| M4 | **Guard compiler + checker (the highlight)** | done |
| M5 | Client panel: rule status, before/after | not started |
| M6 | Skill generation from repeated sessions | not started |

M1 before everything: a plugin that cannot be loaded cannot be debugged. M2–M4 are
implemented and unit-tested against a real filesystem (`pnpm test`), but they are not
proven to load inside dsh until M1 is done.

## What is implemented

| Module | Responsibility |
|---|---|
| `src/identity.ts` | Rule id derived from normalised text (SHA-256, 12 hex chars) |
| `src/store.ts` | Durable `.verdict/ledger.json`; idempotent capture, atomic writes |
| `src/guard.ts` | Compile a rule to a platform shell command; run it; classify the result |
| `src/promote.ts` | Write the rule into `AGENTS.md` behind `<!-- verdict:<id> -->`; verify presence |
| `src/check.ts` | Verification pass; episode-based recurrence; non-zero exit only on real regressions |
| `src/pipeline.ts` | `learn`: capture → compile → promote |
| `src/index.ts` | Cordis host half; exposes the `verdict` service |

### Two decisions worth stating

**Guards are compiled for the platform in use.** Emitting POSIX everywhere would leave
every compiled rule permanently unrunnable on Windows — the checker would report on
nothing while looking like it worked. Where a shape has no faithful equivalent on the
current platform (recursive content search has no cmd.exe equivalent worth emitting), the
rule is left uncompiled rather than approximated: a rule with no runnable guard stays a
candidate and says so.

**Recurrence counts episodes, not runs.** A violation that stays open across many
checks is one recurrence. Counting runs would let a long-lived failure race past the
ineffectiveness threshold while a rule that fails often but briefly looks calm. The
counter feeds demotion, so inflating it would manufacture false verdicts.

## Non-goals

- **Not a code-architecture checker.** `aegis` checks whether your repository drifts from
  its baseline. This checks whether **your agent configuration** (rules, skills, model
  settings) still works — different input, different output.
- **Not a memory-only store.** Memory without verification is the state the catalogue is
  already saturated in.
