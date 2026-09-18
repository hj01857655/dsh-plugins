# dsh-cost-track

[![npm version](https://img.shields.io/npm/v/dsh-cost-track?color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/dsh-cost-track)
[![npm downloads](https://img.shields.io/npm/dm/dsh-cost-track?color=cb3837)](https://www.npmjs.com/package/dsh-cost-track)
[![CI](https://github.com/hj01857655/dsh-cost-track/actions/workflows/ci.yml/badge.svg)](https://github.com/hj01857655/dsh-cost-track/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/dsh-cost-track?color=blue)](LICENSE)
[![node](https://img.shields.io/node/v/dsh-cost-track?color=339933&logo=node.js&logoColor=white)](package.json)
[![GitHub stars](https://img.shields.io/github/stars/hj01857655/dsh-cost-track?color=yellow)](https://github.com/hj01857655/dsh-cost-track/stargazers)
[![dsh plugin](https://img.shields.io/badge/dsh-plugin-4B8BBE)](https://github.com/topics/dsh-plugin)

Track token spend and enforce budgets for every model call your dsh agent makes.

## Install

```sh
dsh plugin --profile web add dsh-cost-track
```

Or from source:

```sh
dsh plugin --profile web add github:hj01857655/dsh-cost-track
```

## What it does

- **Records every model call.** Prompt tokens, completion tokens, and the model id are
  priced and appended to `.cost/ledger.jsonl` (append-only).
- **Prices calls.** A built-in table covers DeepSeek's models. Override with your own
  rates for custom models.
- **Budgets.** Set a monthly spend limit. When cumulative spend crosses the threshold,
  the plugin warns. With `enforce: true`, subsequent model calls are blocked.
- **Panel.** A settings page shows today's spend, this month's spend, per-model
  breakdown, recent sessions, and the budget bar.

## CLI

```sh
dsh-cost-track summary                          # show spend summary
dsh-cost-track budget --monthly 50 --enforce    # set $50/month budget with enforcement
dsh-cost-track record --model deepseek-chat --prompt-tokens 1000 --completion-tokens 500 --session s1
```

## Pricing

Default rates (per million tokens, USD):

| Model | Prompt | Completion |
|---|---|---|
| deepseek-chat | $0.14 | $0.28 |
| deepseek-reasoner | $0.55 | $2.19 |

Override by writing `.cost/pricing.json`:

```json
{
  "my-model": { "promptPerMillion": 1.0, "completionPerMillion": 2.0 }
}
```

## License

MIT
