# Changelog

## 0.1.0

**Initial release: the external cleanup that dsh's spill comment promises but does not provide.**

`subprocess/subprocess-local/src/output.ts:31-40` documents subprocess spill files as
retained "until an external cleanup". The only spill cleaner in the runtime is
`spill/spill-local/src/cleanup.ts`, and subprocess spill is invisible to it twice over:

- its root is `%TEMP%\dsh-subprocess-XXXXXX`, while `cleanup.ts:15`/`:389` accept only
  `^dsh-spill-[A-Za-z0-9]{6}$` — the prefix never qualifies as a sweep root;
- its files sit bare in that root, while `cleanup.ts:23`/`:306` descends only into
  `^session-[0-9a-f]{12}$` children — so even inside a legitimate root they would be skipped,
  and would keep that root from ever being pruned.

Files left by a crashed or SIGKILLed host therefore persist indefinitely. This package is the
missing cleanup, as a host-side plugin plus a CLI.

### Added

- `src/sweep.ts` — classification and deletion. Every entry gets a verdict
  (`expired` / `too-young` / `active-pid` / `unrecognized-name` / `not-regular-file` /
  `removal-failed`); only `expired` is ever removed.
- `src/index.ts` — `apply(ctx)` schedules a sweep 60 s after load and then daily, using
  `ctx.effect` (Cordis core) rather than `ctx.interval` (which belongs to
  `cordis-plugin-timer`, not a declared peer of this package).
- `src/cli.ts` + `dsh-spill-hygiene` bin — report by default, `--apply` to delete, `--json`
  for scripted use, non-zero exit when a round reported errors.

### Safety properties (each one is a response to a concrete hazard, not a general precaution)

- Root matching is `^dsh-subprocess-[A-Za-z0-9]{6}$` exactly. `sandbox-local/src/index.ts:426`
  creates **active** per-session sandbox working directories under a bare `dsh-` prefix;
  `runner-protocol.ts:104` (`dsh-subprocess-launch-`) and `shell-activity.ts:66`
  (`dsh-shell-`) have different lifetimes. A looser rule deletes live state.
- File matching enumerates the stream label instead of using `[a-z]+`, so an unrecognised name
  is never deleted. Confirmed against the installed runtime: only `output.ts:206`'s shape is
  produced.
- A live owner pid protects a file regardless of age. `process.kill(pid, 0)` counts anything
  other than `ESRCH` as alive (`EPERM` = exists, cannot be signalled).
- `lstat` everywhere; symlinks are never followed, at root level or inside a root.
- `unlink` + `rmdir` only — never `rm -rf`. `rmdir`'s "fails unless empty" is the whole
  pruning guarantee: a wrong regex costs one leftover file, not a tree.
- An empty root is pruned only when the directory's own mtime exceeds the retention window.
  Verified on Windows: creating *and* removing a child bumps directory mtime, `stat`/`readdir`
  do not — so "empty + old" really means "nothing has moved through here lately", and this
  tool's own scanning cannot keep a shell alive. `output.ts:34-37` names exactly this case as
  expected behaviour.
- Expiry is expressed as `ageDays > maxAgeDays`, so a `NaN` retention value deletes nothing
  instead of everything.
- A failed `unlink` is reported as `removal-failed` with its cause; it is not relabelled
  `active-pid`.

### Tests

47 tests (`node --test`): 27 sweeper unit tests, 6 end-to-end that load `lib/index.js` into a
real `cordis` Context and assert load-sweeps / default-does-not-delete / dispose-stops-later-
rounds, and 14 that pin `formatReport` against the report's own JSON (dry-run puts `expired`
entries in `retained`, apply puts them in `removed` — the summary line must not double-count or
under-report either way). Unit fixtures use shapes taken from this machine's actual `%TEMP%`,
including the legacy `dsh-subprocess-6388-1-3a0a25abb22c-stderr.log` and a probe-authored
`stdout-27000.log` that must *not* be deleted.

Four rules are **mutation-verified** — loosening the root regex to `^dsh-`, short-circuiting
the pid-alive check, removing the empty-root mtime gate, and inverting the formatter's
"overdue shell" branch each turn named tests red. The compiled output was byte-compared against
a fresh `tsc` run after restoring each mutation.

### Not verified

- Online load inside a real dsh profile (PLUGIN-CONTRACT.md §11). Both local profiles are
  currently plugin-free and loading one modifies the profile, so this is left to the user.

### Verified on CI (not on the authoring machine)

- The Linux half: `test (dsh-spill-hygiene, ubuntu-latest)` — **47 tests, 47 pass, 0 skipped**.
  `isPidAlive`'s POSIX `kill(pid, 0)` → `ESRCH` assumption and the directory-symlink assertion
  were both exercised on real Linux rather than skipped; neither failed and neither opted out.
  `windows-latest` is green too.
