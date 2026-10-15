# dsh-tool-stats

[![npm version](https://img.shields.io/npm/v/dsh-tool-stats?color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/dsh-tool-stats)
[![npm downloads](https://img.shields.io/npm/dm/dsh-tool-stats?color=cb3837)](https://www.npmjs.com/package/dsh-tool-stats)
[![CI](https://github.com/hj01857655/dsh-tool-stats/actions/workflows/ci.yml/badge.svg)](https://github.com/hj01857655/dsh-tool-stats/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/dsh-tool-stats?color=blue)](LICENSE)
[![node](https://img.shields.io/node/v/dsh-tool-stats?color=339933&logo=node.js&logoColor=white)](package.json)
[![GitHub stars](https://img.shields.io/github/stars/hj01857655/dsh-tool-stats?color=yellow)](https://github.com/hj01857655/dsh-tool-stats/stargazers)
[![dsh plugin](https://img.shields.io/badge/dsh-plugin-4B8BBE)](https://github.com/topics/dsh-plugin)

Every tool call is counted, and the ones that never fire are named so you can remove them.

## Install

```sh
dsh plugin --profile web add dsh-tool-stats
```

Or from source:

```sh
dsh plugin --profile web add github:hj01857655/dsh-tool-stats
```

## What it does

- **Hook tool calls.** Records tool name, success/failure, latency, and session for every
  tool invocation.
- **Dead-tool detection.** Tools configured but never invoked across N sessions are
  flagged — removing them saves context window tokens.
- **Failure analysis.** Tools with high failure rates are identified with their last error
  message and failure count, so you can fix or remove the broken ones.
- **Trend analysis.** Usage trends over time — which tools are gaining or losing adoption
  across sessions.
- **Recommendations.** Actionable suggestions like "Removing 12 unused tools would save
  ~1.8k tokens per context window."
- **Alerts.** Tools exceeding a failure rate threshold are flagged with severity levels.
- **Panel.** Usage table, dead/failing sections, trend charts, and recommendations.

## CLI

```sh
dsh-tool-stats summary    # show tool usage, dead tools, failures, recommendations
```

## Panel

A `Tool stats` page inside Settings. The host registers `GET /api/tool-stats.panel` and
rebuilds the payload from the store on every request. A headless host simply skips the
route.

The panel shows:

- Per-tool usage counts, success rates, and average latency
- Dead tools section with token savings estimate
- Failing tools with last error and failure rate
- Trend sparklines per tool
- Actionable recommendations

## Layout

| Path | Role |
|---|---|
| `src/index.ts` | Host half — `apply(ctx)`, exposes the `toolStats` service |
| `src/stats.ts` | Core stats tracker — record, query, aggregate |
| `src/analyzer.ts` | Dead-tool detection, failure analysis, trends, recommendations |
| `src/store.ts` | Durable `.toolstats/` store |
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
