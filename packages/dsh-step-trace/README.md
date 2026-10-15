# dsh-step-trace

[![npm version](https://img.shields.io/npm/v/dsh-step-trace?color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/dsh-step-trace)
[![npm downloads](https://img.shields.io/npm/dm/dsh-step-trace?color=cb3837)](https://www.npmjs.com/package/dsh-step-trace)
[![CI](https://github.com/hj01857655/dsh-step-trace/actions/workflows/ci.yml/badge.svg)](https://github.com/hj01857655/dsh-step-trace/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/dsh-step-trace?color=blue)](LICENSE)
[![node](https://img.shields.io/node/v/dsh-step-trace?color=339933&logo=node.js&logoColor=white)](package.json)
[![GitHub stars](https://img.shields.io/github/stars/hj01857655/dsh-step-trace?color=yellow)](https://github.com/hj01857655/dsh-step-trace/stargazers)
[![dsh plugin](https://img.shields.io/badge/dsh-plugin-4B8BBE)](https://github.com/topics/dsh-plugin)

Record every step the agent took, and walk through it forwards and backwards to find where it went wrong.

## Install

```sh
dsh plugin --profile web add dsh-step-trace
```

Or from source:

```sh
dsh plugin --profile web add github:hj01857655/dsh-step-trace
```

## What it does

- **Record.** Every model response and tool call is stored as a trace step in
  `.replay/<session-id>.jsonl` (append-only, one file per session).
- **Step through.** Inspect the full input and output at each step, forward and backward.
  Each step carries a timestamp and duration, so you can see where time was spent.
- **Branch.** Fork a new session from any step — "what if the agent had done X instead?"
- **Divergence detection.** Given two sessions for the same task, find the first step
  where they diverge — useful for understanding why a retry gave a different result.
- **Session stats.** Total steps, total duration, average step latency, and the slowest
  step per session.
- **Panel.** Session list with step-through viewer, timeline visualization, and
  divergence comparator.

## CLI

```sh
dsh-step-trace list              # list recorded sessions
dsh-step-trace trace <id>        # show all steps in a session
dsh-step-trace step <id> <n>     # inspect step N
dsh-step-trace diverge <a> <b>   # find where two sessions diverge
```

## Panel

A `Step trace` page inside Settings. The host registers `GET /api/step-trace.panel` and
rebuilds the payload from the replay files on every request. A headless host simply
skips the route.

The panel shows:

- Session list sorted by recency, with step count and total duration
- Step-through viewer with full input/output per step
- Timeline visualization showing step durations
- Divergence view comparing two sessions side by side

## Layout

| Path | Role |
|---|---|
| `src/index.ts` | Host half — `apply(ctx)`, exposes the `stepTrace` service |
| `src/replay.ts` | Core replay logic — record, list, step-through, diverge |
| `src/store.ts` | Append-only `.replay/<session>.jsonl` files |
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
