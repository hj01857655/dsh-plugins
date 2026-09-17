/**
 * Shared shapes for the verdict ledger.
 *
 * The invariants these types encode are the ones the rest of the plugin is not allowed
 * to violate:
 *
 * - a rule's `id` is derived from its text, never assigned, so the same lesson observed
 *   twice collapses into one rule instead of accumulating near-duplicates;
 * - `guard` is optional on a rule but mandatory for anything that reaches `promoted`,
 *   because a promoted rule without an executable form is exactly the claim this plugin
 *   exists to stop making;
 * - `openViolation` is the unit of recurrence, not a run: a rule that stays broken is
 *   one regression, however many times the checker passes over it.
 *
 * @module verdict/types
 */

/** Where a rule is in its lifecycle. */
export type RuleState =
  /** Observed at least once; not yet written into the project agent file. */
  | 'candidate'
  /** Written into the agent file behind a marker and carrying a runnable guard. */
  | 'promoted'
  /** Promoted, then observed violated repeatedly — the guard works, the rule does not. */
  | 'ineffective'

/**
 * An executable predicate for a rule.
 *
 * `source` records how the command came to exist. It matters when reporting: a
 * template-derived guard that cannot run is a gap in the compiler, while an
 * author-supplied guard that cannot run is a typo by whoever wrote the rule. Both are
 * reported as broken rather than violated, but they do not have the same fix.
 */
export interface Guard {
  /** Shell command that exits 0 when the rule holds, non-zero when it does not. */
  command: string
  /** How the command was produced. */
  source: 'template' | 'explicit'
}

/** An unclosed violation episode. Its presence means "currently failing". */
export interface OpenViolation {
  /** ISO timestamp of the first run that saw this episode. */
  since: string
  /** Number of runs that have observed this same episode, for reporting only. */
  observations: number
}

/** A lesson the plugin has captured, and everything it knows about whether it holds. */
export interface Rule {
  /** Stable id derived from the rule text. Never hand-assigned. */
  id: string
  /** The rule, in the form a human would read it. */
  text: string
  /** Lifecycle position. */
  state: RuleState
  /** ISO timestamp of first observation. */
  createdAt: string
  /** ISO timestamp of promotion into the agent file. Absent until promoted. */
  promotedAt?: string
  /** Executable form. Present for every promoted rule. */
  guard?: Guard
  /**
   * Path of the project agent file the rule was written into, relative to the ledger
   * root. Absent until promoted; checked on verification so a rule whose home was
   * deleted is reported rather than silently assumed present.
   */
  home?: string
  /** Distinct violation episodes, not runs. Drives demotion to `ineffective`. */
  recurrences: number
  /** Set while the guard is currently failing; cleared when it passes again. */
  openViolation?: OpenViolation
}

/** Persisted ledger: the durable store the plugin recalls from across sessions. */
export interface Ledger {
  /** Schema tag, so an on-disk ledger written by a future version is not misread. */
  version: 1
  /** Rules by id. */
  rules: Record<string, Rule>
}

/** Outcome of running one rule's guard. */
export type GuardOutcome =
  /** Guard ran and exited 0 — the rule holds. */
  | 'passed'
  /** Guard ran and exited non-zero — a real violation. */
  | 'violated'
  /** Guard could not be run at all — not evidence about the rule. */
  | 'broken'

/** One guard execution. */
export interface GuardRun {
  /** The rule this run belongs to. */
  ruleId: string
  /** What the run showed. */
  outcome: GuardOutcome
  /** Raw exit code, or null when the process could not be spawned. */
  exitCode: number | null
  /** Truncated combined output, for the report. Never used for classification. */
  output: string
  /** ISO timestamp of the run. */
  at: string
}

/** Aggregate result of one verification pass over every promoted rule. */
export interface CheckReport {
  /** Every run performed, in rule order. */
  runs: GuardRun[]
  /** Rules that hold. */
  passed: string[]
  /** Rules whose guard ran and failed — real regressions. */
  violated: string[]
  /** Rules whose guard could not run — reported, never counted as regressions. */
  broken: string[]
  /** Rules demoted to `ineffective` by this pass. */
  demoted: string[]
  /**
   * Process exit code the caller should use: non-zero only for real violations.
   * Broken guards are excluded on purpose — a typo in a guard must not be able to turn
   * a pipeline red, or the check stops being trustworthy.
   */
  exitCode: number
}
