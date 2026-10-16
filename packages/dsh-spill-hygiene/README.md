# dsh-spill-hygiene

Reclaims the orphaned subprocess spill files that dsh's own spill sweep never sees.

## Why this exists

`@deepseek-ai/dsh-subprocess-local` spills oversized command output into
`%TEMP%\dsh-subprocess-XXXXXX\` and documents the files as retained "until an external
cleanup" (`subprocess/subprocess-local/src/output.ts:31-40`).

The only spill cleaner in the whole runtime is `spill/spill-local/src/cleanup.ts`, and
subprocess spill is invisible to it on **two** levels:

| what cleanup.ts matches | what subprocess spill looks like |
|---|---|
| root `^dsh-spill-[A-Za-z0-9]{6}$` (`:15`, `:389`) | root `dsh-subprocess-XXXXXX` — different prefix, never a sweep root |
| child `^session-[0-9a-f]{12}$` (`:23`, `:306`) | bare files directly in the root — never descended into |

So the promised "external cleanup" does not structurally exist, and files left behind by
crashed or SIGKILLed hosts persist indefinitely. This package is that external cleanup.

## What it does

- **Periodic sweep.** Every 24 hours (60 s after load, so it never races dsh's own startup
  sweep) it scans the OS temp dir for the exact spill-root shape.
- **Reports by default, never deletes silently.** Nothing is removed unless you set
  `DSH_SPILL_HYGIENE_APPLY=1`. A plugin that deletes files should not acquire the ability
  to delete files at the moment it is loaded.
- **CLI for one-off runs.** `dsh-spill-hygiene` prints a report; `--apply` deletes.

## Safety rules — hard-coded, no switches

Every one of these exists because a looser rule would delete something alive.

1. **Roots must match `^dsh-subprocess-[A-Za-z0-9]{6}$` exactly.**
   `sandbox/sandbox-local/src/index.ts:426` creates **active, per-session** sandbox working
   directories with a bare `dsh-` prefix; `runner-protocol.ts:104` uses
   `dsh-subprocess-launch-` and `shell-activity.ts:66` uses `dsh-shell-`, both with different
   lifetimes. Prefix-sloppy matching would wipe live sandbox state.
2. **Files must match `^dsh-subprocess-<pid>-<n>-<12 hex>-(stdout|stderr)\.log$`.**
   The stream label is enumerated rather than `[a-z]+`: an unrecognised name means the file
   was not written by `output.ts:206`, and this tool does not delete what it cannot identify.
3. **A live owner pid protects the file at any age.** `process.kill(pid, 0)` treats anything
   other than `ESRCH` as alive — `EPERM` means "exists, no permission to signal it".
   Misjudging alive costs one leftover file; misjudging dead deletes the output of a running
   command.
4. **Symlinks are never followed** — at the root (`lstat`, must be a real directory) or
   inside one. A planted link must not turn a temp-dir sweep into a sweep of whatever it points at.
5. **Deletion is per-file `unlink` plus `rmdir`. Never `rm -rf`.** `rmdir` fails on a
   non-empty directory, so the cost of a wrong regex is one leftover file instead of a tree.
   A root containing any unrecognised entry is never pruned.
6. **Empty shells need their own evidence.** An empty root is pruned only if the *directory's
   own* mtime is older than the retention window. Verified on Windows (`%TEMP%\emptyrootmtime.mjs`):
   creating **and** removing a child file both bump the directory mtime, while `stat`/`readdir`
   do not — so "empty + old mtime" genuinely means "nothing has moved through here for ages",
   and the tool's own repeated scanning cannot keep a shell alive artificially. This is also
   the case `output.ts:34-37` explicitly names as expected: *"when an external temporary-file
   cleaner removes it while empty, the next spill open fails and the collector degrades to its
   in-memory tail."*
7. **A malformed config never means "delete everything".** Expiry is `ageDays > maxAgeDays`,
   so a `NaN` threshold matches nothing. `maxAgeDays=0` still spares files whose mtime is in
   the future (clock drift, NTP).
8. **Failures are contained.** An `unlink` that fails is reported as `removal-failed` with the
   reason, not relabelled as `active-pid`. A sweep that cannot read its root logs an error and
   leaves the plugin fiber alive.

## Install

```sh
dsh plugin add dsh-spill-hygiene
```

Host-only: there is no client UI, because a janitor has nothing to render. Run it manually
anytime with `dsh-spill-hygiene` (report) or `dsh-spill-hygiene --apply` (delete).

## Configuration

Environment variables, not `ctx.config` — this package does not assume the host opened a
config namespace for it.

| Variable | Default | Meaning |
|---|---|---|
| `DSH_SPILL_HYGIENE_APPLY` | unset (report only) | Set to `1` to actually delete |
| `DSH_SPILL_HYGIENE_MAX_AGE_DAYS` | `30` | Retention, aligned with dsh's own `cleanupPeriodDays` |
| `DSH_SPILL_HYGIENE_INTERVAL_MS` | `86400000` | Sweep period |
| `DSH_SPILL_HYGIENE_FIRST_DELAY_MS` | `60000` | Delay before the first sweep |
| `DSH_SPILL_HYGIENE_TMP_DIR` | OS temp dir | What to scan |

`ctx.effect` is used for scheduling rather than `ctx.interval`: the latter comes from
`cordis-plugin-timer`'s declaration merging, which this package does not declare as a peer
dependency. Cordis core mixes `effect` in (`cordis/lib/types/fiber.d.ts`), and the returned
disposer clears both timers when the plugin unloads.

## Measured on this machine

Dry-run against the real `%TEMP%` (2026-10-16), matching the audit's independent counts:

```
8 roots matched; 45 `dsh-*` neighbours seen and left alone; 0 errors
  dsh-subprocess-MqzTTi
    dsh-subprocess-6388-1-3a0a25abb22c-stderr.log  75854B  17.5d  pid=6388(dead)  ⇒ too-young
  dsh-subprocess-gwKKWN
    stdout-27000.log  31B  0.4d  pid=-  ⇒ unrecognized-name
```

That `stdout-27000.log` is a leftover from one of my own audit probes
(`%TEMP%\spilldacl.mjs:13`), not a dsh artefact — the installed runtime produces only the
`output.ts:206` shape. It is reported as unrecognised and left in place, which is rule 2
working on real data rather than in a test fixture.

## Verification status

- `npm run typecheck` exit 0; `npm run build` clean.
- `npm test`: **47/47** — 27 sweeper unit tests + 6 end-to-end against a real `cordis`
  Context + 14 report/JSON-consistency tests.
- Four safety rules carry **mutation-verified** assertions: loosening the root regex to
  `^dsh-`, short-circuiting the pid-alive check, dropping the empty-root mtime gate, and
  skewing the formatter's prune branch each turn named tests red. An assertion that cannot go
  red guards nothing; the compiled file was byte-compared against a fresh `tsc` run after each
  mutation was reverted.
- The `apply()`-to-disk path is covered end-to-end (`tests/apply-e2e.test.mjs`): real Cordis
  context, real timers, real files — asserting that load sweeps, that the default never
  deletes, and that `dispose` stops any later round.
- **Linux half: verified on CI, not on this machine.** Run 38852559200 (commit `3a07bae`)
  reports `test (dsh-spill-hygiene, ubuntu-latest)` green: **47 tests, 47 pass, 0 fail,
  0 skipped** — so neither the `isPidAlive` POSIX assumption nor the directory-symlink
  assertion self-skipped away. Both held on real Linux. `windows-latest` is likewise green
  (33 s). Windows semantics were additionally probed here directly (`%TEMP%\pidcheck.mjs`:
  `kill(2147483646, 0)` raises `ESRCH`, `isPidAlive` returns false for it and true for self).
- **Not verified:** online load inside a real dsh profile. Both local profiles are currently
  plugin-free; loading requires `dsh plugin add`, which changes the profiles.

## Layout

| Path | Role |
|---|---|
| `src/types.ts` | Verdict / entry / report shapes |
| `src/sweep.ts` | Classification and deletion — all safety rules live here |
| `src/index.ts` | `apply(ctx)`: config, scheduling, logging |
| `src/cli.ts` | `--apply` / `--json` / `--max-age-days` / `--tmp-dir` |
| `src/bin.ts` | `dsh-spill-hygiene` entry point (`process.exitCode = run(argv)`) |
| `tests/sweep.test.mjs` | Safety rules, incl. real on-disk shapes as fixtures |
| `tests/apply-e2e.test.mjs` | Load → sweep → delete → dispose, against real cordis |

## Tests

| File | Count | Covers |
|---|---|---|
| `tests/sweep.test.mjs` | 27 | Every safety rule, with shapes taken from this machine's real `%TEMP%` as fixtures |
| `tests/apply-e2e.test.mjs` | 6 | `apply()` → real timers → real deletion → `dispose`, against a real `cordis` Context |
| `tests/report.test.mjs` | 14 | `formatReport` text and JSON never disagree with what was actually deleted |

## Relationship to the audited runtime

This package reads dsh's documented temp-file behaviour; it does not touch any internal
field. The tempting alternative — pointing `LocalSubprocessRuntime.internals.spillDir` at a
`dsh-spill-*` root so the official 30-day sweep covers subprocess spill — was rejected: that
field's own comment calls it a "Test hook", it has no stability promise, and it changes where
files land rather than supplying the missing cleanup. Silent behaviour change the next time
the runtime touches a test seam is a worse trade than running a sweeper.

## License

MIT
