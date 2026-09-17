/**
 * Durable rule store.
 *
 * Everything the plugin knows lives in one JSON file under `.verdict/`. Two properties
 * matter and are enforced here rather than by convention:
 *
 * - **capture is idempotent.** Capturing an existing rule records another observation,
 *   it does not create a second rule. This follows from the derived id and is what lets
 *   recurrence counts mean anything.
 * - **writes are atomic.** Serialise to a temp file then rename. A ledger truncated by
 *   a crash mid-write would take the whole history with it, and unlike the rules
 *   themselves there is no way to recompute it.
 *
 * @module verdict/store
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { ruleId } from './identity.js'
import type { Ledger, Rule } from './types.js'

/** Ledger file name inside the plugin's data directory. */
const LEDGER_FILE = 'ledger.json'

/** Empty ledger, used when the file does not exist yet. */
export function emptyLedger(): Ledger {
  return { version: 1, rules: {} }
}

/**
 * Read the ledger, returning an empty one when absent or undecodable.
 *
 * A corrupt file is reported rather than repaired: silently resetting would look to the
 * user exactly like every rule having been fixed, which is the opposite of what a tool
 * whose job is verification should do.
 */
export function readLedger(root: string): Ledger {
  const path = join(root, LEDGER_FILE)
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return emptyLedger()
  }
  try {
    const parsed = JSON.parse(raw) as Ledger
    if (parsed?.version !== 1 || typeof parsed.rules !== 'object' || parsed.rules === null) {
      throw new Error('unrecognised ledger shape')
    }
    return parsed
  } catch (error) {
    throw new Error(`verdict ledger at ${path} is not readable: ${String(error)}`)
  }
}

/**
 * Persist the ledger atomically.
 *
 * The temp file is written into the same directory as the target so the rename stays on
 * one filesystem — a cross-device rename is not atomic and would reopen the truncation
 * window this is here to close.
 */
export function writeLedger(root: string, ledger: Ledger): void {
  const path = join(root, LEDGER_FILE)
  mkdirSync(root, { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8')
  renameSync(tmp, path)
}

/**
 * Record a lesson.
 *
 * First sight creates a candidate rule; later sightings of the same rule return the
 * existing one unchanged, because seeing a rule again is not new information until the
 * checker says so.
 *
 * @param root - plugin data directory.
 * @param text - the lesson, as a human would write it.
 * @returns the rule as stored, plus whether this call created it.
 */
export function capture(root: string, text: string, now = new Date()): { rule: Rule; created: boolean } {
  const ledger = readLedger(root)
  const id = ruleId(text)
  const existing = ledger.rules[id]
  if (existing) return { rule: existing, created: false }

  const rule: Rule = {
    id,
    text: text.trim(),
    state: 'candidate',
    createdAt: now.toISOString(),
    recurrences: 0,
  }
  ledger.rules[id] = rule
  writeLedger(root, ledger)
  return { rule, created: true }
}

/** Update one rule in place and persist. */
export function updateRule(root: string, rule: Rule): void {
  const ledger = readLedger(root)
  ledger.rules[rule.id] = rule
  writeLedger(root, ledger)
}

/**
 * Every rule, newest creation first.
 *
 * Ordering by `createdAt` rather than insertion order keeps the listing stable even
 * though the underlying object is keyed by id.
 */
export function listRules(root: string): Rule[] {
  const ledger = readLedger(root)
  return Object.values(ledger.rules).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Recall: rules matching a substring of their text, case-insensitive. */
export function recall(root: string, query: string): Rule[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return listRules(root)
  return listRules(root).filter((rule) => rule.text.toLowerCase().includes(needle))
}
