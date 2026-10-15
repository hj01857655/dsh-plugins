# dsh-model-arena

[![npm version](https://img.shields.io/npm/v/dsh-model-arena?color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/dsh-model-arena)
[![npm downloads](https://img.shields.io/npm/dm/dsh-model-arena?color=cb3837)](https://www.npmjs.com/package/dsh-model-arena)
[![CI](https://github.com/hj01857655/dsh-model-arena/actions/workflows/ci.yml/badge.svg)](https://github.com/hj01857655/dsh-model-arena/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/dsh-model-arena?color=blue)](LICENSE)
[![node](https://img.shields.io/node/v/dsh-model-arena?color=339933&logo=node.js&logoColor=white)](package.json)
[![GitHub stars](https://img.shields.io/github/stars/hj01857655/dsh-model-arena?color=yellow)](https://github.com/hj01857655/dsh-model-arena/stargazers)
[![dsh plugin](https://img.shields.io/badge/dsh-plugin-4B8BBE)](https://github.com/topics/dsh-plugin)

Run the same prompt through every model you have, and see the difference without squinting.

## Install

```sh
dsh plugin --profile web add dsh-model-arena
```

Or from source:

```sh
dsh plugin --profile web add github:hj01857655/dsh-model-arena
```

## What it does

- **Run a prompt through N models.** Same prompt, identical parameters, outputs collected
  side by side.
- **Compare.** Line-level diff between any two model outputs — additions, deletions, and
  unchanged lines, with a summary of how many lines changed.
- **Score.** Auto-scorer (length, latency, reference match) + manual user ratings (1–5).
  Scores are persisted per run, so you can rate a model later and the leaderboard updates.
- **Leaderboard.** Aggregate scores across runs into a ranked table — win rate, average
  score, and total runs per model.
- **Benchmark suites.** Save a named set of prompts + models, re-run after changes, get a
  regression report that tells you which models improved and which got worse.
- **Panel.** Settings page listing recent runs with drill-down to comparison view,
  leaderboard, and regression reports.

## CLI

```sh
dsh-model-arena list                              # list recent runs
dsh-model-arena compare <run> <modelA> <modelB>   # diff two models in a run
dsh-model-arena rate <run> --model M --rating 4   # rate a model output
```

## Panel

A `Model arena` page inside Settings. The host registers `GET /api/model-arena.panel`
and rebuilds the payload from the store on every request. A headless host simply skips
the route.

The panel shows:

- Recent runs with model outputs side by side
- Line-level diff viewer for any pair of models
- Auto-scores and user ratings per model output
- Leaderboard across all runs
- Regression reports for benchmark suites

## Layout

| Path | Role |
|---|---|
| `src/index.ts` | Host half — `apply(ctx)`, exposes the `modelArena` service |
| `src/arena.ts` | Core arena logic — run, compare, rate, leaderboard, regression |
| `src/scoring.ts` | Auto-scorer and leaderboard builder |
| `src/diff.ts` | Line-level diff algorithm |
| `src/store.ts` | Durable `.arena/` store |
| `src/arena-view.ts` | Payload → view model, shared by host route and browser half |
| `src/cli.ts` / `src/bin.ts` | Command-line entry, usable without dsh |
| `src/routes.ts` | Panel route on the host's web connection |
| `src/client/view.tsx` | Browser half — pure rendering |
| `src/client/index.tsx` | Browser half — fetch and settings registration |
| `src/client/locales.ts` | zh / en dictionaries |

## Develop

```sh
npm ci
npm run typecheck
npm run build
npm test
```

## License

MIT
