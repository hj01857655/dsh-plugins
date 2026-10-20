/**
 * The append-only event log.
 *
 * Memory has to survive the process that wrote it, and the interesting question later
 * is never "what is the current value" but "why does the agent believe this". An
 * append-only log answers both: current state is a fold, and the fold is reproducible
 * from the file alone. A mutable store would let the last writer decide what was
 * always true.
 *
 * @module context-memory/store
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import type { MemoryEvent } from './types.js'

export class MemoryStore {
  private readonly dir: string
  private readonly logPath: string

  /**
   * The parsed log, together with the file identity it was parsed from.
   *
   * This is not the cache the module comment warns about. That one was rejected because
   * it would let one process's view of history outlive the events that contradict it;
   * this one is revalidated against the file's own size and mtime on every read, so an
   * append by another process is seen on the next call exactly as before. What it avoids
   * is re-parsing an unchanged file — the same log is folded several times inside one
   * pre-step, and parsing it once per fold is the only part of that which is avoidable.
   */
  private cached: { key: string | null; events: MemoryEvent[] } | undefined

  /** @param dir - the `.memory` directory itself, already resolved for its scope. */
  constructor(dir: string) {
    this.dir = dir
    this.logPath = join(this.dir, 'events.jsonl')
  }
  get path(): string {
    return this.logPath
  }

  /**
   * An identity for the file as it is right now, or null when there is no file.
   *
   * Size alone would miss a rewrite; mtime alone is too coarse on some Windows
   * filesystems. Together they change on every append this process or another makes.
   * `stat` costs a syscall; reading and parsing the file costs a syscall plus an
   * allocation plus a JSON.parse per line, which is why this is worth doing.
   */
  signature(): string | null {
    try {
      const stats = statSync(this.logPath)
      return `${stats.size}:${stats.mtimeMs}`
    } catch {
      return null
    }
  }

  append(event: MemoryEvent): void {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
    // One `write` of one line: a crash can truncate the final line, but cannot interleave.
    appendFileSync(this.logPath, `${JSON.stringify(event)}\n`, 'utf8')
    // Not strictly needed — the next `signature()` no longer matches — but it keeps the
    // cached array from being handed out after this process has moved the log on.
    this.cached = undefined
  }

  /**
   * Read the whole log.
   *
   * A process killed mid-write leaves one torn trailing line. That is a benign, expected
   * shape after a crash, and refusing to read the entire history over it would trade a
   * recoverable loss for a total one — so a torn *final* line is dropped. Corruption
   * anywhere else is a real problem and is reported rather than skipped, because
   * silently ignoring a damaged record is how a log stops being evidence.
   *
   * The returned array is shared with the cache: treat it as read-only.
   */
  readAll(): MemoryEvent[] {
    const key = this.signature()
    if (this.cached !== undefined && this.cached.key === key) return this.cached.events
    const events = key === null ? [] : this.parse()
    this.cached = { key, events }
    return events
  }

  private parse(): MemoryEvent[] {
    const lines = readFileSync(this.logPath, 'utf8').split('\n')
    const events: MemoryEvent[] = []
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]!.trim()
      if (line.length === 0) continue
      try {
        events.push(JSON.parse(line) as MemoryEvent)
      } catch (error) {
        const isFinalLine = lines.slice(index + 1).every((rest) => rest.trim().length === 0)
        if (isFinalLine) break
        throw new Error(`${this.logPath}: line ${index + 1} is not valid JSON: ${String(error)}`)
      }
    }
    return events
  }
}
