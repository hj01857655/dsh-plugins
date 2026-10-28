/**
 * Model-facing tools: the pull half of memory.
 *
 * Recall injection pushes what the plugin thinks is relevant. That is one direction only,
 * and it leaves the model unable to ask the question it most often needs answered:
 * "what did we already decide about this?" This module registers that question as two
 * tools, so memory is something the model can consult rather than only something that
 * arrives unasked.
 *
 * The two directions deliberately answer differently. The push path may only offer
 * guidance — active and not contradicted — because unsolicited text influences the turn.
 * The pull path is answering a question someone actually asked, so it can widen to
 * contradicted or superseded records when asked to by name. The difference is carried by
 * the `include` argument rather than by a second implementation, and `guidance` is still
 * the default: a model that does not think about populations gets the same conservatism
 * the push path applies.
 *
 * @module context-memory/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'

import { describeContradiction, describeGuard } from './guard.js'
import type { ContextMemory } from './memory.js'
import type { MemoryKind, MemoryScope, MemoryState, MemoryTarget } from './types.js'

/** Populations a caller may search, in the order the schema lists them. */
const TARGETS = ['guidance', 'contradicted', 'superseded', 'all'] as const

/** Kinds a memory may be recorded as. Mirrors `MemoryKind`. */
const KINDS = ['fact', 'decision', 'preference', 'pitfall'] as const

/** Scopes a memory may be written to. Mirrors `MemoryScope`. */
const SCOPES = ['project', 'user'] as const

/** Bounds on one search, so a model cannot ask for the whole log by accident. */
const MIN_LIMIT = 1
const MAX_LIMIT = 20
const DEFAULT_LIMIT = 5

/** How this plugin finds the log belonging to one call's recording context. */
export interface MemoryToolOptions {
  /**
   * The instance for the session that issued the call.
   *
   * A tool call belongs to an agent, and an agent belongs to a session with its own
   * working directory — which may not be the project the last pre-step resolved. Reading
   * the shared "current" instance instead would answer a question about one project with
   * another project's log.
   */
  resolve(agent: Agent | undefined, signal: AbortSignal): Promise<ContextMemory>
}

/** Clamp a requested result count into the range one call may return. */
function clampLimit(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_LIMIT
  const whole = Math.trunc(requested)
  return Math.min(Math.max(whole, MIN_LIMIT), MAX_LIMIT)
}

/**
 * The verification word for one memory, as the model sees it.
 *
 * `unverified` and `broken` are kept apart from `violated` for the same reason the guard
 * module keeps them apart: a check that could not run is not evidence about the memory.
 * Collapsing them into "failed" would teach the model to distrust true statements whose
 * guard happens to be broken.
 */
function verificationOf(memory: MemoryState): string {
  const outcome = memory.verification?.outcome
  if (outcome === undefined) return 'unverified'
  return outcome
}

/** The first line of a failed check, for a caller that wants to know why. */
function contradictionOf(memory: MemoryState): string {
  return describeContradiction(memory.guard, memory.verification?.output)
}

/** One result row in the tool's output shape. */
function hitOf(memory: MemoryState) {
  return {
    id: memory.id,
    text: memory.text,
    kind: memory.kind,
    scope: memory.scope,
    verification: verificationOf(memory),
    // Only an actual contradiction gets a reason. `broken` says the check is unusable,
    // and attaching its message here would read as evidence against the memory.
    ...(memory.verification?.outcome === 'violated' ? { detail: contradictionOf(memory) } : {}),
  }
}

/**
 * Register both tools, once the host's tool registry exists.
 *
 * Registered through `ctx.inject` rather than a static `inject` entry for the same reason
 * the working directory is read through `ctx.get`: this plugin must keep working on a host
 * that mounts no tool registry (the CLI, a headless profile without tools), and a declared
 * dependency on `tools` would leave the whole plugin pending — including the pre-step
 * injection and the panel — on such a host. The tools are an addition, not a precondition.
 */
export function registerMemoryTools(ctx: Context, options: MemoryToolOptions): void {
  ctx.inject(['tools'], (toolCtx) => {
    toolCtx.tools.register(defineTool({
      name: 'memory_recall',
      description: 'Search this project\'s stored memories (conventions, decisions, preferences, pitfalls recorded in earlier sessions) and return the strongest matches with their verification state. By default only memories that are active and not contradicted are returned; pass include to widen. Omit query to list the newest memories instead.',
      parameters: {
        query: {
          type: 'string',
          description: 'What to look for. Latin words match as words, Chinese text matches on two-character runs. Omit to list the newest memories.',
        },
        limit: {
          type: 'integer',
          description: `How many memories to return. ${MIN_LIMIT}-${MAX_LIMIT}, default ${DEFAULT_LIMIT}.`,
        },
        include: {
          type: 'string',
          enum: [...TARGETS],
          description: 'Which memories to search: guidance (default) is active and not contradicted; contradicted is active but disproved by a check; superseded was retired; all is everything recorded.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            hits: {
              type: 'array',
              required: true,
              description: 'Matches, strongest first.',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string', required: true, description: 'Reference for this memory.' },
                  text: { type: 'string', required: true, description: 'The remembered statement.' },
                  kind: { type: 'string', required: true, description: 'fact, decision, preference, or pitfall.' },
                  scope: { type: 'string', required: true, description: 'project or user.' },
                  verification: { type: 'string', required: true, description: 'passed, violated, broken, or unverified.' },
                  detail: { type: 'string', description: 'Why a check contradicted it, when one did.' },
                },
              },
            },
            include: { type: 'string', required: true, description: 'The population actually searched.' },
            note: { type: 'string', description: 'Present when the search returned nothing, or when it fell back to newest-first.' },
          },
        },
        render: (_args, value) => {
          const lines: string[] = []
          if (value.hits.length === 0) {
            lines.push(`No stored memory matched (searched: ${value.include}).`)
          } else {
            lines.push(`${value.hits.length} memory${value.hits.length === 1 ? '' : 'ies'} (searched: ${value.include}):`)
            for (const hit of value.hits) {
              const detail = hit.detail === undefined ? '' : ` — contradicted by ${hit.detail}`
              lines.push(`- [${hit.kind}] ${hit.text}  (id ${hit.id}, ${hit.scope}, ${hit.verification})${detail}`)
            }
          }
          if (value.note !== undefined) lines.push('', value.note)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const memory = await options.resolve(exec.agent, exec.signal)
        const target = (args.include ?? 'guidance') as MemoryTarget
        const limit = clampLimit(args.limit)
        const query = args.query?.trim() ?? ''

        // An empty query is a question about nothing, and a lexical search would answer it
        // with nothing. "What do you remember" is a real question, so it gets the newest
        // entries of the requested population instead.
        if (query.length === 0) {
          const hits = memory.recent(limit, target)
          return {
            hits: hits.map(hitOf),
            include: target,
            ...(hits.length > 0 ? { note: 'No query was given, so these are the newest memories rather than the most relevant.' } : {}),
          }
        }

        return {
          hits: memory.recall(query, limit, Date.now(), target).map((hit) => hitOf(hit.memory)),
          include: target,
        }
      },
    }))

    toolCtx.tools.register(defineTool({
      name: 'memory_remember',
      description: 'Record a durable memory for this project or for the user, so later sessions see it. Use it for conventions, decisions, preferences, and pitfalls the user states or that the work establishes — not for transient task state. The statement is stored as text; only a few narrow statement shapes get a filesystem check that can later verify or contradict it.',
      parameters: {
        text: {
          type: 'string',
          required: true,
          description: 'The statement to remember, in the user\'s own words. One claim per call.',
        },
        kind: {
          type: 'string',
          enum: [...KINDS],
          description: 'fact (default), decision, preference, or pitfall.',
        },
        subject: {
          type: 'string',
          description: 'What the claim is about. Two different statements with the same subject are reported as a conflict; omit to use the statement itself.',
        },
        scope: {
          type: 'string',
          enum: [...SCOPES],
          description: 'project (default) travels with this checkout; user applies everywhere this user works.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true, description: 'Reference for the recorded memory.' },
            text: { type: 'string', required: true, description: 'The statement as stored (trimmed).' },
            kind: { type: 'string', required: true, description: 'The kind it was recorded as.' },
            scope: { type: 'string', required: true, description: 'Which log it was written to.' },
            check: { type: 'string', description: 'The filesystem check that will re-verify it. Absent when none could be compiled.' },
            updated: { type: 'boolean', required: true, description: 'True when this statement was already recorded and only its timestamp was refreshed.' },
          },
        },
        render: (_args, value) => [{
          type: 'text',
          text: [
            `${value.updated ? 'Already recorded' : 'Remembered'} ${value.id} [${value.scope}, ${value.kind}]: ${value.text}`,
            value.check === undefined
              ? 'No check could be compiled from this statement, so nothing will re-verify it.'
              : `Check: ${value.check}.`,
          ].join('\n'),
        }],
      },
      // Writes append one line to a file. Two of them commute, and the registry already
      // serializes nothing else about them, so they may share a parallel group.
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const memory = await options.resolve(exec.agent, exec.signal)
        const kind: MemoryKind = (args.kind ?? 'fact') as MemoryKind
        const scope: MemoryScope = (args.scope ?? 'project') as MemoryScope
        const { memory: stored, updated } = memory.record({
          text: args.text,
          kind,
          scope,
          // Provenance is not decoration: the panel distinguishes what the user said from
          // what the model decided to write down, and a memory is only as trustworthy as
          // its source is.
          source: 'agent',
          ...(args.subject === undefined || args.subject.trim().length === 0 ? {} : { subject: args.subject }),
          ...(exec.agent === undefined ? {} : { sessionId: exec.agent.id }),
        })
        return {
          id: stored.id,
          text: stored.text,
          kind: stored.kind,
          scope,
          ...(stored.guard === undefined ? {} : { check: describeGuard(stored.guard) }),
          updated,
        }
      },
    }))
    toolCtx.tools.register(defineTool({
      name: 'memory_forget',
      description: 'Retire a memory that is no longer true, keeping the record and the reason. A memory is superseded, not deleted: the log keeps what was believed and why it stopped being believed. Pass an id from memory_recall, or a query to locate the one to retire.',
      parameters: {
        id: { type: 'string', description: 'Exact memory id, as returned by memory_recall.' },
        query: { type: 'string', description: 'Match the memory to retire by text, when its id is unknown.' },
        reason: {
          type: 'string',
          required: true,
          description: 'Why it is no longer true. This is the question someone will ask later, so it is required.',
        },
        replacedBy: { type: 'string', description: 'Id of the memory that replaces this one, when the fact changed rather than disappeared.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            retired: { type: 'boolean', required: true, description: 'False when nothing matched.' },
            id: { type: 'string', description: 'The retired memory id.' },
            text: { type: 'string', description: 'What it said.' },
            error: { type: 'string', description: 'Why nothing was retired.' },
          },
        },
        render: (_args, value) => [
          {
            type: 'text',
            text: value.retired
              ? `Retired ${value.id}: ${value.text}`
              : `Not retired: ${value.error ?? 'unknown reason'}`,
          },
        ],
      },
      async execute(args, exec) {
        const memory = await options.resolve(exec.agent, exec.signal)
        const id = args.id?.trim()
        let target = id === undefined || id.length === 0 ? undefined : memory.get(id)
        const query = args.query?.trim()
        if (target === undefined && query !== undefined && query.length > 0) {
          const [best] = memory.recall(query, 1)
          if (best !== undefined) target = memory.get(best.memory.id)
        }
        if (target === undefined) {
          return {
            retired: false,
            error: id !== undefined && id.length > 0 ? `no memory with id ${id}` : 'pass id or query to name the memory to retire',
          }
        }
        const reason = args.reason?.trim() ?? ''
        if (reason.length === 0) {
          return { retired: false, id: target.id, text: target.text, error: 'reason is required: a memory retired without one cannot be explained later' }
        }
        const retired = memory.forget(target.id, reason, {
          ...(args.replacedBy === undefined ? {} : { replacedBy: args.replacedBy }),
          scope: target.scope,
        })
        return retired
          ? { retired: true, id: target.id, text: target.text }
          : { retired: false, id: target.id, text: target.text, error: 'the log refused the supersede record' }
      },
    }))

    toolCtx.tools.register(defineTool({
      name: 'memory_conflicts',
      description: 'List unresolved disagreements in the stored memories: two active records about the same subject that do not say the same thing. Surface them before relying on either side; resolve by retiring the wrong one with memory_forget.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            count: { type: 'integer', required: true, description: 'How many subjects disagree.' },
            subjects: { type: 'array', required: true, items: { type: 'string' }, description: 'The subjects in dispute.' },
          },
        },
        render: (_args, value) => [
          {
            type: 'text',
            text:
              value.count === 0 || !value.subjects
                ? 'No unresolved conflicts.'
                : `${value.count} subject(s) have disagreeing records:\n${value.subjects.map((s) => `  - ${s}`).join('\n')}`,
          },
        ],
      },
      async execute(_args, exec) {
        const memory = await options.resolve(exec.agent, exec.signal)
        const conflicts = memory.conflicts()
        return { count: conflicts.length, subjects: conflicts.map((conflict) => conflict.subject) }
      },
    }))

    toolCtx.tools.register(defineTool({
      name: 'memory_stats',
      description: 'Report the size and health of this project memory log: how many memories are active, retired, contradicted, or uncheckable, and where the log lives. Use it to answer what the agent already knows without loading every memory.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', required: true, description: 'The project log this answer describes.' },
            active: { type: 'integer', required: true, description: 'Live memories.' },
            retired: { type: 'integer', required: true, description: 'Superseded memories kept as history.' },
            contradicted: { type: 'integer', required: true, description: 'Memories a check denied.' },
            uncheckable: { type: 'integer', required: true, description: 'Memories with no compilable check.' },
            conflicts: { type: 'integer', required: true, description: 'Subjects with disagreeing records.' },
          },
        },
        render: (_args, value) => [
          {
            type: 'text',
            text: [
              `log: ${value.path}`,
              `active ${value.active}, retired ${value.retired}, contradicted ${value.contradicted}, uncheckable ${value.uncheckable}, conflicts ${value.conflicts}`,
            ].join('\n'),
          },
        ],
      },
      async execute(_args, exec) {
        const memory = await options.resolve(exec.agent, exec.signal)
        const allMemories = memory.all()
        const activeMemories = memory.active()
        const contradicted = memory.contradicted()
        return {
          path: memory.locations.project,
          active: memory.guidance().length,
          retired: allMemories.filter((item) => item.status === 'superseded').length,
          contradicted: contradicted.length,
          uncheckable: activeMemories.filter((item) => item.guard === undefined).length,
          conflicts: memory.conflicts().length,
        }
      },
    }))
  })

}
