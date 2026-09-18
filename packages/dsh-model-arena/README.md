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

## What it does

- **Run a prompt through N models.** Same prompt, identical parameters, outputs collected side by side.
- **Compare.** Line-level diff between any two model outputs.
- **Score.** Auto-scorer (length, latency, reference match) + manual user ratings (1-5).
- **Benchmark suites.** Save a named set of prompts + models, re-run after changes, get a regression report.
- **Panel.** Settings page listing recent runs with drill-down to comparison view.

## CLI

```sh
dsh-model-arena list                              # list recent runs
dsh-model-arena compare <run> <modelA> <modelB>   # diff two models in a run
dsh-model-arena rate <run> --model M --rating 4   # rate a model output
```

## License

MIT
