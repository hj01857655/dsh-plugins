# Changelog

## 0.6.1

**Client half now type-checks against the host's own client types.**

The panel used to declare a local mirror of the `slots` and `locale` services (plus `theme`
for the theme panel), so nothing checked the registration against the host. It now imports
`SlotRegistry`, `LocaleRuntime` and `ThemeRuntime` from the official client packages and
declares its locale namespace through `LocaleNamespaceMap` — which is what the host's
registration signature requires before it will accept `locale: NS`.

That check immediately found missing dictionary keys: strings the panel asked for that
neither dictionary defined (they rendered as the raw key). They are now translated in both.
## 0.6.0

**Added: the plugin now observes tool calls itself.**

Before this release the package shipped a complete pipeline — store, aggregator,
alerts, CSV export, panel — and a `record()` service method, but **no subscription
of its own**: `git grep -c "ctx.on" HEAD -- .` returned 0 across the whole package,
and `git log -S "tools/result"` shows the subscription never existed in any version.
The only way data ever entered the store was the CLI's `record` subcommand, which a
person types by hand (`dsh-tool-stats record --tool bash --success --latency 42`) —
so the README's "Hook tool calls … for every tool invocation" described something the
plugin did not do. `apply(ctx)` now wires the two events that bracket a call:

- `tools/pre-execute` with `{ prepend: true }` — starts the clock as early as the
  chain allows, so the measured window covers the policy chain (including approval
  waits) rather than just the tool body.
- `tools/result` — settles the call and writes the record.

`tools/result` is the only terminal convergence point: the `dispatch`,
`post-result` and `final-result` preparation paths all funnel through
`finishScheduledExecution` → `notifyResult`, so denied calls, cancelled calls and
calls cancelled before they ever started still produce exactly one record. Failure
rates therefore do not silently under-count.

Latency is keyed on the `ToolExecution` object in a `WeakMap`. `notifyResult`
freezes that object before dispatching, and freezing preserves reference
identity, so the start point written pre-freeze is readable post-freeze. Entries
are collected with the execution itself, so a long session does not accumulate
timing state.

A result with no matching start point is recorded with `untimed: true` and
`latencyMs: 0` as a placeholder, and is **excluded from p50/p95** — `timedInvocations`
now reports how many calls actually contributed to the percentiles. This happens
when a call began before the plugin loaded, or was cancelled before
`pre-execute` fired. Inventing a latency for those would have made a tool look fast.

Also added: `contentBytes` per call, so a fast-but-empty result is distinguishable
from a fast-and-large one. UTF-8 length for `text`/`reasoning` blocks, the verified
`attachment.bytes` for images; unknown `ContentBlock` variants contribute nothing
rather than being guessed at.

**Fixed: the write path no longer stats the directory on every call.**

Records are appended synchronously because the `tools/result` observer runs inside
`notifyResult`'s synchronous dispatch loop — an async queue would trade a
sub-millisecond cost for lost records on process exit, which is the worse failure.
But the existing `ensureDir()` called `existsSync()` on every single write. Measured
on Windows (400 samples): **p50 0.572ms → 0.299ms**, a 48% cut, by caching that the
directory exists. If an external cleanup removes it, the next write's `ENOENT`
invalidates the flag and retries once — the cache cannot wedge the store.

Tests: 12 → 25. The new `tests/apply-e2e.test.mjs` loads the built plugin into a real
`cordis` Context and replays registry's exact dispatch pair (`ctx.waterfall` for
`tools/pre-execute`, `ctx.events.dispatch('emit', …)` for `tools/result`) — that is the
path no earlier test ever exercised, since `apply()` had no subscription at all and the
unit tests called `aggregate()` directly. It asserts calls land on disk, latency is
actually measured over the pre-execute → result window, denied/failed calls still count,
`untimed` samples stay out of the percentiles, and the session key comes from
`Agent.id`.

The per-instance isolation assertion was checked by mutation: replacing the `CallTimer`'s
`WeakMap` with a module-level shared one makes it fail. An assertion that cannot be
made red is not guarding anything, so this was verified rather than assumed.

## 0.5.1

**Fixed: the previous release only covered `ui.tsx`.**

The 0.5.0 fix replaced the invented tokens in `ui.tsx` but missed
`view.tsx`, which still read `--error`, `--warning`, `--success` and
`--accent` with hardcoded fallbacks. dsh defines none of those, so the
fallbacks applied in every theme.

Fixed here, 17 sites across the seven plugin panels:

- `var(--error, #e53935)` → `var(--dsw-alias-state-error-primary)`
- `var(--warning, #ed6c02)` → `var(--dsw-alias-state-warn-primary)`
- `var(--success, #2e7d32)` → `var(--dsw-alias-state-success-primary)`
- `var(--accent, #4B8BBE)` → `var(--dsw-alias-brand-primary)`

Also replaced literal colours in the same files (alert card tints, dimmed text,
code-block background) with the matching dsh tokens.

The guard test now scans **every `.ts`/`.tsx` under `src/client/`** instead of
only `ui.tsx` — that narrow scope is exactly how these 17 sites slipped through.
An added assertion fails if `view.tsx` stops being scanned.

## 0.5.0

**Fixed: panels did not follow the host theme.**

ui.tsx read invented custom properties — `--accent`, `--border`, `--bg-primary`,
`--text-primary` and friends. dsh defines none of them, so the hardcoded
fallbacks applied in every theme: each panel rendered its own fixed palette
instead of following the host.

The visible symptom was `surface: 'var(--bg-primary, #fff)'` on the modal,
input, select and textarea backgrounds — **white panels in dark mode**, with text
in the host's near-white label color.

Every name is now a real dsh token, pinned in `tests/ui-tokens.test.mjs`:

- accent → `--dsw-alias-brand-primary`
- surfaces → `--dsw-alias-bg-layer-1` / `-2`
- border → `--dsw-alias-border-l2`
- text / muted → `--dsw-alias-label-primary` / `--dsw-alias-label-tertiary`
- state colors → `--dsw-alias-state-*-primary` with `-tertiary` / `-secondary` tints
- modal scrim → `--dsw-alias-bg-mask-1`
- shadows → `--dsw-elevation-panel` / `--dsw-elevation-prominent`

`#fff` on the primary button became `--dsw-alias-label-primary-inverted`: dsh's
brand color is near-black in light mode and near-white in dark, so the literal
white would have disappeared against the fill.

Fallbacks are gone on purpose. If a token were ever missing, the declaration
becomes invalid at computed-value time and the property inherits, which degrades
gracefully — a hardcoded fallback instead bakes in a color that is wrong in one
of the two themes. The guard test fails on any fallback for exactly that reason.

## 0.2.0

Ecosystem sync: every plugin in this suite shares one version, so a version number
identifies a set that was tested together rather than one plugin's own history.

- Fix the Model Arena panel rendering "Cannot read properties of undefined": the host
  route returned the bare run list while the view reads `payload.recentRuns`.
- The client `inject` field now names services (`slots`, `connection`) instead of the
  packages that provide them.
- README badges cover version, downloads, CI, license, Node requirement, stars, and the
  dsh plugin topic.

## 0.1.4

- **Fix the client half never activating.** The browser half declared package names
  (`@deepseek-ai/dsh-client-ui-settings`) as cordis services, but services are named by
  their runtime identity — the settings shell is `slots`, the host bridge is
  `connection`. The fiber therefore never resolved and the plugin stayed pending, which
  the loader reported as "did not activate". It now injects `slots` and registers into
  the `settings.section` slot the way the official client artifacts do.

## 0.1.3

- **Fix the browser half never registering.** The client bundle was emitted as plain ESM
  with `react` external, which prints a top-level `import` — invalid inside the loader's
  concatenated script bundle, so evaluation aborted and every module after it failed with
  "...loaded without registering ... via __ModuleLoader__.load". The bundle is now emitted
  in the loader's lazy-CJS factory form (`window.__ModuleLoader__.load({ id, factory })`).
- Point the `./client` export's `types` at `lib/client/index.d.ts`, the file the client
  half actually compiles to.

## 0.1.0 (2026-09-18)

Initial release.