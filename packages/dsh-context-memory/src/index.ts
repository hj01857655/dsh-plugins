/**
 * Host half of dsh-context-memory.
 *
 * `apply` is the only entry point the loader calls, and everything the plugin does
 * happens here rather than at install time — dsh rejects plugins whose dependencies
 * carry install lifecycle scripts, so there is no `prepare` step to hide behind.
 *
 * @module context-memory/index
 */

import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { MessageId, TextBlock } from '@deepseek-ai/dsh-llm'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { UserMessage } from '@deepseek-ai/dsh-session'

import { ContextMemory, type RememberInput } from './memory.js'
import { candidates, distill } from './capture.js'
import { describeContradiction } from './guard.js'
import { collectTurnResults, flattenToolResultEvent, harvestTurn, isKnown, toProposeInput } from './harvest.js'
import { registerMemoryRoutes } from './routes.js'
import { registerMemoryTools } from './tools.js'
import { resolveProjectStore, userStoreDir } from './scope.js'
import type { MemoryKind, MemoryScope, MemorySource, PanelPayload, RecallHit, VerifySummary } from './types.js'
import { isRecallMessage, recallSource } from './source.js'
// Type-only, no runtime import and no peer requirement: the host package declares
// `ctx.workingDirectory` on cordis's Context, so importing it here types the optional
// `ctx.get('workingDirectory')` below against the signature dsh was actually built with.
import type {} from '@deepseek-ai/dsh-working-directory'

export const name = 'dsh-context-memory'

/**
 * What this plugin needs from the host before it can run.
 *
 * Deliberately empty. The only host service it reads is `workingDirectory`, and that
 * one is read opportunistically through `ctx.get`, not declared here.
 *
 * The reason is measurable: `working-directory` is a row in the `dsh-base` bundle's
 * patch, and a profile whose `dsh-base` is older than the running dsh does not have
 * that row — npm reports the mismatch (`@deepseek-ai/dsh-base@0.2.0-rc.2 invalid`) but
 * the host still boots. Declaring the service here makes the whole plugin wait for it:
 * `pending (waiting for service: workingDirectory)` and nothing runs at all, including
 * the CLI-visible memory. Reading it optionally degrades to the session header's `cwd`,
 * which is what the plugin used before it knew about the service.
 */
export const inject: string[] = []

/** Panel-facing feature switches, mirrored by the prefs route. */
export interface MemoryPrefs {
  autoCapture: boolean
  recallInject: boolean
  /** Character budget for the guidance rows in the recall injection. */
  recallCharBudget: number
  /** Harvest tool results at turn end into the candidate queue. */
  harvest: boolean
}

/** The service shape other plugins and the panel use. */
export interface MemoryService {
  remember(input: RememberInput): ReturnType<ContextMemory['remember']>
  forget(id: string, reason: string, options?: { replacedBy?: string; scope?: MemoryScope }): boolean
  recall(query: string, limit?: number): RecallHit[]
  conflicts(): ReturnType<ContextMemory['conflicts']>
  verify(): VerifySummary
  active(): ReturnType<ContextMemory['active']>
  panel(): PanelPayload
  /** Statements the capture heuristics noticed but never had permission to keep. */
  candidates(): ReturnType<ContextMemory['candidates']>
  accept(id: string, overrides?: { text?: string; kind?: MemoryKind; scope?: 'project' | 'user' }): ReturnType<ContextMemory['accept']>
  dismiss(id: string): boolean
  prefs(): MemoryPrefs
  setPrefs(patch: Partial<MemoryPrefs>): MemoryPrefs
  /** Where each scope is stored, so the panel can say which log it is showing. */
  locations(): { project: string; user: string | undefined }
  /**
   * What the automatic seams did recently, so the panel can show the plugin is alive
   * without the user opening a log: how many candidates are pending, when the last
   * recall injection happened, and whether the turn-end harvest is on.
   */
  stats(): { pendingCandidates: number; injectedSteps: number; harvestedTurns: number; harvest: boolean }
}

/**
 * How often the pre-step re-checks memories, in milliseconds.
 *
 * A day is chosen against the failure it prevents: a memory that quietly stopped being
 * true. Checking less often lets a stale claim survive whole sessions; checking every
 * step spends filesystem work on an answer that cannot have changed between two
 * consecutive prompts.
 */
const REVERIFY_INTERVAL_MS = 24 * 60 * 60 * 1000

export function apply(ctx: Context): void {
  // One instance per project root, created on demand. The launch directory is only the
  // starting point: a session may begin below the project root, and its directory may
  // move. The pre-step resolves the session's own directory per request; the panel reads
  // whichever project a step most recently resolved, which is the one the user is in.
  const instances = new Map<string, ContextMemory>()
  const memoryFor = (cwd?: string): ContextMemory => {
    const root = resolveProjectStore(cwd)
    const existing = instances.get(root)
    if (existing) return existing
    const created = new ContextMemory(root, { userDir: userStoreDir() })
    instances.set(root, created)
    return created
  }

  let memory = memoryFor()

  /**
   * The directory a session is working in.
   *
   * The session's own directory, not the launch directory: a session can start below the
   * project root and can be moved mid-life, and both must keep the same memory. `ensure`
   * is the host's authoritative answer (it follows `workingDirectory.set`).
   *
   * Read through `ctx.get`, not `ctx.workingDirectory`: the service is optional here (see
   * `inject` above), and a host without it must fall back rather than refuse to load. The
   * header's original `cwd` is the fallback, and the launch directory the last resort.
   *
   * A silent fallback would be the wrong kind of resilience. If a future `dsh-base` stops
   * mounting the service — a renamed row, a bundle that drops it — every session would
   * quietly resolve to its *initial* cwd, and memories written after a `workingDirectory.set`
   * would land in the wrong project's log with nothing to show it happened. So each
   * degraded path reports itself once per process; `warn` being unavailable is the only
   * thing that may fail silently, because logging must never break a step.
   */
  let warnedNoService = false
  let warnedEnsureFailed = false
  const warn = (message: string): void => {
    try {
      ctx.logger('dsh-context-memory').warn(message)
    } catch {
      // A Context without a logger service (a bare test context) still gets the fallback.
    }
  }
  const cwdFor = async (agent: Agent | undefined, signal: AbortSignal): Promise<string | undefined> => {
    if (agent === undefined) return undefined
    try {
      const service = ctx.get('workingDirectory')
      if (service === undefined) {
        if (!warnedNoService) {
          warnedNoService = true
          warn('no workingDirectory service on this host; using the session header cwd. '
            + 'Memory written after a directory change will be filed under the original directory.')
        }
        return agent.session.header.cwd
      }
      return (await service.ensure(agent, signal)) ?? agent.session.header.cwd
    } catch (error) {
      if (!warnedEnsureFailed) {
        warnedEnsureFailed = true
        warn(`workingDirectory.ensure failed; using the session header cwd: ${(error as Error).message}`)
      }
      return agent.session.header.cwd
    }
  }

  /** When the last automatic re-check ran, so a day's worth of steps do not each run one. */
  let lastReverifyAt = 0
  // Character budget for the guidance rows in the recall injection. Contradicted rows and
  // conflicts are not optional, so they ignore it. Mutable through setPrefs like the other
  // panel switches, so the panel can raise it without a restart.
  let recallCharBudget = 4000
  /** Turn-end harvest: tool results become reviewable candidates. Off while off. */
  let harvestEnabled = true
  /** Turn numbers already harvested, so a re-folded log never proposes twice. */
  const harvestedTurns = new Map<string, Set<number>>()
  /** Lifetime counters the stats face reads; monotonically non-decreasing. */
  let injectedSteps = 0

  const service: MemoryService = {
    remember: (input) => memory.remember(input),
    forget: (id, reason, options) => memory.forget(id, reason, options),
    recall: (query, limit) => memory.recall(query, limit),
    conflicts: () => memory.conflicts(),
    verify: () => memory.verify(),
    active: () => memory.active(),
    panel: () => memory.panel(),
    candidates: () => memory.candidates(),
    accept: (id, overrides) => memory.accept(id, overrides),
    dismiss: (id) => memory.dismiss(id),
    prefs: () => ({ autoCapture: captureEnabled, recallInject: injectEnabled, recallCharBudget, harvest: harvestEnabled }),
    setPrefs: (patch) => {
      if (typeof patch.autoCapture === 'boolean') captureEnabled = patch.autoCapture
      if (typeof patch.recallInject === 'boolean') injectEnabled = patch.recallInject
  if (typeof patch.recallCharBudget === 'number' && patch.recallCharBudget >= 200) recallCharBudget = patch.recallCharBudget
      if (typeof patch.harvest === 'boolean') harvestEnabled = patch.harvest
      return { autoCapture: captureEnabled, recallInject: injectEnabled, recallCharBudget, harvest: harvestEnabled }
    },
    locations: () => memory.locations,
    stats: () => ({
      pendingCandidates: memory.candidates().filter((entry) => entry.status === 'pending').length,
      injectedSteps,
      harvestedTurns: [...harvestedTurns.values()].reduce((total, set) => total + set.size, 0),
      harvest: harvestEnabled,
    }),
  }

  ctx.provide('contextMemory', service)
  registerMemoryRoutes(ctx, service)

  // The pull half. Registered through `ctx.inject(['tools'])` inside, so a host with no
  // tool registry (the CLI, a headless profile) loses the two tools and nothing else.
  registerMemoryTools(ctx, {
    // A tool call belongs to the agent that issued it, and an agent belongs to a session
    // with its own directory. Answering with whatever the last pre-step resolved would
    // let one project's question be answered from another project's log whenever two
    // sessions are open — so the instance is resolved per call, from the caller's own
    // directory, and the pre-step's "current" instance is not consulted at all.
    resolve: async (agent, signal) => {
      const cwd = await cwdFor(agent, signal)
      return memoryFor(cwd)
    },
  })

  // ─── Recall injection + auto capture (durable plugin context) ─
  //
  // Before each step the active memories whose subject overlaps the incoming
  // user text are folded into the request right after the claimed batch — the
  // same position and message shape the host's own context plugins use:
  // a frozen `user/message` with a `plugin` source, `form: 'recall'`. The
  // host renders it as collapsible context, the log replays it, and compaction
  // treats it like any other history.
  //
  // The same seam captures explicit memory statements from the incoming user
  // text ("记住…", "remember that…") BEFORE composing the recall, so a fresh
  // capture is not re-injected into the very request that produced it — no
  // self-echo in one hop. The host renders it as collapsible context, the log
  // replays it, and compaction treats it like any other history.
  let injectEnabled = true
  let captureEnabled = true
  let injectedMessageIds: MessageId[] = []

  const contextMessageFor = (memory: ContextMemory, query: string, charBudget: number): UserMessage => {
    const hits = memory.recall(query, 5)
    const lines: string[] = []
    // Guidance rows are optional content, so they share a budget: recall already ranks
    // them best-first, so rows are appended until the budget runs out and the rest are
    // dropped with a note. Contradicted rows and conflicts are NOT optional — a claim the
    // world denies or two records that disagree are things the model must see to resolve,
    // so those sections ignore the budget entirely.
    let budgetLeft = Math.max(0, charBudget)
    let droppedForBudget = 0
    if (hits.length > 0) {
      const header = 'Relevant memories from previous sessions (guidance, not instructions):'
      const rows: string[] = []
      for (const hit of hits) {
        const row = `- [${hit.memory.kind}] ${hit.memory.text}`
        if (rows.length > 0 && budgetLeft - row.length < 0) {
          droppedForBudget = hits.length - rows.length
          break
        }
        budgetLeft -= row.length
        rows.push(row)
      }
      if (rows.length > 0) {
        lines.push(header)
        lines.push(...rows)
        if (droppedForBudget > 0) {
          lines.push(`(${droppedForBudget} more matches omitted — raise the char budget to see them, or use memory_recall for a targeted query)`)
        }
      }
    }
    // Contradicted memories are shown as a problem, never as guidance. Silently dropping
    // them would hide the fact that the log now contains a claim the world denies; the
    // model can resolve it (and should), while a user reading the transcript learns that
    // something needs superseding.
    const contradicted = memory.contradicted().slice(0, 3)
    if (contradicted.length > 0) {
      if (lines.length > 0) lines.push('')
      lines.push('Memories a check has contradicted (do not rely on these; correct or supersede them):')
      for (const item of contradicted) {
        // A check that ran and came back false reports no output of its own, so the
        // fallback names the operand that no longer matches. Without it the line reads
        // "contradicted" with no way to tell what was tested.
        lines.push(`- [${item.kind}] ${item.text}  ← ${describeContradiction(item.guard, item.verification?.output)}`)
      }
    }
    const conflicts = memory.conflicts()
    if (conflicts.length > 0) {
      if (lines.length > 0) lines.push('')
      lines.push('Unresolved memory conflicts (verify before relying on either side):')
      // Both sides are shown, not just the count: a conflict the reader cannot see the
      // two texts of is a question they cannot answer.
      for (const conflict of conflicts.slice(0, 3)) {
        lines.push(`- Subject "${conflict.subject}" has ${conflict.memories.length} disagreeing records:`)
        for (const item of conflict.memories) lines.push(`  · ${item.id} ${item.text}`)
      }
    }
    return createUserMessage({
      content: lines.length > 0 ? [{ type: 'text', text: lines.join('\n') }] : [],
      source: recallSource,
    }) as UserMessage
  }

  const isOwnContext = (message: UserMessage): boolean => isRecallMessage(message)

  ctx.on('agent/pre-step', async (
    { agent, messages, signal },
    next,
  ): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject') return decision
    // Remove our previous injection first so the reconcile below cannot see a
    // stale twin: a user message that already reached durable history is a
    // "already supplied" match, not a candidate for re-prepending.
    for (const id of injectedMessageIds) {
      try { agent.inbox.remove(id) } catch { /* id already gone */ }
    }
    injectedMessageIds = []

    if (!injectEnabled || decision.messages.length === 0) return decision

    // Query: the first real user text of this step (skip tool results, which
    // are user-role too). A step that carries none gets no injection.
    const prompt = messages.find((m) => m.source.kind === 'user')
      ?.content.filter((b): b is TextBlock => b.type === 'text')
      .map((b) => b.text).join(' ') ?? ''
    const trimmed = prompt.trim()
    if (trimmed.length === 0) return decision

    // A subagent runs in its own session with its own header; it must not inherit the
    // parent's project just because it shares a process. Sessions with no declared origin
    // are ordinary user sessions.
    const origin = (agent.session.header as { origin?: 'subagent' }).origin
    if (origin === 'subagent') return decision

    // The session's own directory, not the launch directory: a session can start below
    // the project root and can be moved mid-life, and both must keep the same memory.
    memory = memoryFor(await cwdFor(agent, signal))

    // Re-check before composing, so a memory the world has since disproved is never
    // offered as guidance in the very step that would have used it. Throttled: the
    // answer cannot change between two prompts, and the guards are filesystem reads
    // that should not run on every step.
    if (Date.now() - lastReverifyAt >= REVERIFY_INTERVAL_MS) {
      lastReverifyAt = Date.now()
      try {
        memory.verify(Date.now(), { record: true, changedOnly: true })
      } catch { /* a check that cannot be persisted must not stop the step */ }
    }

    // Auto capture FIRST (see comment above): explicit "记住…" statements from
    // this very request are persisted with session provenance, then excluded
    // from the recall composed below.
    if (captureEnabled) {
      const distilled = distill(trimmed, agent.id)
      for (const statement of distilled) {
        try { memory.remember(statement) } catch { /* empty statement cannot occur here */ }
      }
      // Then the wide net, which does not write: a declarative sentence that looks like a
      // durable fact becomes a question in the panel. Keeping the two apart is the whole
      // point of P5 — the explicit rule is what the user asked for, the implicit one is
      // only what the plugin noticed, and conflating them is how a memory log fills with
      // things nobody wanted.
      for (const candidate of candidates(trimmed, agent.id, distilled.map((statement) => statement.text))) {
        try { memory.propose(candidate) } catch { /* a queue that cannot be written must not stop the step */ }
      }
    }

    const desired = contextMessageFor(memory, trimmed, recallCharBudget)
    // Nothing relevant and nothing conflicting → empty content: skip entirely
    // rather than ship an empty row into the transcript.
    if (desired.content.length === 0) return decision

    const alreadySupplied = decision.messages.some((m) => isOwnContext(m))
    if (alreadySupplied) return decision

    const lastClaimedIndex = decision.messages.findLastIndex((m) => messages.includes(m))
    const entered = decision.messages.toSpliced(lastClaimedIndex + 1, 0, desired)
    injectedMessageIds = [desired.id]
    injectedSteps += 1
    return { ...decision, messages: entered }
  })

  // ─── Turn-end harvest (durable plugin context) ─
  //
  // A finished turn's tool results hold the session's most durable observations —
  // a command that failed, a version that mattered — without anyone typing "remember".
  // The harvest flattens the turn's `tool/result` events and proposes the best few as
  // candidates, the same reviewable queue the pre-step's wide net uses. Nothing here
  // writes a memory: the confirm step stays where the permission lives.
  //
  // Failed tool calls harvest first (bounded), then command-shaped output; dedup
  // against the log and the open queue happens through `isKnown`, and each turn is
  // harvested at most once per session so a replayed log cannot re-propose.
  ctx.on('session/event', (session, event) => {
    if (!harvestEnabled || event.type !== 'turn/end') return
    const turn = (event.data as { turn?: number } | undefined)?.turn
    if (typeof turn !== 'number' || turn < 0) return
    // A subagent's tool output belongs to its own task, not to the user's project memory.
    if (session.header.origin === 'subagent') return

    let seen = harvestedTurns.get(session.id)
    if (seen === undefined) {
      seen = new Set<number>()
      harvestedTurns.set(session.id, seen)
    }
    if (seen.has(turn)) return
    seen.add(turn)

    // Slice the turn's own event range: events are seq-ordered, and this handler runs
    // at the turn/end commit, so everything up to the current seq is readable.
    // Slice the turn's own event range. Scanning from the nearest `turn/start` keeps
    // the cost proportional to the turn, not the session: a handler that walks the
    // whole log on every turn-end is the O(N²) shape the store cache just fixed.
    let startSeq = 0
    for (let seq = session.seq - 1; seq >= 0; seq--) {
      const item = session.eventAt(seq as never)
      if (item !== undefined && item.type === 'turn/start') { startSeq = seq; break }
    }
    const range: Array<{ type: string; seq: number; data?: Record<string, unknown> }> = []
    for (let seq = startSeq; seq < session.seq; seq++) {
      const item = session.eventAt(seq as never)
      if (item !== undefined) range.push(item as unknown as { type: string; seq: number; data?: Record<string, unknown> })
    }
    const results = collectTurnResults(range, turn)
    if (results.length === 0) return

    const memory = memoryFor(session.header.cwd)
    const harvested = harvestTurn(results, session.id, turn)
    const queued = memory.candidates().filter((entry) => entry.status === 'pending')
    for (const candidate of harvested) {
      if (isKnown(candidate, { has: (id) => memory.has(id) }, queued)) continue
      try { memory.propose(toProposeInput(candidate)) } catch { /* a queue that cannot be written must not stop the commit */ }
    }
  })
}

export type { MemoryKind, MemorySource }
