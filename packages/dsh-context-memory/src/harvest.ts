/**
 * Turn-end harvest: turn a finished turn's tool results into memory candidates.
 *
 * Long sessions produce durable facts — a command that failed, a version that
 * mattered, a path that moved — without anyone typing "remember". The capture
 * seam already reads user text at pre-step; this module gives the same treatment
 * to what the tools reported, at the natural boundary (turn end), into the same
 * reviewable queue. Nothing here writes a memory: every output is a candidate
 * the user confirms or dismisses, exactly like pre-step proposals.
 *
 * The extraction is deliberately shallow — sentence selection over tool-result
 * text, scored the same way the capture seam scores user text. A model-summarized
 * harvest would be higher precision and adds a model call, a latency cost, and a
 * failure mode to every turn; the queue's confirm step is where precision comes
 * from instead.
 *
 * @module context-memory/harvest
 */

import type { MemoryKind, MemoryEvent, Candidate } from './types.js'
import { candidateId } from './candidates.js'

/** One candidate the harvester wants the user to review. */
export interface HarvestedCandidate {
  text: string
  kind: MemoryKind
  sessionId: string
  turn: number
  /** Why the harvester flagged it — shown in the panel next to the source. */
  reason: 'error' | 'command' | 'discovery'
}

/** One tool result's flattened text content. */
interface FlatToolResult {
  turn: number
  step: number
  isError: boolean
  text: string
}

/** Extract readable text from one tool-result-shaped content block list. */
function flattenContent(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (
      block !== null && typeof block === 'object'
      && (block as { type?: string }).type === 'text'
      && typeof (block as { text?: unknown }).text === 'string'
    ) {
      parts.push((block as { text: string }).text)
    }
  }
  return parts.join('\n')
}

/** File extensions that carry runnable facts (commands were run, versions printed). */
const COMMAND_HOSTS = /\.(?:json|ya?ml|toml|lock|sh|ps1|mjs|cjs|js|ts)$/i

/**
 * Classify one sentence harvested from a tool result.
 *
 * A failed tool call is a pitfall by default — a command that errored is the
 * cheapest durable lesson a log holds. Command-shaped output (a version line,
 * a config read) is a fact. Everything else is a discovery only when it states
 * something about the world, which the sentence heuristics below approximate by
 * requiring a verb-shaped stem.
 */
function classify(text: string, isError: boolean): { kind: MemoryKind; reason: HarvestedCandidate['reason'] } | undefined {
  const trimmed = text.trim()
  if (isError) {
    return trimmed.length >= 8 ? { kind: 'pitfall', reason: 'error' } : undefined
  }
  if (/^(?:npm|pnpm|yarn|node|python|pip|git|cargo|go|docker|kubectl)\s+\S/u.test(trimmed)) {
    return { kind: 'fact', reason: 'command' }
  }
  if (/\b(?:version|installed|resolved|migrated|deprecated|requires)\b/iu.test(trimmed) && COMMAND_HOSTS.test('x.json')) {
    return { kind: 'fact', reason: 'discovery' }
  }
  if (/\b(?:is|are|uses|runs|needs|points? to|lives? (?:in|at))\b/iu.test(trimmed) && trimmed.length >= 16) {
    return { kind: 'fact', reason: 'discovery' }
  }
  return undefined
}

const HARVEST_MAX_PER_TURN = 3
const HARVEST_MIN_TEXT = 12
const HARVEST_MAX_TEXT = 200

/**
 * Turn one finished turn's tool results into review candidates.
 *
 * Selection keeps the noise out: errors first (bounded), then command facts,
 * then world-state discoveries — at most {@link HARVEST_MAX_PER_TURN} per turn,
 * deduplicated against themselves. Deduplication against the memory log and the
 * open candidate queue happens at the call site, which owns both.
 */
export function harvestTurn(
  results: readonly FlatToolResult[],
  sessionId: string,
  turn: number,
): HarvestedCandidate[] {
  const out: HarvestedCandidate[] = []
  const seen = new Set<string>()

  const push = (raw: string, isError: boolean): void => {
    if (out.length >= HARVEST_MAX_PER_TURN) return
    const text = raw.replace(/\s+/gu, ' ').trim()
    if (text.length < HARVEST_MIN_TEXT || text.length > HARVEST_MAX_TEXT) return
    const kinded = classify(text, isError)
    if (kinded === undefined) return
    const key = text.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push({ text, kind: kinded.kind, sessionId, turn, reason: kinded.reason })
  }

  // Errors first: a failed command is the highest-value sentence in the turn.
  for (const result of results) {
    if (!result.isError) continue
    for (const line of result.text.split(/\r?\n/)) push(line, true)
  }
  if (out.length >= HARVEST_MAX_PER_TURN) return out

  for (const result of results) {
    if (result.isError) continue
    for (const line of result.text.split(/\r?\n/)) push(line, false)
    if (out.length >= HARVEST_MAX_PER_TURN) break
  }
  return out
}

/** Flatten one `tool/result` session event into the harvest input shape. */
export function flattenToolResultEvent(event: { type: string; data?: Record<string, unknown> }): FlatToolResult | undefined {
  if (event.type !== 'tool/result') return undefined
  const data = event.data as {
    turn?: number
    step?: number
    message?: { isError?: boolean; content?: unknown }
  } | undefined
  const message = data?.message
  if (message === undefined || message.content === undefined) return undefined
  return {
    turn: typeof data?.turn === 'number' ? data.turn : -1,
    step: typeof data?.step === 'number' ? data.step : -1,
    isError: message.isError === true,
    text: flattenContent(message.content),
  }
}

/**
 * Read one finished turn's tool results from a session log slice.
 *
 * `events` is the turn's own event range (the caller slices it); the returned
 * rows are exactly the tool results that belong to `turn`.
 */
export function collectTurnResults(events: readonly { type: string; seq: number; data?: Record<string, unknown> }[], turn: number): FlatToolResult[] {
  const out: FlatToolResult[] = []
  for (const event of events) {
    const flat = flattenToolResultEvent(event)
    if (flat !== undefined && flat.turn === turn) out.push(flat)
  }
  return out
}

/**
 * Convert a harvested candidate into the propose input the memory expects.
 * The id derivation matches `candidateId`, so a harvested candidate and a
 * pre-step candidate with the same sentence collapse into one queue entry.
 */
export function toProposeInput(candidate: HarvestedCandidate): { text: string; kind: MemoryKind; sessionId: string } {
  return { text: candidate.text, kind: candidate.kind, sessionId: candidate.sessionId }
}

/** Whether a harvested candidate is already covered — an active memory or an open candidate. */
export function isKnown(candidate: HarvestedCandidate, known: { has(id: string): boolean }, queued: readonly Pick<Candidate, 'id'>[]): boolean {
  const id = candidateId(candidate.text)
  if (known.has(id)) return true
  return queued.some((entry) => entry.id === id)
}

/** Re-export for the panel: a harvest badge shows the turn that produced a candidate. */
export type { MemoryEvent }
