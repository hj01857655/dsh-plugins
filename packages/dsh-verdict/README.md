# dsh-plugin-eval

Measure whether a change to your dsh setup actually helped.

Register repeatable cases, run them, and diff the results before and after you change
rules, skills, model settings, or plugins. A dsh setup change usually feels like an
improvement; this plugin is what tells you whether it was one.

## Status

Skeleton. The plugin loads and registers; the measurement logic is not implemented yet.
Design, milestones, and the one thing this does that the catalogue does not:
[`docs/DESIGN.md`](docs/DESIGN.md).

## Install

```sh
dsh plugin add dsh-plugin-eval
```

The plugin ships a `cordis.patch.yml`, so the profile registers it on install — there is
nothing to insert by hand.

## Layout

| Path | Role |
|---|---|
| `src/index.ts` | Host half — `apply(ctx)` |
| `cordis.patch.yml` | Profile registration (`insert` id `dsh-plugin-eval`) |
| `package.json` | Package manifest; host packages stay in `peerDependencies` |

## Payloads must be peers

dsh reserves certain packages for the host. Copying one into this plugin's own
`dependencies` produces a nested or aliased copy, which the profile validation rejects.
So `@deepseek-ai/cordis` and every `@deepseek-ai/dsh-*` package this plugin uses belong in
`peerDependencies` (plus `devDependencies` for local typechecking), never in
`dependencies`.

## No lifecycle scripts

Desktop rejects plugins whose dependencies carry install lifecycle scripts unless the
package is in the desktop project's reviewed `allowBuilds` policy. This plugin therefore
does no work at install time — everything happens in `apply`.

## Develop

```sh
pnpm install
pnpm run typecheck
pnpm run build
```
