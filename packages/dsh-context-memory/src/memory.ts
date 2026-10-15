/**
 * The memory service.
 *
 * Current state is always a fold over the event log, recomputed rather than cached.
 * That is the point of the plugin: two processes reading the same log must agree on
 * what is remembered, and a cache would let one process's view of history outlive the
 * events that contradict it.
 *
 * @module context-memory/memory
 */

import { compileGuard, runGuard } from './guard.js'
import { memoryId, normaliseSubject } from './identity.js'
import { recall as rankRecall } from './recall.js'
import { MemoryStore } from './store.js'
import type {
  Conflict,
  Memory,
  MemoryEvent,
  MemoryKind,
  MemorySource,
  MemoryState,
  PanelPayload,
  RecallHit,
  VerifyResult,
  VerifySummary,
} from './types.js'

export interface RememberInput {
  text: string
  /**
   * What the memory is about. Defaults to the statement itself, so repeats fold; supply
   * it to make two different statements about one thing reportable as a conflict.
   */
  subject?: string
  kind?: MemoryKind
  source?: MemorySource
  sessionId?: string
  step?: number
}

export class ContextMemory {
  private readonly store: MemoryStore

  constructor(private readonly projectDir: string) {
    this.store = new MemoryStore(projectDir)
  }

  get logPath(): string {
    return this.store.path
  }

  /**
   * Fold the log into current state.
   *
   * Events are applied in log order and a memory is always addressable by id, so a
   * supersede or verify that names a memory not yet seen is skipped rather than
   * creating a phantom entry — a log that lost its `remember` line must not resurrect
   * the memory from its consequences.
   */
  all(): MemoryState[] {
    const byId = new Map<string, MemoryState>()
    for (const event of this.store.readAll()) {
      if (event.type === 'remember') {
        byId.set(event.memory.id, { ...event.memory, status: 'active' })
        continue
      }
      const target = byId.get(event.id)
      if (!target) continue
      if (event.type === 'supersede') {
        target.status = 'superseded'
        target.supersededReason = event.reason
        if (event.replacedBy !== undefined) target.supersededBy = event.replacedBy
        continue
      }
      target.verification = { at: event.at, outcome: event.outcome, exitCode: event.exitCode, output: event.output }
    }
    return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt)
  }

  active(): MemoryState[] {
    return this.all().filter((memory) => memory.status === 'active')
  }

  get(id: string): MemoryState | undefined {
    return this.all().find((memory) => memory.id === id)
  }

  /**
   * Record a memory.
   *
   * The id is derived from the subject and the text, so remembering the same statement
   * again refreshes its guard rather than creating a second copy — but it does not
   * silently supersede it either. Re-remembering is not evidence that the old statement
   * became wrong; only an explicit supersede says that. Two *different* statements about
   * the same subject stay separate, and `conflicts` reports them together.
   *
   * A guard is compiled only from the statement's own text. Whatever the caller passes
   * is never executed: memories can be written by the agent, so a memory-supplied
   * command would be an injection path.
   */
  remember(input: RememberInput, now = Date.now()): Memory {
    const text = input.text.trim()
    if (text.length === 0) throw new Error('cannot remember an empty statement')

    const subject = input.subject !== undefined && input.subject.trim().length > 0
      ? normaliseSubject(input.subject)
      : normaliseSubject(text)
    const id = memoryId(subject, text)
    const guard = compileGuard(text)
    const memory: Memory = { id, subject, text, kind: input.kind ?? 'fact', source: input.source ?? 'user', createdAt: now }
    if (input.sessionId !== undefined) memory.sessionId = input.sessionId
    if (input.step !== undefined) memory.step = input.step
    if (guard) memory.guard = guard

    const existing = this.get(id)
    // Keep the original creation time: re-stating a memory is not the memory being new,
    // and resetting it would let any repeat silently outrank older, better-evidenced ones.
    if (existing) memory.createdAt = existing.createdAt

    this.store.append({ type: 'remember', at: now, memory })
    return memory
  }

  /**
   * Retire a memory, with a reason.
   *
   * Deletion is not offered. A memory that turns out to be wrong is the most valuable
   * record in the log — it is the only thing that can explain a past decision — so it is
   * marked superseded and kept, and the reason is required because "why did this stop
   * being true" is the question that will be asked later.
   */
  forget(id: string, reason: string, replacedBy?: string, now = Date.now()): boolean {
    if (!this.get(id)) return false
    if (reason.trim().length === 0) throw new Error('a memory can only be superseded with a reason')
    const event: MemoryEvent = { type: 'supersede', at: now, id, reason: reason.trim() }
    if (replacedBy !== undefined) event.replacedBy = replacedBy
    this.store.append(event)
    return true
  }

  /**
   * Group active memories that share a subject but say different things.
   *
   * The plugin deliberately does not pick a winner. Two memories with the same subject
   * and different text means one of them is wrong and the log does not say which; a
   * plausible-looking choice would be exactly the unfounded assertion this plugin exists
   * to eliminate.
   */
  conflicts(): Conflict[] {
    const groups = new Map<string, MemoryState[]>()
    for (const memory of this.active()) {
      const group = groups.get(memory.subject)
      if (group) group.push(memory)
      else groups.set(memory.subject, [memory])
    }
    const conflicts: Conflict[] = []
    for (const [subject, memories] of groups) {
      if (memories.length > 1) conflicts.push({ subject, memories })
    }
    return conflicts.sort((a, b) => b.memories.length - a.memories.length)
  }

  /** Rank active memories against a query. */
  recall(query: string, limit = 5, now = Date.now()): RecallHit[] {
    return rankRecall(this.all(), query, limit, now)
  }

  /**
   * Re-run every compiled guard.
   *
   * Keys accumulate because they are not interchangeable: `violated` is the world
   * disagreeing with a memory, `broken` is the check itself being unusable, and
   * `uncheckable` is there being no check. Only the first is evidence about the memory,
   * so only the first may influence a caller's exit code.
   */
  verify(now = Date.now()): VerifySummary {
    const summary: VerifySummary = { passed: 0, violated: 0, broken: 0, uncheckable: 0, results: [] }
    for (const memory of this.active()) {
      if (!memory.guard) {
        summary.uncheckable += 1
        summary.results.push({ id: memory.id, text: memory.text, outcome: 'uncheckable', exitCode: null, output: '' })
        continue
      }
      const run = runGuard(memory.id, memory.guard, this.projectDir, new Date(now))
      this.store.append({ type: 'verify', at: now, id: memory.id, outcome: run.outcome, exitCode: run.exitCode, output: run.output })

      const result: VerifyResult = { id: memory.id, text: memory.text, outcome: run.outcome, exitCode: run.exitCode, output: run.output }
      summary.results.push(result)
      if (run.outcome === 'passed') summary.passed += 1
      else if (run.outcome === 'violated') summary.violated += 1
      else summary.broken += 1
    }
    return summary
  }

  /**
   * The exit code a caller should use.
   *
   * Only a rule the world actually contradicted makes this non-zero. A guard that could
   * not run is a defect in the check, not in the memory, and letting it turn a pipeline
   * red is how a typo would get a true memory marked false.
   */
  static exitCode(summary: VerifySummary): number {
    return summary.violated > 0 ? 1 : 0
  }

  panel(): PanelPayload {
    const all = this.all()
    const active = all.filter((memory) => memory.status === 'active')
    const superseded = all.filter((memory) => memory.status === 'superseded')
    return {
      active,
      superseded,
      conflicts: this.conflicts(),
      totals: {
        active: active.length,
        superseded: superseded.length,
        withGuard: active.filter((memory) => memory.guard).length,
        verified: active.filter((memory) => memory.verification?.outcome === 'passed').length,
        unverified: active.filter((memory) => memory.verification?.outcome !== 'passed').length,
      },
    }
  }
}
