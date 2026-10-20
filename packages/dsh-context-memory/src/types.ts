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

/**
 * Where the memory lives.
 *
 * `project` is a convention of one checkout; `user` is a working preference that holds
 * everywhere. The distinction is scope, not importance — both are equally worth
 * recalling, but they belong to different populations and must not leak into each other.
 */
export type MemoryScope = 'project' | 'user'

/** A memory is active until something explicitly supersedes it. */
export type MemoryStatus = 'active' | 'superseded'

/**
 * Which populations a search may draw from.
 *
 * `guidance` is the only one the push path may use: active and not contradicted. The
 * others exist for questions that are *about* the log rather than for guidance —
 * "what did we decide before", "what did the check disprove" — which only a reader who
 * asked for them by name should receive.
 */
export type MemoryTarget = 'guidance' | 'contradicted' | 'superseded' | 'all'

/** The same three-outcome model dsh-verdict uses: inability to check is not failure. */
export type GuardOutcome = 'passed' | 'violated' | 'broken'

/**
 * An executable check compiled from a memory statement.
 *
 * A check names one predicate and its operands — never a program. That is what keeps
 * memory text from becoming something to execute: the statement contributes paths,
 * keys, and search strings, and the evaluation is `fs` plus `JSON.parse`, not a shell.
 *
 * The `kind` discriminates the predicate. Check `kind` before reading an operand: the
 * operands each kind needs differ, so a field that exists on one is absent on another.
 *
 * The file predicates (`exists` / `absent` / `contains` / `lacks`) answer "is this text in
 * this file". The structured predicates (`depends` / `script` / `option` / `lineLimit`)
 * answer questions about a *parsed* file, which is a different thing: `contains` would say
 * `"yarn"` is in `package.json` because the word appears in a comment, a description, or
 * inside some other key. Parsing is still in-process and still has no program in it.
 */
export type Guard =
  | { kind: 'exists'; path: string; source: 'template' }
  | { kind: 'absent'; path: string; source: 'template' }
  | { kind: 'contains'; path: string; needle: string; source: 'template' }
  | { kind: 'lacks'; path: string; needle: string; source: 'template' }
  /**
   * `package.json` declares `name` in any of `dependencies` / `devDependencies` /
   * `peerDependencies` / `optionalDependencies`. All four count: a memory saying "we use
   * X" is not wrong because X arrived as a peer.
   */
  | { kind: 'depends'; name: string; source: 'template'; absent?: false }
  /** `package.json` declares no such dependency. */
  | { kind: 'depends'; name: string; source: 'template'; absent: true }
  /** `package.json` has a `scripts` entry `name`, and `cmd` (when given) is its value. */
  | { kind: 'script'; name: string; cmd?: string; source: 'template'; absent?: false }
  /** `package.json` has no such script. */
  | { kind: 'script'; name: string; source: 'template'; absent: true }
  /**
   * A JSON config file sets `option`, and `value` (when given) is what it is set to.
   *
   * `value: true` plus `absent: true` is the negation of "the option is on" — it is
   * satisfied by the key being absent *and* by it being explicitly `false`, because
   * "strict is not enabled" is true in both cases.
   */
  | { kind: 'option'; path: string; option: string; value?: boolean; source: 'template'; absent?: false }
  /** The same config option is not set to `value` (or is not set at all). */
  | { kind: 'option'; path: string; option: string; value?: boolean; source: 'template'; absent: true }
  /** The file has at most `max` lines, or at least `min`. */
  | { kind: 'lineLimit'; path: string; max?: number; min?: number; source: 'template' }

/** The predicates above, as a value to switch on. */
export type GuardKind = Guard['kind']

/** The immutable payload recorded by a `remember` event. */
export interface Memory {
  id: string
  /** Normalised key a conflict is decided on; visible everywhere it is used. */
  subject: string
  text: string
  kind: MemoryKind
  source: MemorySource
  /**
   * Which log this memory was written to.
   *
   * Absent in logs written before 0.9.0, which were project-only by construction; the
   * fold reads a missing scope as `project`, since that is what those logs meant.
   */
  scope?: MemoryScope
  createdAt: number
  sessionId?: string
  step?: number
  guard?: Guard
}

/** A memory folded together with every later event about it. */
export interface MemoryState extends Memory {
  /** Always known here: the fold derives it from the log the memory was read out of. */
  scope: MemoryScope
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

/** A statement the capture heuristics noticed but did not have permission to keep. */
export interface Candidate {
  id: string
  text: string
  kind: MemoryKind
  proposedAt: number
  sessionId?: string
}

/**
 * Where a candidate stands.
 *
 * `dismissed` is kept rather than deleted: the question was asked and answered, and a
 * queue that forgets the answer asks it again on the next step.
 */
export type CandidateStatus = 'pending' | 'accepted' | 'dismissed'

export interface CandidateState extends Candidate {
  status: CandidateStatus
}

/** The candidate log, folded the same way the memory log is. */
export type CandidateEvent =
  | { type: 'propose'; at: number; candidate: Candidate }
  | { type: 'decide'; at: number; id: string; status: Exclude<CandidateStatus, 'pending'> }

/** One verification result per memory that was considered. */
export interface VerifyResult {
  id: string
  text: string
  /**
   * The check that produced this outcome, when there was one.
   *
   * Reported rather than left to the caller to look up: `verify` already holds the guard
   * it just ran, and a caller that wanted to describe the outcome would otherwise fold
   * the whole log once per result to fetch what it was already handed.
   */
  guard?: Guard
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
  /**
   * Active memories a check contradicted.
   *
   * Listed apart from `active` because they are a different kind of statement: still
   * recorded, still visible, but no longer offered as guidance. The panel must show them
   * — a memory the world disproved is the most informative record in the log — while the
   * injection path must not.
   */
  contradicted: MemoryState[]
  conflicts: Conflict[]
  /**
   * Statements the capture heuristics noticed but did not have permission to keep.
   *
   * In the panel payload rather than folded into `active`, because they are a question
   * for the user, not a memory: a candidate has no scope, no guard, and no claim on
   * recall until someone accepts it.
   */
  candidates: CandidateState[]
  totals: {
    active: number
    superseded: number
    contradicted: number
    withGuard: number
    verified: number
    unverified: number
    candidates: number
  }
}
