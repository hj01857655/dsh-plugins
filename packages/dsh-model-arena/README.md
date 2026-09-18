# dsh-model-arena

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
