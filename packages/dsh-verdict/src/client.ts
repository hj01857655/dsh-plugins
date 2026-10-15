/**
 * Client half: the view model behind the panel.
 *
 * Everything here is a pure function over what is already on disk. That is deliberate:
 * the panel shows the state of the project, so it must be recomputable from the project
 * at any moment rather than maintained as parallel state that can drift.
 *
 * The one thing this module insists on is the before/after comparison. "Did this change
 * help?" is the question the whole plugin exists to answer, and it is only answerable
 * from two snapshots — so a comparison where either side is missing is reported as
 * insufficient rather than rendered as an improvement.
 *
 * @module verdict/client
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { check } from './check.js'
import { verifyHome } from './promote.js'
import { readSessions } from './session.js'
import { findCandidates } from './skills.js'
import { listRules } from './store.js'
import type { CheckReport, Rule } from './types.js'

/** Everything the panel renders, recomputed on demand. */
export interface PanelState {
  /** Rules grouped by lifecycle state. */
  rules: Rule[]
  /** Counts per state, for the header. */
  counts: Record<Rule['state'], number>
  /** Rules whose guard ran and failed. */
  violated: string[]
  /** Rules whose guard could not run — reported separately, never as failures. */
  broken: string[]
  /** Rules promoted but whose home no longer holds the marker. */
  unhomed: string[]
  /** Sessions recorded, and how many are candidates for becoming skills. */
  sessions: { total: number; skillCandidates: number }
}

/** Build the panel's view of the project. */
export function panelState(root: string, dataDir: string): PanelState {
  // Checking may demote a rule; counts and rows must reflect that same pass.
  const report = check(dataDir, root)
  const rules = listRules(dataDir)
  const counts: Record<Rule['state'], number> = { candidate: 0, promoted: 0, ineffective: 0 }
  for (const rule of rules) counts[rule.state] += 1
  const unhomed = rules
    .filter((rule) => rule.state !== 'candidate' && !verifyHome(root, rule))
    .map((rule) => rule.id)

  return {
    rules,
    counts,
    violated: report.violated,
    broken: report.broken,
    unhomed,
    sessions: { total: readSessions(dataDir).length, skillCandidates: findCandidates(dataDir).length },
  }
}

/**
 * One rule's row in the panel, including whether its claim is currently holding.
 *
 * `verified` means the guard ran and passed. It is distinct from `state === 'promoted'`:
 * a promoted rule whose guard is currently failing is still promoted, and showing it as
 * if it were fine would be exactly the assertion this plugin refuses to make.
 */
export interface RuleRow {
  id: string
  text: string
  state: Rule['state']
  /** Whether the guard ran and passed on the last check. */
  verified: boolean
  /** Whether the guard could not run at all. */
  broken: boolean
  /** Whether the rule's home still holds its marker. */
  homed: boolean
  recurrences: number
  /** Set while a violation episode is open. */
  openSince?: string
  guard?: string
}

/** Rows for the panel, from a fresh check. */
export function ruleRows(root: string, dataDir: string): { rows: RuleRow[]; report: CheckReport } {
  const report = check(dataDir, root)
  const byOutcome = new Map(report.runs.map((run) => [run.ruleId, run]))

  const rows = listRules(dataDir).map((rule): RuleRow => {
    const run = byOutcome.get(rule.id)
    const broken = report.broken.includes(rule.id)
    return {
      id: rule.id,
      text: rule.text,
      state: rule.state,
      verified: run?.outcome === 'passed',
      broken,
      homed: rule.state !== 'candidate' && verifyHome(root, rule),
      recurrences: rule.recurrences,
      ...(rule.openViolation ? { openSince: rule.openViolation.since } : {}),
      ...(rule.guard ? { guard: rule.guard.command } : {}),
    }
  })

  return { rows, report }
}

/**
 * A snapshot used for before/after comparison.
 *
 * Taken before and after a change to rules, skills, models or plugins. It records what
 * was actually observed, not what was intended — a comparison built from intentions
 * would always show improvement.
 */
export interface Snapshot {
  label: string
  at: string
  passed: string[]
  violated: string[]
  broken: string[]
  exitCode: number
}

/** Take a snapshot by running the checks now. */
export function snapshot(label: string, root: string, dataDir: string): Snapshot {
  const report = check(dataDir, root)
  return {
    label,
    at: new Date().toISOString(),
    passed: report.passed,
    violated: report.violated,
    broken: report.broken,
    exitCode: report.exitCode,
  }
}

/**
 * Persist a snapshot under `before` or `after`.
 *
 * Two slots rather than an unbounded history: the comparison is always between the state
 * immediately preceding a change and the state after it. Keeping more would invite
 * comparing across unrelated changes, which answers nothing.
 */
export function saveSnapshot(dataDir: string, slot: 'before' | 'after', snap: Snapshot): void {
  const dir = join(dataDir, 'snapshots')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${slot}.json`), `${JSON.stringify(snap, null, 2)}\n`, 'utf8')
}

/** Read a snapshot slot back. Absent when that side was never taken. */
export function readSnapshot(dataDir: string, slot: 'before' | 'after'): Snapshot | null {
  const path = join(dataDir, 'snapshots', `${slot}.json`)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Snapshot
  } catch {
    // A snapshot that cannot be read is treated as absent rather than guessed at: a
    // comparison needs both real sides, and inventing one would fabricate a verdict.
    return null
  }
}

/**
 * Compare two snapshots.
 *
 * `improved` and `regressed` are derived from rule ids alone. Broken guards are excluded
 * from both verdicts: a guard that started or stopped being runnable is a change in the
 * checks, not in the project, and counting it either way would turn a typo into evidence
 * about the rules.
 */
export interface Comparison {
  improved: string[]
  regressed: string[]
  /** Rules whose guard changed runnability — reported, never counted as a verdict. */
  guardChanges: string[]
  /** True when both sides exist and the comparison is meaningful. */
  sufficient: boolean
  /** Why the comparison is not meaningful, when it is not. */
  reason?: string
}

export function compare(before: Snapshot | null, after: Snapshot | null): Comparison {
  if (!before || !after) {
    return {
      improved: [],
      regressed: [],
      guardChanges: [],
      sufficient: false,
      reason: 'two snapshots are required: one taken before the change and one after',
    }
  }

  const beforePassed = new Set(before.passed)
  const afterPassed = new Set(after.passed)

  const beforeBroken = new Set(before.broken)
  const afterBroken = new Set(after.broken)

  return {
    // Absence or a broken check is not proof of recovery or regression.
    improved: before.violated.filter((id) => afterPassed.has(id) && !beforeBroken.has(id) && !afterBroken.has(id)),
    regressed: after.violated.filter((id) => beforePassed.has(id) && !beforeBroken.has(id) && !afterBroken.has(id)),
    guardChanges: [
      ...after.broken.filter((id) => !beforeBroken.has(id)).map((id) => `${id}: guard stopped running`),
      ...before.broken.filter((id) => !afterBroken.has(id)).map((id) => `${id}: guard became runnable`),
    ],
    sufficient: true,
  }
}
