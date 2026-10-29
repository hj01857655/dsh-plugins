/**
 * The candidate queue: statements worth offering, not worth remembering unasked.
 *
 * A capture rule can be generous or be safe. Explicit verbs ("记住…", "remember that…")
 * are safe because the user asked; widening the patterns to ordinary declarative
 * sentences is not, because the same shape produces "we use sqlite" and "we use two
 * queues in this diagram". Writing both to the log would make recall worse than the
 * narrower rule it replaced.
 *
 * So the wider rule produces a *question*. A candidate is proposed to the panel, and
 * only a person turns it into a memory. The queue is append-only for the same reason the
 * log is: "we offered this and you dismissed it" has to stay answerable, and a mutable
 * queue would let a later run silently re-ask what was already declined.
 *
 * A dismissed candidate is remembered as dismissed rather than deleted, so the same
 * sentence in the same session is not proposed again on every step.
 *
 * @module context-memory/candidates
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { memoryId, normaliseSubject } from './identity.js'
import type { Candidate, CandidateEvent, CandidateOrigin, CandidateReason, CandidateState, MemoryKind } from './types.js'

/** What a caller proposes, before an id exists. */
export interface ProposeInput {
  text: string
  kind?: MemoryKind
  sessionId?: string
  /** Which seam noticed this; omit for the capture seam's own proposals. */
  origin?: CandidateOrigin
  /** Why the harvest selected it. Ignored unless `origin` is `turn-harvest`. */
  reason?: CandidateReason
}

/** Enough of `ContextMemory` to answer "is this already remembered". */
export interface KnownMemories {
  has(id: string): boolean
}

/** Same derivation the memory id uses, so a candidate and the memory it becomes share identity. */
export function candidateId(text: string): string {
  // Same derivation the memory uses, so a candidate and the memory it becomes answer
  // "is this the same statement" the same way. Two derivations would drift.
  return memoryId(normaliseSubject(text), text.trim())
}

export class CandidateQueue {
  private readonly dir: string
  private readonly logPath: string
  /**
   * The last parsed log, revalidated against the file's size and mtime on every read.
   *
   * Same reasoning as `MemoryStore`: the pre-step asks the queue one question per
   * noticed statement (`propose` → `has`/`get`), and re-parsing an unchanged file for
   * each of them is work that answers nothing new. A change on disk invalidates it, so
   * two processes still agree.
   */
  private cached: { key: string | null; value: CandidateState[] } | undefined

  constructor(dir: string) {
    this.dir = dir
    this.logPath = join(dir, 'candidates.jsonl')
  }

  get path(): string {
    return this.logPath
  }

  private signature(): string | null {
    try {
      const stats = statSync(this.logPath)
      return `${stats.size}:${stats.mtimeMs}`
    } catch {
      return null
    }
  }

  private append(event: CandidateEvent): void {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
    appendFileSync(this.logPath, `${JSON.stringify(event)}\n`, 'utf8')
    this.cached = undefined
  }

  /**
   * Fold the queue's log.
   *
   * The same shape as the memory fold, and the same reason: two processes reading one
   * file must agree on which questions are still open. A decision naming a proposal that
   * is not in the log is skipped rather than inventing a candidate.
   *
   * The returned array is shared with the cache: treat it as read-only.
   */
  all(): CandidateState[] {
    const key = this.signature()
    if (this.cached !== undefined && this.cached.key === key) return this.cached.value
    const value = key === null ? [] : this.parse()
    this.cached = { key, value }
    return value
  }

  private parse(): CandidateState[] {
    const byId = new Map<string, CandidateState>()
    const lines = readFileSync(this.logPath, 'utf8').split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]!.trim()
      if (line.length === 0) continue
      let event: CandidateEvent
      try {
        event = JSON.parse(line) as CandidateEvent
      } catch {
        // A torn final line is the expected shape after a crash; anything else is damage.
        const rest = lines.slice(index + 1).every((remaining) => remaining.trim().length === 0)
        if (rest) break
        throw new Error(`${this.logPath}: line ${index + 1} is not valid JSON`)
      }
      if (event.type === 'propose') {
        byId.set(event.candidate.id, { ...event.candidate, status: 'pending' })
        continue
      }
      const target = byId.get(event.id)
      if (target) target.status = event.status
    }
    return [...byId.values()]
  }

  pending(): CandidateState[] {
    return this.all().filter((candidate) => candidate.status === 'pending')
  }

  get(id: string): CandidateState | undefined {
    return this.all().find((candidate) => candidate.id === id)
  }

  /**
   * Offer a statement, unless it is already settled.
   *
   * Three suppressions, each for a different noise source: an active memory (the user
   * already has it), a pending candidate (this step and the last one said the same
   * thing), and a dismissed one (a question already answered — re-asking it every step
   * is how a prompt becomes nagging).
   */
  propose(input: ProposeInput, known: KnownMemories): Candidate | undefined {
    const text = input.text.trim()
    if (text.length === 0) return undefined
    const id = candidateId(text)
    if (known.has(id)) return undefined

    const existing = this.get(id)
    if (existing !== undefined) return undefined

    const candidate: Candidate = {
      id,
      text,
      kind: input.kind ?? 'fact',
      proposedAt: Date.now(),
      // Written only when it is not the pre-1.2 default, so an ordinary capture proposal
      // keeps the smallest record that still reads correctly.
      ...(input.origin === undefined || input.origin === 'user-text' ? {} : { origin: input.origin }),
      ...(input.origin === 'turn-harvest' && input.reason !== undefined ? { reason: input.reason } : {}),
    }
    if (input.sessionId !== undefined) candidate.sessionId = input.sessionId
    this.append({ type: 'propose', at: candidate.proposedAt, candidate })
    return candidate
  }

  /** Record a decision. Returns false when there is no such open candidate. */
  decide(id: string, status: 'accepted' | 'dismissed', at = Date.now()): boolean {
    const target = this.get(id)
    if (target === undefined || target.status !== 'pending') return false
    this.append({ type: 'decide', at, id, status })
    return true
  }
}
