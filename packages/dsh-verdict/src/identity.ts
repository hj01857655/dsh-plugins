/**
 * Rule identity.
 *
 * Captured lessons arrive as free text, often reworded slightly. If identity came from
 * anything incidental — arrival order, timestamp, an incrementing counter — the same
 * lesson would appear several times and each copy would carry its own recurrence count,
 * so none of them would ever accumulate enough history to act on.
 *
 * Deriving the id from the normalised text is what makes "this is the same problem
 * again" decidable: collapse whitespace, drop trailing punctuation, casefold, hash.
 *
 * @module verdict/identity
 */

import { createHash } from 'node:crypto'

/**
 * Reduce text to the part that determines identity.
 *
 * Case, runs of whitespace, surrounding punctuation and surrounding quotes are all
 * noise for this purpose: "Run tests before commit." and "run tests before commit" are
 * the same rule.
 */
export function normalizeRuleText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').replace(/[.!?。！？]+$/u, '').toLowerCase()
}

/**
 * Stable id for a rule, derived from its text.
 *
 * Truncated to 12 hex characters: long enough that accidental collisions are not a
 * practical concern for a per-project ledger, short enough to stay readable in logs and
 * in the marker written into the agent file.
 */
export function ruleId(text: string): string {
  return createHash('sha256').update(normalizeRuleText(text)).digest('hex').slice(0, 12)
}
