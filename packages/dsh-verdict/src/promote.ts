/**
 * Promotion: give a rule a written home.
 *
 * A rule that only lives in the ledger is a note. Promotion writes it into the project
 * agent file (`AGENTS.md`) behind an invisible marker carrying its id, which turns "this
 * rule is in effect" from a claim into something checkable: the verifier re-reads the
 * file and looks for the marker.
 *
 * Two rules govern what may be promoted:
 *
 * - **no guard, no promotion.** A promoted rule without an executable form would appear
 *   in the agent file as if it were being enforced while nothing ever runs. That is the
 *   exact failure this plugin exists to eliminate, so promotion refuses rather than
 *   writes and reports success.
 * - **idempotent.** Re-promoting an existing rule rewrites its block in place instead of
 *   appending a second copy, so repeated promotion cannot inflate the file.
 *
 * @module verdict/promote
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { hasRunnableGuard } from './guard.js'
import type { Rule } from './types.js'

/** Marker namespace. Stable: changing it would orphan every already-promoted rule. */
export const MARKER_PREFIX = '<!-- verdict:'
export const MARKER_SUFFIX = ' -->'

/** Default project agent file the rule is written into. */
export const AGENT_FILE = 'AGENTS.md'

/** Build the marker line that opens and closes a promoted rule's block. */
export function marker(id: string): string {
  return `${MARKER_PREFIX}${id}${MARKER_SUFFIX}`
}

/** Render the block written into the agent file for one rule. */
function renderBlock(rule: Rule, guard: NonNullable<Rule['guard']>): string {
  return [marker(rule.id), `- ${rule.text}`, `  - guard: \`${guard.command}\``, marker(rule.id)].join('\n')
}

/**
 * Everything promotion needs to know before it touches a file.
 */
export interface PromotionPlan {
  /** Absolute or relative path of the agent file. */
  path: string
  /** File contents after the rule's block is present. */
  next: string
  /** Whether the block already existed and is being rewritten. */
  rewritten: boolean
}

/**
 * Compute the agent file contents for a promotion without writing.
 *
 * Separated from the write so the outcome is inspectable and testable without touching
 * a filesystem, and so the write itself is a single obvious step.
 */
export function planPromotion(agentFileContents: string | null, rule: Rule): PromotionPlan | { error: string } {
  const guard = rule.guard
  if (!hasRunnableGuard(guard)) {
    return { error: `rule ${rule.id} has no runnable guard; refusing to promote an unverifiable rule` }
  }

  const base = agentFileContents ?? ''
  const open = marker(rule.id)
  const block = renderBlock(rule, guard)
  const start = base.indexOf(open)

  if (start === -1) {
    const separator = base.length === 0 || base.endsWith('\n\n') ? '' : base.endsWith('\n') ? '\n' : '\n\n'
    return { path: AGENT_FILE, next: `${base}${separator}${block}\n`, rewritten: false }
  }

  const end = base.indexOf(open, start + open.length)
  if (end === -1) {
    // Opening marker with no closer: the file was edited by hand. Replace the remainder
    // from the opener rather than guessing where the block should have ended.
    return { path: AGENT_FILE, next: `${base.slice(0, start)}${block}\n`, rewritten: true }
  }

  const after = base.indexOf('\n', end + open.length)
  const tail = after === -1 ? '' : base.slice(after + 1)
  return { path: AGENT_FILE, next: `${base.slice(0, start)}${block}\n${tail}`, rewritten: true }
}

/**
 * Write the rule into the project agent file and return the path it landed in.
 *
 * @param root - project root; the agent file is written here.
 * @param rule - the rule to promote. Must already carry a runnable guard.
 */
export function promote(root: string, rule: Rule, now = new Date()): { home: string; rewritten: boolean } {
  const filePath = join(root, AGENT_FILE)
  const current = existsSync(filePath) ? readFileSync(filePath, 'utf8') : null
  const plan = planPromotion(current, rule)
  if ('error' in plan) throw new Error(plan.error)

  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, plan.next, 'utf8')
  rule.home = AGENT_FILE
  rule.state = 'promoted'
  rule.promotedAt = now.toISOString()
  return { home: AGENT_FILE, rewritten: plan.rewritten }
}

/**
 * Verify a promoted rule's home: the marker is really in the file, in the project.
 *
 * This is the checkable half of "a written home". A rule whose marker is gone — file
 * deleted, block removed by hand, project switched — is reported as unhomed rather than
 * assumed in force.
 */
export function verifyHome(root: string, rule: Rule): boolean {
  if (!rule.home) return false
  const filePath = join(root, rule.home)
  if (!existsSync(filePath)) return false
  const contents = readFileSync(filePath, 'utf8')
  const open = marker(rule.id)
  const start = contents.indexOf(open)
  if (start === -1) return false
  return contents.indexOf(open, start + open.length) !== -1
}
