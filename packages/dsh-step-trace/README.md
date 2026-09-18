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

## What it does

- **Record.** Every model response and tool call is stored as a trace step in `.replay/<session-id>.jsonl`.
- **Step through.** Inspect the full input and output at each step, forward and backward.
- **Branch.** Fork a new session from any step — "what if the agent had done X instead?"
- **Divergence detection.** Given two sessions for the same task, find the first step where they diverge.
- **Panel.** Session list with step-through viewer.

## CLI

```sh
dsh-step-trace list              # list recorded sessions
dsh-step-trace trace <id>        # show all steps in a session
dsh-step-trace step <id> <n>     # inspect step N
dsh-step-trace diverge <a> <b>   # find where two sessions diverge
```

## License

MIT
