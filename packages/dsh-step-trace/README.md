# dsh-trace

Record every step the agent took, and walk through it forwards and backwards to find where it went wrong.

## Install

```sh
dsh plugin --profile web add dsh-trace
```

## What it does

- **Record.** Every model response and tool call is stored as a trace step in `.replay/<session-id>.jsonl`.
- **Step through.** Inspect the full input and output at each step, forward and backward.
- **Branch.** Fork a new session from any step — "what if the agent had done X instead?"
- **Divergence detection.** Given two sessions for the same task, find the first step where they diverge.
- **Panel.** Session list with step-through viewer.

## CLI

```sh
dsh-trace list              # list recorded sessions
dsh-trace trace <id>        # show all steps in a session
dsh-trace step <id> <n>     # inspect step N
dsh-trace diverge <a> <b>   # find where two sessions diverge
```

## License

MIT
