# Changelog

## 0.2.0

Ecosystem sync: every plugin in this suite shares one version, so a version number
identifies a set that was tested together rather than one plugin's own history.

- Fix the Model Arena panel rendering "Cannot read properties of undefined": the host
  route returned the bare run list while the view reads `payload.recentRuns`.
- The client `inject` field now names services (`slots`, `connection`) instead of the
  packages that provide them.
- README badges cover version, downloads, CI, license, Node requirement, stars, and the
  dsh plugin topic.

## 0.1.2

- **Fix the client half never activating.** The browser half declared package names
  (`@deepseek-ai/dsh-client-ui-settings`) as cordis services, but services are named by
  their runtime identity — the settings shell is `slots`, the host bridge is
  `connection`. The fiber therefore never resolved and the plugin stayed pending, which
  the loader reported as "did not activate". It now injects `slots` and registers into
  the `settings.section` slot the way the official client artifacts do.

## 0.1.1

- **Fix the browser half never registering.** The client bundle was emitted as plain ESM
  with `react` external, which prints a top-level `import` — invalid inside the loader's
  concatenated script bundle, so evaluation aborted and every module after it failed with
  "...loaded without registering ... via __ModuleLoader__.load". The bundle is now emitted
  in the loader's lazy-CJS factory form (`window.__ModuleLoader__.load({ id, factory })`).
- Point the `./client` export's `types` at `lib/client/index.d.ts`.

## 0.1.0

Initial release.

- **Remember** — append-only `.memory/events.jsonl`; every memory carries provenance
  (session, step, author) so the question "why does the agent think it knows this" has
  an answer.
- **Recall** — relevance-ranked retrieval (token overlap, recency, verification
  strength) instead of dumping every stored memory into context.
- **Forget with a reason** — a memory is superseded, never silently deleted, and the
  supersede event keeps the reason on the record.
- **Conflict detection** — two active memories about the same subject are reported as a
  conflict; the plugin does not pick a winner for you.
- **Verification** — a checkable memory is compiled into a platform-aware guard and
  re-checked on demand. `dsh-context-memory verify` exits non-zero only for a memory
  whose guard ran and failed; a guard that cannot run is reported separately and is
  never counted as a broken memory.
- **Panel** — a `Context memory` settings page listing memory, verification status,
  conflicts, and provenance.
