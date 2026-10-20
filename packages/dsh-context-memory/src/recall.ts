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
 * A memory a check *contradicted*, however, is not a low-scoring candidate — it is the
 * wrong answer. It is filtered out here rather than down-weighted, because no amount of
 * lexical overlap makes "the build uses yarn" useful once `package.json` disagrees.
 *
 * @module context-memory/recall
 */

import { normaliseSubject } from './identity.js'
import type { MemoryState, MemoryTarget, RecallHit } from './types.js'

/** Words that carry no retrieval signal and would match almost any memory. */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'do', 'does', 'for', 'from',
  'has', 'have', 'how', 'i', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the',
  'their', 'them', 'they', 'this', 'to', 'was', 'we', 'were', 'what', 'when', 'where',
  'which', 'who', 'will', 'with', 'you', 'your',
])

/**
 * Characters treated as part of a Latin word.
 *
 * Everything else — including punctuation, whitespace, and every CJK code point — splits
 * a Latin token. CJK is handled by its own branch below rather than here.
 */
const LATIN_WORD = /[a-z0-9_.-]+/g

/**
 * A run of CJK characters.
 *
 * Covers the unified ideographs (the bulk of Chinese), the extension-A block, and the
 * compatibility ideographs. Kana and Hangul are deliberately excluded: they are not the
 * scripts this plugin's second language is written in, and including them would produce
 * 2-grams that match nothing.
 */
const CJK_RUN = /[㐀-䶿一-鿿豈-﫿]+/g

/** Shortest CJK run that still yields a usable 2-gram. */
const CJK_MIN_RUN = 2

/**
 * Split a query into distinct signal-bearing tokens.
 *
 * Latin text is split on word boundaries as before. CJK text has no spaces, so a
 * whitespace tokenizer discards it entirely — which made recall return nothing for every
 * Chinese query while capture happily stored Chinese statements. Each CJK run is instead
 * cut into overlapping 2-grams: two characters is the smallest unit that carries meaning
 * in Chinese ("构建" does, "建" alone does not), and a 2-gram index needs no dictionary,
 * no dependency, and no runtime model.
 *
 * A genuine word longer than two characters overlaps into several grams, so a query and a
 * memory that share one word still match even when the surrounding wording differs.
 */
export function tokenize(text: string): string[] {
  const lowered = text.toLowerCase()
  const seen = new Set<string>()
  for (const raw of lowered.match(LATIN_WORD) ?? []) {
    if (raw.length < 2 || STOP_WORDS.has(raw)) continue
    seen.add(raw)
  }
  for (const run of lowered.match(CJK_RUN) ?? []) {
    if (run.length < CJK_MIN_RUN) continue
    for (let index = 0; index + CJK_MIN_RUN <= run.length; index += 1) {
      seen.add(run.slice(index, index + CJK_MIN_RUN))
    }
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
 * The text a query is matched against, normalised once per memory.
 *
 * Keyed on the memory object, which the fold produces once and then reuses, so this is
 * one normalisation per memory rather than one per memory per query — the lower-casing
 * and three regex passes in `normaliseSubject` were being redone on every call, for
 * every memory, on every step. A `WeakMap` rather than a field on `MemoryState` so the
 * public shape (which the panel renders and the log emits) does not grow a derived
 * value that could be stale for a hand-built object.
 */
const SEARCHABLE_TEXT = new WeakMap<MemoryState, string>()

function searchableText(memory: MemoryState): string {
  const cached = SEARCHABLE_TEXT.get(memory)
  if (cached !== undefined) return cached
  const value = normaliseSubject(`${memory.subject} ${memory.text}`)
  SEARCHABLE_TEXT.set(memory, value)
  return value
}

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
  const subject = searchableText(memory)
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
 * Whether the world has denied this memory.
 *
 * Distinct from both `superseded` (a person retired it) and `broken` (the check could not
 * run). Only a check that ran and failed counts: an unusable check says nothing about the
 * memory, and treating it as a denial is how a typo would erase a true statement.
 */
export function isContradicted(memory: MemoryState): boolean {
  return memory.status === 'active' && memory.verification?.outcome === 'violated'
}

/**
 * Whether a memory belongs to the population `target` names.
 *
 * Exported because two callers need the same answer and must not drift: ranking uses it
 * to filter, and the memory service uses it to answer "what is in this population" for
 * the pull tool. A second definition of "guidance" is how the push and pull paths would
 * end up disagreeing about what the plugin considers offerable.
 */
export function inTarget(memory: MemoryState, target: MemoryTarget): boolean {
  switch (target) {
    case 'guidance': return memory.status === 'active' && !isContradicted(memory)
    case 'contradicted': return isContradicted(memory)
    case 'superseded': return memory.status === 'superseded'
    case 'all': return true
  }
}

/**
 * Rank memories against a query.
 *
 * The default population is guidance: superseded and contradicted memories are excluded
 * here rather than filtered by the caller, because one was replaced and the other was
 * disproved. Neither is a weaker answer — both are wrong ones, and ranking them anywhere
 * would put them back in front of the agent unasked.
 *
 * `target` exists for the opposite caller: a model that explicitly asks what was
 * recorded, or what a check disproved. Widening it is a deliberate, per-call decision
 * and never the default, because the two paths want different answers to "what is
 * true" — the push path wants guidance, the pull path wants the log.
 */
export function recall(
  memories: MemoryState[],
  query: string,
  limit = 5,
  now = Date.now(),
  target: MemoryTarget = 'guidance',
): RecallHit[] {
  const tokens = tokenize(query)
  const hits = memories
    .filter((memory) => inTarget(memory, target))
    .map((memory) => ({ memory, ...scoreMemory(memory, tokens, now) }))
    // A query with no signal-bearing tokens matches nothing rather than everything: an
    // empty query is a question about nothing, and answering it with the whole log would
    // make every ranking unexplainable.
    .filter((hit) => hit.matched.length > 0)
    .sort((a, b) => b.score - a.score || b.memory.createdAt - a.memory.createdAt)
  // One claim, one hit. The id is derived from the statement, so the same sentence
  // recorded in both scopes arrives twice with the same id and — by construction — the
  // same score and the same text. Handing both to the caller would put the same line into
  // the injected context twice and make `limit` mean "hits" instead of "memories".
  // `scope` is still reported on the survivor, so which log holds it stays visible.
  const seen = new Set<string>()
  return hits.filter((hit) => {
    if (seen.has(hit.memory.id)) return false
    seen.add(hit.memory.id)
    return true
  }).slice(0, limit)
}
