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

import { ContextMemory, type RememberInput } from './memory.js'
import { registerMemoryRoutes } from './routes.js'
import type { MemoryKind, MemorySource, PanelPayload, RecallHit, VerifySummary } from './types.js'

export const name = 'dsh-context-memory'

/** The service shape other plugins and the panel use. */
export interface MemoryService {
  remember(input: RememberInput): ReturnType<ContextMemory['remember']>
  forget(id: string, reason: string, replacedBy?: string): boolean
  recall(query: string, limit?: number): RecallHit[]
  conflicts(): ReturnType<ContextMemory['conflicts']>
  verify(): VerifySummary
  active(): ReturnType<ContextMemory['active']>
  panel(): PanelPayload
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
  }

  ctx.provide('contextMemory', service)
  registerMemoryRoutes(ctx, service)
}

export type { MemoryKind, MemorySource }
