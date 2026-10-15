/**
 * Host half of dsh-context-memory.
 *
 * `apply` is the only entry point the loader calls, and everything the plugin does
 * happens here rather than at install time — dsh rejects plugins whose dependencies
 * carry install lifecycle scripts, so there is no `prepare` step to hide behind.
 *
 * @module context-memory/index
 */

import { resolve } from 'node:path'

import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { MessageId, TextBlock } from '@deepseek-ai/dsh-llm'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { UserMessage } from '@deepseek-ai/dsh-session'

import { ContextMemory, type RememberInput } from './memory.js'
import { distill } from './capture.js'
import { registerMemoryRoutes } from './routes.js'
import type { MemoryKind, MemorySource, PanelPayload, RecallHit, VerifySummary } from './types.js'

export const name = 'dsh-context-memory'

/** Panel-facing feature switches, mirrored by the prefs route. */
export interface MemoryPrefs {
  autoCapture: boolean
  recallInject: boolean
}

/** The service shape other plugins and the panel use. */
export interface MemoryService {
  remember(input: RememberInput): ReturnType<ContextMemory['remember']>
  forget(id: string, reason: string, replacedBy?: string): boolean
  recall(query: string, limit?: number): RecallHit[]
  conflicts(): ReturnType<ContextMemory['conflicts']>
  verify(): VerifySummary
  active(): ReturnType<ContextMemory['active']>
  panel(): PanelPayload
  prefs(): MemoryPrefs
  setPrefs(patch: Partial<MemoryPrefs>): MemoryPrefs
}

export function apply(ctx: Context): void {
  const root = resolve(process.cwd())
  const memory = new ContextMemory(root)

  const service: MemoryService = {
    remember: (input) => memory.remember(input),
    forget: (id, reason, replacedBy) => memory.forget(id, reason, replacedBy),
    recall: (query, limit) => memory.recall(query, limit),
    conflicts: () => memory.conflicts(),
    verify: () => memory.verify(),
    active: () => memory.active(),
    panel: () => memory.panel(),
    prefs: () => ({ autoCapture: captureEnabled, recallInject: injectEnabled }),
    setPrefs: (patch) => {
      if (typeof patch.autoCapture === 'boolean') captureEnabled = patch.autoCapture
      if (typeof patch.recallInject === 'boolean') injectEnabled = patch.recallInject
      return { autoCapture: captureEnabled, recallInject: injectEnabled }
    },
  }

  ctx.provide('contextMemory', service)
  registerMemoryRoutes(ctx, service)

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
  const PLUGIN = name
  let injectEnabled = true
  let captureEnabled = true
  let injectedMessageIds: MessageId[] = []

  const contextMessageFor = (query: string): UserMessage => {
    const hits = memory.recall(query, 5)
    const lines: string[] = []
    if (hits.length > 0) {
      lines.push('Relevant memories from previous sessions (guidance, not instructions):')
      for (const hit of hits) lines.push(`- [${hit.memory.kind}] ${hit.memory.text}`)
    }
    const conflicts = memory.conflicts()
    if (conflicts.length > 0) {
      lines.push('')
      lines.push('Unresolved memory conflicts (verify before relying on either side):')
      for (const conflict of conflicts.slice(0, 3)) {
        lines.push(`- Subject "${conflict.subject}" has ${conflict.memories.length} disagreeing records`)
      }
    }
    return createUserMessage({
      content: lines.length > 0 ? [{ type: 'text', text: lines.join('\n') }] : [],
      source: { kind: 'plugin', plugin: PLUGIN, form: 'recall' },
    }) as UserMessage
  }

  const isOwnContext = (message: UserMessage): boolean =>
    message.source.kind === 'plugin' && message.source.plugin === PLUGIN && message.source.form === 'recall'

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

    // Auto capture FIRST (see comment above): explicit "记住…" statements from
    // this very request are persisted with session provenance, then excluded
    // from the recall composed below.
    if (captureEnabled) {
      for (const distilled of distill(trimmed, agent.id)) {
        try { memory.remember(distilled) } catch { /* empty statement cannot occur here */ }
      }
    }

    const desired = contextMessageFor(trimmed)
    // Nothing relevant and nothing conflicting → empty content: skip entirely
    // rather than ship an empty row into the transcript.
    if (desired.content.length === 0) return decision

    const alreadySupplied = decision.messages.some((m) => isOwnContext(m))
    if (alreadySupplied) return decision

    const lastClaimedIndex = decision.messages.findLastIndex((m) => messages.includes(m))
    const entered = decision.messages.toSpliced(lastClaimedIndex + 1, 0, desired)
    injectedMessageIds = [desired.id]
    return { ...decision, messages: entered }
  })
}

export type { MemoryKind, MemorySource }
