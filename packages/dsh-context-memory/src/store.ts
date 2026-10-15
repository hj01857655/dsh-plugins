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

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { MemoryEvent } from './types.js'

export class MemoryStore {
  private readonly dir: string
  private readonly logPath: string

  constructor(private readonly projectDir: string) {
    this.dir = join(projectDir, '.memory')
    this.logPath = join(this.dir, 'events.jsonl')
  }

  get path(): string {
    return this.logPath
  }

  append(event: MemoryEvent): void {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
    // One `write` of one line: a crash can truncate the final line, but cannot interleave.
    appendFileSync(this.logPath, `${JSON.stringify(event)}\n`, 'utf8')
  }

  /**
   * Read the whole log.
   *
   * A process killed mid-write leaves one torn trailing line. That is a benign, expected
   * shape after a crash, and refusing to read the entire history over it would trade a
   * recoverable loss for a total one — so a torn *final* line is dropped. Corruption
   * anywhere else is a real problem and is reported rather than skipped, because
   * silently ignoring a damaged record is how a log stops being evidence.
   */
  readAll(): MemoryEvent[] {
    if (!existsSync(this.logPath)) return []
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
