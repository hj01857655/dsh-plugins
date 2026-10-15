/**
 * The capture-to-promoted pipeline, wired.
 *
 * Kept separate from both the store and the Cordis entry so the interesting sequence —
 * capture, compile a guard, write it into the agent file — is readable in one place and
 * testable without constructing a Cordis context.
 *
 * @module verdict/pipeline
 */

import { compileGuard, hasRunnableGuard } from './guard.js'
import { promote } from './promote.js'
import { capture, updateRule } from './store.js'
import type { Rule } from './types.js'

/**
 * Compile or retrieve a rule's guard.
 *
 * An explicit guard supplied alongside the rule is preferred: text-derived guards are a
 * convenience for rules whose predicate is unambiguous, not a substitute for the author
 * stating what the check actually is.
 */
export function resolveGuard(rule: Rule, explicit?: string, platform: NodeJS.Platform = process.platform): Rule {
  const candidate = explicit?.trim()
  if (candidate) {
    rule.guard = { command: candidate, source: 'explicit' }
    return rule
  }
  const compiled = compileGuard(rule.text, platform)
  if (compiled) rule.guard = compiled
  return rule
}

/**
 * Capture a lesson and promote it if it can be verified.
 *
 * The result states plainly when promotion did not happen and why. A rule that stays a
 * candidate is a real outcome — it means the lesson was recorded but nothing is checking
 * it — and reporting anything softer would let unverifiable rules look enforced.
 *
 * @param root - project root; holds both the agent file and `.verdict/`.
 * @param dataDir - plugin data directory for the ledger.
 */
export function learn(
  root: string,
  dataDir: string,
  text: string,
  options: { guard?: string } = {},
  now = new Date(),
): { rule: Rule; promoted: boolean; reason?: string } {
  const { rule } = capture(dataDir, text, now)
  resolveGuard(rule, options.guard)

  if (!hasRunnableGuard(rule.guard)) {
    return { rule, promoted: false, reason: 'no checkable predicate could be compiled for this rule' }
  }

  const result = promote(root, rule, now)
  updateRule(dataDir, rule)
  return { rule, promoted: true, ...(result.rewritten ? { reason: 'rewritten' } : {}) }
}
