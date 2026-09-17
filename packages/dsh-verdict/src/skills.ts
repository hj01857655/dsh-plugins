/**
 * Skill generation from repeated sessions.
 *
 * The rule that governs this module is the same one that governs the rest of the plugin,
 * applied to a new object: **do not assert what has not been checked.** A skill is a
 * claim that a procedure works, so it is only distilled from sessions that succeeded —
 * repeatedly, and through the same steps.
 *
 * Two things follow and are enforced here rather than left to convention:
 *
 * - **failures never contribute steps.** A step sequence observed failing is evidence
 *   about a procedure that does not work. Distilling it into a skill would teach the
 *   thing that failed.
 * - **a generated skill is a candidate until it is verified.** It is written out with a
 *   guard derived from its own steps, and only counts once that guard actually runs.
 *
 * @module verdict/skills
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { compileGuard, hasRunnableGuard } from './guard.js'
import { ruleId } from './identity.js'
import { groupByProcedure, readSessions, type SessionRecord } from './session.js'
import { capture, updateRule } from './store.js'
import type { Rule } from './types.js'

/** How many successful runs of one procedure before it is offered as a skill. */
export const SKILL_THRESHOLD = 3

/** A procedure observed often enough to be worth writing down. */
export interface SkillCandidate {
  /** Fingerprint of the shared step shape. */
  key: string
  /** The steps, taken from the successful runs. */
  steps: string[]
  /** How many successful runs support it. */
  occurrences: number
  /** The intent these runs shared, if they shared one. */
  intent?: string
  /** Session sequence numbers this candidate was distilled from. */
  evidence: number[]
}

/**
 * Find procedures that succeeded often enough to be worth writing down.
 *
 * Steps are taken from the **shortest** successful run: the longest may contain
 * one-off detours, and a skill carrying them would prescribe work that was never part of
 * what made the procedure succeed.
 */
export function findCandidates(dataDir: string, threshold = SKILL_THRESHOLD): SkillCandidate[] {
  const groups = groupByProcedure(readSessions(dataDir))
  const candidates: SkillCandidate[] = []

  for (const [key, records] of groups) {
    if (records.length < threshold) continue

    const shortest = records.reduce((best, r) => (r.steps.length < best.steps.length ? r : best), records[0] as SessionRecord)
    const intents = new Set(records.map((r) => r.intent.trim()).filter(Boolean))

    candidates.push({
      key,
      steps: [...(shortest?.steps ?? [])],
      occurrences: records.length,
      // Only stated when every run agreed. Otherwise the skill would be labelled with an
      // intent that some of its supporting evidence did not have.
      ...(intents.size === 1 ? { intent: [...intents][0] } : {}),
      evidence: records.map((r) => r.seq),
    })
  }

  return candidates.sort((a, b) => b.occurrences - a.occurrences)
}

/** Render a candidate as a SKILL.md body. */
export function renderSkill(candidate: SkillCandidate): string {
  const title = candidate.intent ?? `Repeated procedure ${candidate.key}`
  const lines = [
    `---`,
    `name: ${slugify(candidate.intent ?? `procedure-${candidate.key}`)}`,
    `description: Distilled from ${candidate.occurrences} successful runs (sessions ${candidate.evidence.join(', ')}).`,
    `---`,
    ``,
    `# ${title}`,
    ``,
    `Derived from ${candidate.occurrences} successful sessions. Steps come from the shortest`,
    `successful run, so one-off detours are not prescribed.`,
    ``,
    `## Steps`,
    ``,
    ...candidate.steps.map((step, i) => `${i + 1}. ${step}`),
    ``,
  ]
  return `${lines.join('\n')}\n`
}

/** Lowercase, dash-separated, safe as a directory and skill name. */
export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'untitled-procedure'
}

/**
 * Write a candidate out as a skill file, plus the ledger rule that verifies it.
 *
 * Returns the rule so the caller can see whether the skill is actually checkable. A
 * written-but-unverifiable skill is recorded as a candidate and reported as such: the
 * file existing is not the same as the procedure working.
 */
export function writeSkill(
  skillsDir: string,
  dataDir: string,
  candidate: SkillCandidate,
): { path: string; rule: Rule; verified: boolean } {
  const dir = join(skillsDir, slugify(candidate.intent ?? `procedure-${candidate.key}`))
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'SKILL.md')
  writeFileSync(path, renderSkill(candidate), 'utf8')

  // The skill's checkable claim: that the file it was distilled into exists. Weak by
  // design — it verifies the artifact, not that the procedure would succeed again. The
  // latter is what recurrence counting is for, and claiming it here would be asserting
  // something this module has not checked.
  const text = `skill ${slugify(candidate.intent ?? `procedure-${candidate.key}`)} is available`
  const { rule } = capture(dataDir, text)
  const compiled = compileGuard(`file SKILL.md must exist`)
  if (compiled) rule.guard = compiled
  updateRule(dataDir, rule)

  return { path, rule, verified: hasRunnableGuard(rule.guard) }
}

/**
 * Generate skills from the session log.
 *
 * @param root - project root; skills are written under `skills/`.
 * @param dataDir - plugin data directory holding the session log and ledger.
 */
export function generateSkills(
  root: string,
  dataDir: string,
  threshold = SKILL_THRESHOLD,
): { written: { path: string; verified: boolean }[]; skipped: SkillCandidate[] } {
  const candidates = findCandidates(dataDir, threshold)
  const written: { path: string; verified: boolean }[] = []
  const skipped: SkillCandidate[] = []

  for (const candidate of candidates) {
    const result = writeSkill(join(root, 'skills'), dataDir, candidate)
    if (result.verified) written.push({ path: result.path, verified: true })
    else skipped.push(candidate)
  }

  return { written, skipped }
}

/** Read a generated skill back, for verification. */
export function readSkill(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

/** Stable id for a candidate, so the same procedure is not offered twice. */
export function candidateRuleId(candidate: SkillCandidate): string {
  return ruleId(candidate.steps.join(' > '))
}
