# Changelog

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
