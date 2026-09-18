/**
 * Types for dsh-context-memory.
 *
 * The split between `Memory` (what was recorded) and `MemoryState` (what is currently
 * true of it) mirrors the store: `Memory` is the immutable payload of a `remember`
 * event, `MemoryState` is that payload folded together with every later event about it.
 * Nothing in this plugin mutates a recorded memory — a memory stops being active
 * because a later event says so, never because a field was overwritten.
 *
 * @module context-memory/types
 */

/** What kind of thing is being remembered. Affects presentation, not verification. */
export type MemoryKind = 'fact' | 'decision' | 'preference' | 'pitfall'

/** Who wrote the memory. Provenance, so "why does the agent think it knows this" has an answer. */
export type MemorySource = 'user' | 'agent' | 'plugin'

/** A memory is active until something explicitly supersedes it. */
export type MemoryStatus = 'active' | 'superseded'

/** The same three-outcome model dsh-verdict uses: inability to check is not failure. */
export type GuardOutcome = 'passed' | 'violated' | 'broken'

/** An executable check compiled from a memory statement. */
export interface Guard {
  command: string
  source: 'template'
}

/** The immutable payload recorded by a `remember` event. */
export interface Memory {
  id: string
  /** Normalised key a conflict is decided on; visible everywhere it is used. */
  subject: string
  text: string
  kind: MemoryKind
  source: MemorySource
  createdAt: number
  sessionId?: string
  step?: number
  guard?: Guard
}

/** A memory folded together with every later event about it. */
export interface MemoryState extends Memory {
  status: MemoryStatus
  supersededReason?: string
  supersededBy?: string
  verification?: {
    at: number
    outcome: GuardOutcome
    exitCode: number | null
    output: string
  }
}

/**
 * The append-only record. Every question the panel answers is derived by folding these,
 * so "what happened" is never decided by whoever last held the file.
 */
export type MemoryEvent =
  | { type: 'remember'; at: number; memory: Memory }
  | { type: 'supersede'; at: number; id: string; reason: string; replacedBy?: string }
  | { type: 'verify'; at: number; id: string; outcome: GuardOutcome; exitCode: number | null; output: string }

/** One recall result, with the evidence for why it ranked where it did. */
export interface RecallHit {
  memory: MemoryState
  score: number
  /** Query tokens this memory actually contains. */
  matched: string[]
  /** Human-readable breakdown of the score, so a ranking is never unexplainable. */
  why: string
}

/** Two or more active memories sharing a subject but disagreeing about it. */
export interface Conflict {
  subject: string
  memories: MemoryState[]
}

/** One verification result per memory that was considered. */
export interface VerifyResult {
  id: string
  text: string
  /** `uncheckable` means no guard could be compiled — not that the memory is wrong. */
  outcome: GuardOutcome | 'uncheckable'
  exitCode: number | null
  output: string
}

export interface VerifySummary {
  passed: number
  violated: number
  broken: number
  uncheckable: number
  results: VerifyResult[]
}

/** Everything the panel needs, recomputed from the log on each read. */
export interface PanelPayload {
  active: MemoryState[]
  superseded: MemoryState[]
  conflicts: Conflict[]
  totals: {
    active: number
    superseded: number
    withGuard: number
    verified: number
    unverified: number
  }
}
