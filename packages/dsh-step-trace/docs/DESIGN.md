# Design — dsh-trace

## Positioning

When an agent session goes wrong — it hallucinated, called the wrong tool, looped — the
only evidence is the chat log, which shows what the agent said but not why. The full
execution trace (every tool call with its inputs and outputs, every model response with
its raw tokens) is lost.

This plugin records that trace and lets you step through it.

One sentence: **record every step the agent took, and walk through it forwards and
backwards to find where it went wrong.**

## What it does

- **Record.** Hook the events for model responses and tool calls. For each step, store:
  step number, type (model/tool), inputs, outputs, latency, timestamp. One file per
  session: `.replay/<session-id>.jsonl` (append-only).
- **Step through.** `replay play <session-id>` loads a trace and lets you step forward
  and backward. At each step, inspect the full input and output (not just the rendered
  chat message).
- **Branch.** `replay branch <session-id> <step>` forks a new session from a given step.
  The new session inherits the trace up to that point, then diverges. This lets you
  try "what if the agent had done X instead?" without re-running from scratch.
- **Divergence detection.** Given two sessions for the same task, find the first step
  where they diverge. This pinpoints where a regression started.
- **Panel.** A settings page listing recorded sessions, with a step-through viewer.

## Architecture

| Half | Entry | Owns |
|---|---|
| host | `apply(ctx)` | event listeners (model + tool), trace store, step engine |
| client | `exports["./client"]` | settings page: session list, step viewer, branch action |

## Milestones

| # | Milestone |
|---|---|
| M0 | Skeleton + event hooks + trace store |
| M1 | Step-through engine (forward/backward, inspect) |
| M2 | Branch: fork from a step |
| M3 | Divergence detection between two sessions |
| M4 | Panel: session list, step viewer, branch |

## Non-goals

- Not a time-travel debugger for the agent's internal state (weights, attention).
  It records the observable I/O boundary, not the internals.
- Not a session restore. Branching creates a new session with the trace context; it
  does not resume the original session's live state.
