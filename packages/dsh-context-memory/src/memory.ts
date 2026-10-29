/**
 * The memory service.
 *
 * Current state is always a fold over the event log, recomputed rather than cached.
 * That is the point of the plugin: two processes reading the same log must agree on
 * what is remembered, and a cache would let one process's view of history outlive the
 * events that contradict it.
 *
 * There are two logs, one per scope. They are folded together rather than merged on
 * disk: a project convention and a working preference are different statements kept in
 * different places for different reasons, and collapsing them would make "this checkout"
 * and "everywhere" the same claim. Which log an event is appended to follows the
 * memory's own scope, never the caller's convenience.
 *
 * @module context-memory/memory
 */

import { join } from 'node:path'

import { CandidateQueue, type ProposeInput } from './candidates.js'
import { compileGuard, GUARD_KINDS, runGuard } from './guard.js'
import { memoryId, normaliseSubject } from './identity.js'
import { recall as rankRecall, inTarget, isContradicted } from './recall.js'
import { MemoryStore } from './store.js'
import type {
  Candidate,
  CandidateState,
  Conflict,
  Memory,
  MemoryEvent,
  MemoryKind,
  MemoryScope,
  MemorySource,
  MemoryState,
  MemoryTarget,
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
  /** Which log to write. Defaults to `project` — the narrow claim is the safe default. */
  scope?: MemoryScope
  sessionId?: string
  step?: number
}

/** Construction options. */
export interface ContextMemoryOptions {
  /**
   * Directory of the user-global log.
   *
   * Omitted means the instance is project-only: `all()` folds one log, and asking to
   * remember something user-global throws rather than quietly writing it to the project.
   * Tests rely on that — an omitted directory must never reach the real home.
   */
  userDir?: string
}

/**
 * Accept only a guard this version can evaluate.
 *
 * Logs written before 0.8.0 recorded guards as `{ command: '<shell string>' }`. Those
 * are dropped rather than read: the field no longer means what it did, and a memory
 * evaluated through a stale shape would be answered by whichever predicate branch
 * happened to match its `undefined` kind. Dropping it makes the memory `uncheckable`,
 * which is true — this version cannot carry out that check — and leaves the record
 * intact for a reader that can.
 */
function usableGuard(guard: Memory['guard']): Memory['guard'] {
  if (guard === undefined) return undefined
  const kind = (guard as { kind?: unknown }).kind
  // A whitelist, not a denylist: a guard written by a newer version must be dropped here
  // rather than reach `runGuard`, whose branches would answer it with whichever predicate
  // their fallthrough happens to be. The list lives in `guard.ts`, next to the union it
  // mirrors, so adding a kind is one edit and forgetting it is a compile error.
  if (typeof kind === 'string' && (GUARD_KINDS as readonly string[]).includes(kind)) return guard
  return undefined
}

/** The identity a memory is addressed by inside this process. */
function keyOf(scope: MemoryScope, id: string): string {
  return `${scope}\u0000${id}`
}

export class ContextMemory {
  private readonly projectStore: MemoryStore
  private readonly userStore: MemoryStore | undefined
  private readonly queue: CandidateQueue

  /**
   * The last fold, keyed by the identity of both log files.
   *
   * The pre-step asks the same question several times in one pass — who is relevant,
   * who is contradicted, who disagrees — and each answer used to re-fold both logs. The
   * fold is still recomputed whenever either file changes, so two processes reading one
   * log still agree: everything below re-derives from the files, this only avoids
   * deriving the same state from the same bytes more than once.
   */
  private folded: { key: string; value: MemoryState[] } | undefined

  constructor(
    private readonly projectDir: string,
    options: ContextMemoryOptions = {},
  ) {
    this.projectStore = new MemoryStore(join(projectDir, '.memory'))
    this.userStore = options.userDir === undefined ? undefined : new MemoryStore(options.userDir)
    // The queue is per project, beside the project log: a statement noticed while working
    // in one checkout is a question about that checkout, and offering it in another
    // project would be offering it out of context.
    this.queue = new CandidateQueue(join(projectDir, '.memory'))
  }

  /** Where each scope is written, for the panel and the CLI. */
  get locations(): { project: string; user: string | undefined } {
    return { project: this.projectStore.path, user: this.userStore?.path }
  }

  /** The project log's path. Kept for callers that only know about the project scope. */
  get logPath(): string {
    return this.projectStore.path
  }

  private storeFor(scope: MemoryScope): MemoryStore {
    if (scope === 'project') return this.projectStore
    if (this.userStore === undefined) {
      throw new Error('this instance has no user-global log; construct it with a userDir')
    }
    return this.userStore
  }

  /**
   * Fold the logs into current state.
   *
   * Events are applied in log order and a memory is always addressable by id, so a
   * supersede or verify that names a memory not yet seen is skipped rather than
   * creating a phantom entry — a log that lost its `remember` line must not resurrect
   * the memory from its consequences.
   *
   * A memory's scope is part of its identity here: the same sentence can legitimately
   * exist in both logs, and they are two claims about two different domains, so both
   * are kept rather than one shadowing the other.
   */
  all(): MemoryState[] {
    // Both files' identities, so an append by another process invalidates this exactly
    // as an append by this one does.
    const key = this.scopes()
      .map((scope) => `${scope}=${this.storeFor(scope).signature() ?? '-'}`)
      .join('|')
    if (this.folded !== undefined && this.folded.key === key) return this.folded.value

    const byId = new Map<string, MemoryState>()
    for (const scope of this.scopes()) {
      const store = this.storeFor(scope)
      for (const event of store.readAll()) {
        if (event.type === 'remember') {
          const recorded = event.memory
          const guard = usableGuard(recorded.guard)
          // Rebuild rather than spread-and-overwrite: with exactOptionalPropertyTypes a
          // spread carrying `guard: undefined` is not the same type as omitting it, and
          // the log's own field must not survive as an unevaluable shape. The recorded
          // `subject` is kept as written rather than re-derived from the text: it may
          // have been supplied explicitly, and recomputing it here would quietly discard
          // that choice.
          const { guard: _dropped, scope: _recordedScope, ...rest } = recorded
          byId.set(keyOf(scope, recorded.id), {
            ...rest,
            // A log's own scope field cannot override the log's location: events are
            // appended to the store that owns them, so the location is authoritative.
            scope,
            ...(guard ? { guard } : {}),
            status: 'active',
          })
          continue
        }
        const target = byId.get(keyOf(scope, event.id))
        if (!target) continue
        if (event.type === 'supersede') {
          target.status = 'superseded'
          target.supersededReason = event.reason
          if (event.replacedBy !== undefined) target.supersededBy = event.replacedBy
          continue
        }
        target.verification = { at: event.at, outcome: event.outcome, exitCode: event.exitCode, output: event.output }
      }
    }
    const value = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt)
    this.folded = { key, value }
    return value
  }

  private scopes(): MemoryScope[] {
    return this.userStore === undefined ? ['project'] : ['project', 'user']
  }

  active(): MemoryState[] {
    return this.all().filter((memory) => memory.status === 'active')
  }

  /**
   * Active memories no check has contradicted — the population recall ranks and the
   * pre-step may offer the model.
   */
  guidance(): MemoryState[] {
    return this.active().filter((memory) => !isContradicted(memory))
  }

  /** Active memories a check ran against and failed — visible, never offered. */
  contradicted(): MemoryState[] {
    return this.active().filter(isContradicted)
  }

  get(id: string, scope?: MemoryScope): MemoryState | undefined {
    const all = this.all()
    if (scope !== undefined) return all.find((memory) => memory.id === id && memory.scope === scope)
    return all.find((memory) => memory.id === id)
  }

  /** Whether a memory with this id exists in either scope — the candidate queue's dedupe. */
  has(id: string): boolean {
    return this.get(id) !== undefined
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
    return this.record(input, now).memory
  }

  /**
   * `remember`, plus whether the statement was already on file.
   *
   * The distinction exists for the model-facing tool: "recorded" and "already knew that"
   * are different answers, and a caller reporting the first when the second happened is
   * claiming work it did not do. It is computed here rather than by the caller because
   * the id is derived from the subject and text, and a second copy of that derivation
   * would drift from this one.
   */
  record(input: RememberInput, now = Date.now()): { memory: Memory; updated: boolean } {
    const text = input.text.trim()
    if (text.length === 0) throw new Error('cannot remember an empty statement')

    const scope: MemoryScope = input.scope ?? 'project'
    const store = this.storeFor(scope)
    const subject = input.subject !== undefined && input.subject.trim().length > 0
      ? normaliseSubject(input.subject)
      : normaliseSubject(text)
    const id = memoryId(subject, text)
    const guard = compileGuard(text)
    // The id deliberately excludes the scope: the same sentence recorded in both logs is
    // the same sentence, and a panel that showed two unrelated hex strings for it would
    // hide the fact that one statement was promoted from a project to a preference.
    const memory: Memory = { id, subject, text, kind: input.kind ?? 'fact', source: input.source ?? 'user', scope, createdAt: now }
    if (input.sessionId !== undefined) memory.sessionId = input.sessionId
    if (input.step !== undefined) memory.step = input.step
    if (guard) memory.guard = guard

    const existing = this.get(id, scope)
    // Keep the original creation time: re-stating a memory is not the memory being new,
    // and resetting it would let any repeat silently outrank older, better-evidenced ones.
    if (existing) memory.createdAt = existing.createdAt

    store.append({ type: 'remember', at: now, memory })
    return { memory, updated: existing !== undefined }
  }

  /**
   * Retire a memory, with a reason.
   *
   * Deletion is not offered. A memory that turns out to be wrong is the most valuable
   * record in the log — it is the only thing that can explain a past decision — so it is
   * marked superseded and kept, and the reason is required because "why did this stop
   * being true" is the question that will be asked later.
   */
  forget(id: string, reason: string, options: { replacedBy?: string; scope?: MemoryScope; now?: number } = {}): boolean {
    // The id does not carry a scope, so the same sentence held in both logs is two rows
    // with one id. Without an explicit scope the choice between them would be whichever
    // the fold happened to list first — a coin flip presented as a decision. Callers that
    // show both rows (the panel) pass the scope they were looking at.
    const target = this.get(id, options.scope)
    if (!target) return false
    if (reason.trim().length === 0) throw new Error('a memory can only be superseded with a reason')
    const event: MemoryEvent = { type: 'supersede', at: options.now ?? Date.now(), id, reason: reason.trim() }
    if (options.replacedBy !== undefined) event.replacedBy = options.replacedBy
    this.storeFor(target.scope).append(event)
    return true
  }

  /**
   * Group active memories that share a subject but say different things.
   *
   * The plugin deliberately does not pick a winner. Two memories with the same subject
   * and different text means one of them is wrong and the log does not say which; a
   * plausible-looking choice would be exactly the unfounded assertion this plugin exists
   * to eliminate.
   *
   * A contradicted memory is left out: it is not an open question, the world already
   * answered it. Keeping it here would present a settled matter as undecided.
   */
  conflicts(): Conflict[] {
    const groups = new Map<string, MemoryState[]>()
    for (const memory of this.guidance()) {
      const group = groups.get(memory.subject)
      if (group) group.push(memory)
      else groups.set(memory.subject, [memory])
    }
    const conflicts: Conflict[] = []
    for (const [subject, memories] of groups) {
      // Disagreement means a *different claim*, and a claim is identified by its id. The
      // same sentence can legitimately be recorded in both logs; it then appears twice
      // with the same id, which is one statement held twice, not a question to answer.
      // Without this, recording one convention per scope would report a memory as
      // conflicting with itself and offer "resolve" for a choice that does not exist.
      const seen = new Set<string>()
      const distinct = memories.filter((memory) => {
        if (seen.has(memory.id)) return false
        seen.add(memory.id)
        return true
      })
      if (distinct.length > 1) conflicts.push({ subject, memories: distinct })
    }
    return conflicts.sort((a, b) => b.memories.length - a.memories.length)
  }

  /**
   * Rank memories against a query.
   *
   * Defaults to guidance — the population the pre-step may offer. The pull tool widens
   * the target explicitly when the model asks what is *recorded* rather than what is
   * *true*, and that difference is carried by the argument instead of by a second
   * implementation.
   */
  recall(query: string, limit = 5, now = Date.now(), target: MemoryTarget = 'guidance'): RecallHit[] {
    return rankRecall(this.all(), query, limit, now, target)
  }

  /**
   * The newest memories in one population, for a caller that asked without a query.
   *
   * "What do you remember" has no lexical content to rank, and answering it with an
   * empty result would be pedantically correct and useless. Newest-first is the one
   * ordering that needs no claim about relevance — it is simply the log's own order,
   * read backwards.
   */
  recent(limit = 5, target: MemoryTarget = 'guidance'): MemoryState[] {
    return this.all().filter((memory) => inTarget(memory, target)).slice(0, limit)
  }

  // ─── Candidates ─
  //
  // A statement the heuristics noticed but the user never asked to keep. It lives in the
  // queue until a person decides; nothing here reaches recall.

  /**
   * Offer a statement.
   *
   * Returns undefined when it is already settled — an active memory, an open candidate,
   * or one already dismissed. That check is against the *log*, not against the message,
   * so a sentence repeated across a session is asked once rather than on every step.
   */
  propose(input: ProposeInput): Candidate | undefined {
    return this.queue.propose(input, this)
  }

  candidates(): CandidateState[] {
    return this.queue.pending()
  }

  dismiss(id: string, now = Date.now()): boolean {
    return this.queue.decide(id, 'dismissed', now)
  }

  /**
   * Turn a candidate into a memory.
   *
   * The decision is recorded *before* the memory is written, so a write that throws
   * leaves a dismissed-looking proposal rather than a candidate that reappears beside a
   * memory it duplicates. The candidate keeps the kind and provenance it was proposed
   * with, and the user's acceptance is the reason it exists — which is why the memory is
   * written with `source: 'user'`: a person said yes to it. A caller accepting through a
   * model-facing tool passes its own source instead, so the record names the agent.
   */
  accept(id: string, overrides: { text?: string; kind?: MemoryKind; scope?: MemoryScope; source?: MemorySource } = {}, now = Date.now()): Memory | undefined {
    const candidate = this.queue.get(id)
    if (candidate === undefined || candidate.status !== 'pending') return undefined
    const text = overrides.text?.trim() ?? candidate.text
    if (text.length === 0) return undefined
    this.queue.decide(id, 'accepted', now)
    return this.remember({
      text,
      kind: overrides.kind ?? candidate.kind,
      scope: overrides.scope ?? 'project',
      // Provenance names who decided, not who proposed. The panel and the CLI accept on
      // behalf of the person at the keyboard; the model-facing tool accepts on its own,
      // and that difference is what a later "why does the agent think this" must answer.
      source: overrides.source ?? 'user',
      ...(candidate.sessionId === undefined ? {} : { sessionId: candidate.sessionId }),
    }, now)
  }

  /**
   * Re-run every compiled guard.
   *
   * Keys accumulate because they are not interchangeable: `violated` is the world
   * disagreeing with a memory, `broken` is the check itself being unusable, and
   * `uncheckable` is there being no check. Only the first is evidence about the memory,
   * so only the first may influence a caller's exit code.
   *
   * @param options.record - when false, results are computed but not appended. The
   *   pre-step re-checks often; a log entry per check per step would grow the file
   *   without saying anything new.
   * @param options.changedOnly - append only when the outcome differs from the last
   *   recorded one, so a memory that keeps passing does not add a line per run.
   */
  verify(now = Date.now(), options: { record?: boolean; changedOnly?: boolean } = {}): VerifySummary {
    const record = options.record ?? true
    const changedOnly = options.changedOnly ?? false
    const summary: VerifySummary = { passed: 0, violated: 0, broken: 0, uncheckable: 0, results: [] }
    for (const memory of this.active()) {
      if (!memory.guard) {
        summary.uncheckable += 1
        summary.results.push({ id: memory.id, text: memory.text, outcome: 'uncheckable', exitCode: null, output: '' })
        continue
      }
      // Guards describe files in the project, so they resolve against the project even
      // when the statement itself is user-global.
      const run = runGuard(memory.id, memory.guard, this.projectDir, new Date(now))
      if (record && (!changedOnly || memory.verification?.outcome !== run.outcome)) {
        this.storeFor(memory.scope).append({
          type: 'verify',
          at: now,
          id: memory.id,
          outcome: run.outcome,
          exitCode: run.exitCode,
          output: run.output,
        })
      }

      const result: VerifyResult = {
        id: memory.id,
        text: memory.text,
        guard: memory.guard,
        outcome: run.outcome,
        exitCode: run.exitCode,
        output: run.output,
      }
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
    const contradicted = active.filter(isContradicted)
    const guidance = active.filter((memory) => !isContradicted(memory))
    const candidates = this.candidates()
    return {
      active: guidance,
      superseded,
      contradicted,
      conflicts: this.conflicts(),
      candidates,
      totals: {
        active: guidance.length,
        superseded: superseded.length,
        contradicted: contradicted.length,
        withGuard: active.filter((memory) => memory.guard).length,
        verified: active.filter((memory) => memory.verification?.outcome === 'passed').length,
        unverified: active.filter((memory) => memory.verification?.outcome !== 'passed').length,
        candidates: candidates.length,
      },
    }
  }
}
