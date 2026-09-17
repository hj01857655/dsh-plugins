/**
 * Session records: evidence for what actually happened.
 *
 * The distinction this module exists to hold is the one the rest of the plugin rests on:
 * a session record is **evidence**, not memory. It is appended once, never rewritten,
 * and it does not claim to prove anything on its own — it is the raw material a later
 * skill is distilled from, and the counterexample consulted when checking whether a rule
 * still holds.
 *
 * @module verdict/session
 */

import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** One line of a JSONL session log. Appended, never rewritten. */
export interface SessionRecord {
  /** Monotonic id within the log file. */
  seq: number
  /** ISO timestamp. */
  at: string
  /** What triggered the session: which event, hook, or invocation. */
  trigger: string
  /** The task attempted, as stated at the time. */
  intent: string
  /** Whether the attempt succeeded, from the record's perspective. */
  outcome: 'success' | 'failure' | 'partial'
  /** Steps taken. Free-form, so a record can be written without modelling everything. */
  steps: string[]
  /** Ids of the rules the session touched, if any were concluded. */
  rules: string[]
}

/** What a caller supplies; `seq` and `at` are assigned by the log, not the caller. */
export type SessionInput = Omit<SessionRecord, 'seq' | 'at'>

/** The durable session log: append-only JSONL. */
export const SESSION_LOG = 'sessions.jsonl'

/**
 * Append one record.
 *
 * Append-only, and the reason matters: if past records could be revised, a later dispute
 * about what happened would be settled by whoever holds the file last. Newline-delimited
 * rather than a single JSON array so a partial write cannot corrupt records already there.
 */
export function recordSession(dataDir: string, input: SessionInput): SessionRecord {
  const path = join(dataDir, SESSION_LOG)
  mkdirSync(dataDir, { recursive: true })

  const existing = existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).length : 0
  const record: SessionRecord = { seq: existing + 1, at: new Date().toISOString(), ...input }
  appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8')
  return record
}

/** Read every record, oldest first. Tolerates a trailing partial line from a crash. */
export function readSessions(dataDir: string): SessionRecord[] {
  const path = join(dataDir, SESSION_LOG)
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as SessionRecord]
      } catch {
        // A trailing line interrupted mid-write. Dropping it keeps the readable history
        // intact rather than failing the whole read.
        return []
      }
    })
}

/**
 * Fingerprint what a session was *about*, ignoring incidental wording.
 *
 * Two sessions only count as the same procedure if their step shapes match. The steps
 * are normalised to their first token each — the verb — so "Run the tests" and "run
 * linting" do not collapse, while "run tests" and "run the test suite" do.
 */
export function procedureKey(record: SessionRecord): string {
  const verbs = record.steps
    .map((step) => step.trim().split(/\s+/)[0]?.toLowerCase() ?? '')
    .filter(Boolean)
    .join('>')
  return createHash('sha256').update(verbs).digest('hex').slice(0, 12)
}

/**
 * Group the successful session records by the procedure they ran.
 *
 * Clustering is **prefix-aware**: `['a','b']` and `['a','b','c','d']` belong to one
 * procedure, whose canonical shape is the shorter run. Comparing only the verb strings
 * would split them apart, and a procedure whose longer runs were discarded would then
 * sit permanently just below the threshold — so the common case of a short routine plus
 * occasional extra steps would never accumulate into a skill.

 * A run that is not a prefix extension of anything seen starts its own cluster, which is
 * what keeps genuinely different procedures apart.
 */
export function groupByProcedure(records: SessionRecord[]): Map<string, SessionRecord[]> {
  const successful = records.filter((r) => r.outcome === 'success')
  const shapes = successful.map((r) => normalizeSteps(r.steps))

  // Cluster roots: the shortest shape that no other shape extends.
  const roots: { key: string; steps: string[] }[] = []
  const assigned = new Map<string, string>()

  // Process shortest first, so a record attaches to the most specific shorter routine
  // rather than being swallowed by a longer one considered earlier.
  const order = successful
    .map((record, index) => ({ record, index, steps: shapes[index] ?? [] }))
    .sort((a, b) => a.steps.length - b.steps.length)

  for (const entry of order) {
    const parent = roots.find((candidate) => isPrefix(candidate.steps, entry.steps))
    if (parent) {
      assigned.set(`${entry.index}`, parent.key)
      continue
    }
    const key = entry.steps.join('>')
    roots.push({ key, steps: entry.steps })
    assigned.set(`${entry.index}`, key)
  }

  const groups = new Map<string, SessionRecord[]>()
  successful.forEach((record, index) => {
    const key = assigned.get(`${index}`)
    if (!key) return
    const bucket = groups.get(key)
    if (bucket) bucket.push(record)
    else groups.set(key, [record])
  })
  return groups
}

/** Normalise a step list to its comparable shape. */
function normalizeSteps(steps: string[]): string[] {
  return steps.map((step) => step.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean)
}

/** True when `prefix` leads `steps` — i.e. `steps` is `prefix` plus extra work. */
function isPrefix(prefix: string[], steps: string[]): boolean {
  if (prefix.length > steps.length) return false
  return prefix.every((step, i) => step === steps[i])
}
