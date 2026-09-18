# dsh-verdict

[![CI](https://github.com/hj01857655/dsh-verdict/actions/workflows/ci.yml/badge.svg)](https://github.com/hj01857655/dsh-verdict/actions/workflows/ci.yml)

Measure whether a change to your dsh setup actually helped.

Register repeatable cases, run them, and diff the results before and after you change
rules, skills, model settings, or plugins. A dsh setup change usually feels like an
improvement; this plugin is what tells you whether it was one.

## Status

Published to npm as `dsh-verdict@0.1.0`.

Implemented: capture, durable store, rule promotion into `AGENTS.md`, guard compilation,
automatic re-verification (also scheduled every six hours in a resident host), skill
distillation, and the settings page. Covered by 87 unit tests against a real filesystem
(`npm test`), including static renders of the panel. CI runs on Ubuntu and Windows.

Verified on real hardware: the plugin loads inside dsh `0.1.5-rc.2`, the host route
`GET /api/verdict.panel` serves the panel payload, and the browser half registers a
"Verdict" page in Settings without errors.

Design, milestones, and the one thing this does that the catalogue does not:
[`docs/DESIGN.md`](docs/DESIGN.md).

## What it does

```js
ctx.verdict.learn('never commit the file secrets.env')
// -> rule captured, guard compiled for this platform, written into AGENTS.md
//    behind <!-- verdict:<id> -->, and now re-checked on demand

ctx.verdict.check()
// -> { passed, violated, broken, exitCode }
//    exitCode is 1 only for real violations — a guard that cannot run is
//    reported separately and never turns a pipeline red
```

A rule is only promoted if it has an executable check. A rule whose check stops holding
is reported; a rule that keeps failing is demoted to `ineffective` after three **distinct**
violation episodes — not three runs, so a long-lived failure cannot inflate the count.

The compiler knows a few sentence shapes — file existence, forbidden files, forbidden
root globs ("no *.pem files"), and required file contents ("the file README.md must
mention install") — and refuses any sentence it cannot express faithfully on the current
platform, leaving it a candidate rather than emitting an approximate command.

## Install

From npm (recommended — the tarball ships pre-built `lib/`):

```sh
dsh plugin add dsh-verdict --profile web
```

Or pin the exact version:

```sh
dsh plugin add dsh-verdict@0.1.0 --profile web
```

For local development without publishing:

```sh
dsh plugin add link:/path/to/dsh-verdict --profile web
```

The plugin ships a `cordis.patch.yml`, so the profile registers it on install — there is
nothing to insert by hand. GitHub source installs will not work directly because `lib/`
is gitignored and dsh forbids install-time build scripts; use npm or `link:` instead.

## CLI

The same modules are reachable without booting dsh, so the plugin's claims can be
checked independently and `check` can run in CI:

```sh
verdict learn "never commit the file .env"    # capture + compile a guard + promote
verdict check                                 # exit 1 on real violations, 0 otherwise
verdict list
verdict recall "env"
verdict session --intent "verify a change" --step "run tests" --step "commit"
verdict skills --write
verdict panel                     # the panel's view of the project
verdict diff before ; verdict diff after ; verdict diff
                                  # did that change help? answered from two snapshots
verdict doctor                    # check this package against dsh's plugin rules
verdict inventory --audit         # installed plugins, and what would stop them loading
```

`verdict check` is the CI-relevant one: it exits non-zero for a genuine violation and
stays zero when the only problem is a guard that cannot run, so a typo in a guard can
never turn a pipeline red on its own.

`verdict doctor` covers everything about loading that is static — manifest, build output,
patch id agreement, peer placement, lifecycle scripts — so the one thing left for a real
dsh install is the loader itself.

## Web panel

The plugin also ships a browser half (`exports["./client"]`). It registers a
`settings.section` slot — a "Verdict" page inside Settings — and reads the panel
from `GET /api/verdict.panel`, which the host half registers on the web
connection when one exists. Hosts without a web client simply skip it.

The page draws only what the data supports: a rule shows "guard passed" because
a guard ran and passed, never because it was promoted, and a before/after
comparison without both snapshots states that instead of an improvement. Skill
candidates distilled from repeated successes are listed with a write action
(`POST /api/verdict.skills.write`); the response carries whether the written
skill's guard actually runs.

`scripts/bundle-client.mjs` replicates the loader's lazy-CJS factory artifact
(banner, intro vars, footer, `react` left external to the platform module
table). The bundle is `lib/verdict.web.js` — deliberately not `lib/client.js`,
which is the compiled host module `src/client.ts`.

## Layout

| Path | Role |
|---|---|
| `src/index.ts` | Host half — `apply(ctx)`, exposes the `verdict` service |
| `src/identity.ts` | Rule id derived from text, so repeats collapse into one rule |
| `src/store.ts` | Durable `.verdict/ledger.json`; atomic writes |
| `src/guard.ts` | Rule → shell command; run it; classify pass / violated / broken |
| `src/promote.ts` | Write rule into `AGENTS.md` behind a marker; verify its presence |
| `src/check.ts` | Verification pass, episode-based recurrence, exit code |
| `src/pipeline.ts` | `learn`: capture → compile → promote |
| `src/session.ts` | Append-only session log; what actually happened |
| `src/skills.ts` | Distil repeated successes into a skill (M6) |
| `src/cli.ts` / `src/bin.ts` | Command-line entry, usable without dsh |
| `src/routes.ts` | `GET /api/verdict.panel` and `POST /api/verdict.skills.write` on the host's web connection |
| `src/verdict-view.ts` | Payload → view model, shared by host route and browser half |
| `src/schedule.ts` | The six-hour re-check report line for resident hosts |
| `src/client/index.tsx` | Browser half — panel state, fetch, registration |
| `src/client/view.tsx` | Browser half — pure rendering, statically tested in Node |
| `scripts/bundle-client.mjs` | esbuild bundle in the loader's factory format |
| `cordis.patch.yml` | Profile registration (`insert` id `dsh-verdict`) |
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
npm ci
npm run typecheck
npm run build
npm test
node tests/smoke.mjs   # end-to-end walkthrough against temp dirs
```
