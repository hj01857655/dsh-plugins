/**
 * Recall: which memories are relevant to a query.
 *
 * The alternative to ranking is pasting every stored memory into the context window,
 * which costs tokens on every turn and buries the one that mattered. So retrieval is
 * scored, and the score is broken down into named parts that are returned alongside the
 * result — a ranking the user cannot inspect is a ranking they have to trust.
 *
 * Verification strength is part of the score, not a separate display concern: a memory
 * that was checked against the world is worth more than one that was merely stated, and
 * encoding that in one number is what makes "recall the most reliable thing you know"
 * expressible at all.
 *
 * @module context-memory/recall
 */

import { normaliseSubject } from './identity.js'
import type { MemoryState, RecallHit } from './types.js'

/** Words that carry no retrieval signal and would match almost any memory. */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'do', 'does', 'for', 'from',
  'has', 'have', 'how', 'i', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the',
  'their', 'them', 'they', 'this', 'to', 'was', 'we', 'were', 'what', 'when', 'where',
  'which', 'who', 'will', 'with', 'you', 'your',
])

/** Split a query into distinct signal-bearing tokens. */
export function tokenize(text: string): string[] {
  const seen = new Set<string>()
  for (const raw of text.toLowerCase().split(/[^a-z0-9_.-]+/)) {
    if (raw.length < 2 || STOP_WORDS.has(raw)) continue
    seen.add(raw)
  }
  return [...seen]
}

/** How much each part of the score can contribute. Sums to 1. */
const WEIGHTS = {
  overlap: 0.6,
  recency: 0.2,
  verification: 0.2,
} as const

/** A memory older than this contributes no recency credit. */
const RECENCY_HORIZON_MS = 90 * 24 * 60 * 60 * 1000

/**
 * Score how relevant one memory is to a query.
 *
 * Overlap dominates because it is the only part grounded in the query. Recency is a
 * tiebreaker, not a signal: a three-year-old decision that matches the query beats a
 * fresh memory that does not. Verification credit is all-or-nothing — a memory either
 * passed a check or it did not, and giving partial credit for "was checked once and has
 * not been rechecked" would reward staleness.
 */
export function scoreMemory(memory: MemoryState, tokens: string[], now = Date.now()): { score: number; matched: string[]; why: string } {
  const subject = normaliseSubject(`${memory.subject} ${memory.text}`)
  const matched = tokens.filter((token) => subject.includes(token))
  const overlap = tokens.length === 0 ? 0 : matched.length / tokens.length

  const age = Math.max(0, now - memory.createdAt)
  const recency = Math.max(0, 1 - age / RECENCY_HORIZON_MS)

  const verified = memory.verification?.outcome === 'passed' ? 1 : 0

  const score = overlap * WEIGHTS.overlap + recency * WEIGHTS.recency + verified * WEIGHTS.verification
  const why = `overlap ${matched.length}/${tokens.length}, recency ${recency.toFixed(2)}, ${verified ? 'verified' : 'unverified'}`
  return { score, matched, why }
}

/**
 * Rank active memories against a query.
 *
 * Superseded memories are excluded here rather than filtered by the caller: a memory
 * that was replaced is not a weaker answer, it is a wrong one, and ranking it anywhere
 * would put it back in front of the agent.
 */
export function recall(memories: MemoryState[], query: string, limit = 5, now = Date.now()): RecallHit[] {
  const tokens = tokenize(query)
  return memories
    .filter((memory) => memory.status === 'active')
    .map((memory) => ({ memory, ...scoreMemory(memory, tokens, now) }))
    .filter((hit) => hit.matched.length > 0)
    .sort((a, b) => b.score - a.score || b.memory.createdAt - a.memory.createdAt)
    .slice(0, limit)
}
