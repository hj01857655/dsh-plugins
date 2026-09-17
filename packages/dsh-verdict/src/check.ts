/**
 * Verification pass.
 *
 * Runs every promoted rule's guard and folds the outcome back into the ledger. The rule
 * this module exists to enforce:
 *
 * **recurrence counts violation episodes, not runs.**
 *
 * Counting runs would mean a rule violated for a week accumulates a count per check and
 * races past the ineffectiveness threshold, while a rule violated briefly but often
 * looks calmer than it is. So an already-open violation adds an observation to itself and
 * nothing else; only closing one and opening another increments `recurrences`.
 *
 * Broken guards are passed over entirely: they do not open violations, do not increment
 * recurrence, and do not make the exit code non-zero.
 *
 * @module verdict/check
 */

import { runGuard } from './guard.js'
import { verifyHome } from './promote.js'
import { listRules, updateRule } from './store.js'
import type { CheckReport, GuardRun, Rule } from './types.js'

/** How many distinct violation episodes demote a rule to ineffective. */
export const INEFFECTIVE_THRESHOLD = 3

/**
 * Fold one run's outcome into the rule's history. Mutates and returns the rule.
 *
 * Extracted from {@link check} so the state machine is readable on its own, and so the
 * tests can drive it directly instead of through the filesystem.
 */
export function foldOutcome(rule: Rule, run: GuardRun, now = new Date()): Rule {
  if (run.outcome === 'broken') return rule

  if (run.outcome === 'passed') {
    // A violation that has cleared closes the episode. Past recurrences stay on the
    // record: a rule that has failed twice and now passes is not the same as one that
    // has never failed.
    delete rule.openViolation
    return rule
  }

  if (rule.openViolation) {
    // Same episode still open — observe it, do not count it again.
    rule.openViolation = {
      since: rule.openViolation.since,
      observations: rule.openViolation.observations + 1,
    }
    return rule
  }

  rule.openViolation = { since: now.toISOString(), observations: 1 }
  rule.recurrences += 1
  if (rule.recurrences >= INEFFECTIVE_THRESHOLD) rule.state = 'ineffective'
  return rule
}

/**
 * Run every promoted rule's guard and persist the outcome.
 *
 * @param root - plugin data directory holding the ledger.
 * @param cwd - project directory the guards run in.
 * @returns an aggregate report; its `exitCode` is non-zero only for real violations.
 */
export function check(root: string, cwd = root, now = new Date()): CheckReport {
  const rules = listRules(root)
  const report: CheckReport = { runs: [], passed: [], violated: [], broken: [], demoted: [], exitCode: 0 }

  for (const rule of rules) {
    if (rule.state === 'candidate') continue

    // A promoted rule whose home no longer holds the marker cannot be trusted to be in
    // force. Report it alongside broken guards rather than running its predicate, which
    // would otherwise produce a "passing" verdict about a rule nobody is reading.
    if (!verifyHome(cwd, rule)) {
      report.broken.push(rule.id)
      continue
    }

    if (!rule.guard) {
      report.broken.push(rule.id)
      continue
    }

    const run = runGuard(rule.id, rule.guard, cwd, now)
    report.runs.push(run)

    if (run.outcome === 'broken') {
      report.broken.push(rule.id)
      continue
    }

    const before = rule.recurrences
    const next = foldOutcome(rule, run, now)
    updateRule(root, next)

    if (run.outcome === 'passed') {
      report.passed.push(rule.id)
    } else {
      report.violated.push(rule.id)
      if (next.recurrences > before && next.recurrences >= INEFFECTIVE_THRESHOLD) {
        report.demoted.push(rule.id)
      }
    }
  }

  // Real regressions only. A broken guard must never turn a pipeline red — otherwise a
  // typo in a guard both hides the rule's true state and blocks builds for a reason no
  // rule actually deserves.
  report.exitCode = report.violated.length > 0 ? 1 : 0
  return report
}
