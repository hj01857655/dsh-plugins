# Design — dsh-cost-track

## Positioning

Every model call costs money. dsh has no built-in spend visibility: you configure a model,
run sessions, and the bill arrives later. This plugin makes cost a first-class observable
during the session, not a surprise after it.

One sentence: **every token the agent spends is counted, priced, and shown — and the
agent can be stopped before it spends more than you allow.**

## What it does

- **Hook model calls.** Listen to the Cordis event that=that fires when the LLM
  completes a request. Extract prompt-tokens, completion-tokens, and the model id.
- **Price the call.** A pricing table maps model ids to per-million-token rates
  (prompt and completion priced separately, because they always differ). The table is
  user-configured; defaults cover DeepSeek's own models.
- **Accumulate.** Append each priced call to `.cost/ledger.jsonl` (append-only, same
  invariant as dsh-verdict's session log). Aggregate by session, by model, by day.
- **Budget enforcement.** A monthly budget is configurable. When cumulative spend
  crosses the threshold, the plugin emits a warning event. If `enforce: true` is set,
  it intercepts subsequent model calls and rejects them until the next billing period.
- **Panel.** A settings page showing: today's spend,+this month's spend, per-model
  breakdown, recent sessions with their cost, and the budget bar.

## Architecture

| Half | Entry | Owns |
|---|---|---|
| host | `apply(ctx)` | event listener on model calls, pricing engine, budget guard, ledger |
| client | `exports["./client"]` | settings page: spend summary, budget bar, per-session breakdown |

## Milestones

| # | Milestone |
|---|---|
| M0 | Skeleton + event hook + append-only ledger |
| M1 | Pricing engine + per-call accumulation |
| M2 | Budget threshold + warning event + enforcement |
| M3 | Panel: daily/monthly summary, per-model breakdown |
| M4 | CLI: `cost summary`, `cost budget set`, `cost sessions` |

## Non-goals

- Not a billing system. No payment processing, no invoices. Just observation and
  enforcement against a user-set limit.
- Not a model recommender. It shows what things cost; choosing cheaper models is the
  user's decision.
