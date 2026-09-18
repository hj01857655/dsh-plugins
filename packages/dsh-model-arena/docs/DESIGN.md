# Design — dsh-model-arena

## Positioning

Choosing a model is a guess. You read benchmarks, try one, see if it feels right, move on.
This plugin turns that guess into a comparison: same prompt, multiple models, outputs
side by side, scored.

One sentence: **run the same prompt through every model you have, and see the difference
without squinting.**

## What it does

- **Run a prompt through N models.** Take a prompt (string or file), a list of model ids,
  and call each model with identical parameters. Collect outputs, latencies, token counts.
- **Store the run.** Each arena run is `.arena/<run-id>.json` with the prompt, the: the
  per-model results, and optional scores.
- **Compare.** A diff view shows outputs side by side. For text outputs, a char-level
  diff highlights where models diverge.
- **Score.** The user can rate outputs (thumbs up/down, or a 1-5 score). Optionally,
  an auto-scorer computes simple metrics: length, latency, token cost, and a
  reference-match score if the user provides an expected answer.
- **Benchmark suite.** A named set of prompts can be saved as a suite. Re-running the
  suite after changing models or prompts produces a regression report: which models got
  better, which got worse.
- **Panel.** A settings page listing recent runs, with a drill-down to the comparison
  view.

## Architecture

| Half | Entry | Owns |
|---|---|---|
| host | `apply(ctx)` | model dispatch, run storage, scoring engine |
| client | `exports["./client"]` | settings page: run list, comparison view, scoring UI |

## Milestones

| # | Milestone |
|---|---|
| M0 | Skeleton + single-prompt multi-model run |
| M1 | Run storage + comparison diff view |
| M2 | Manual scoring + auto-scorer (length, latency, reference match) |
| M3 | Benchmark suites + regression report |
| M4 | Panel: run list, comparison, scoring |

## Non-goals

- Not a model proxy. It calls models through dsh's existing model API, does not
  intercept or reroute traffic.
- Not a training/finetuning tool. It compares existing models; it does not create them.
