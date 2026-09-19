import { writeFileSync, readFileSync, existsSync, mkdirSync, appendFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { TraceStep } from './types.js';

export class ReplayStore {
  private readonly replayDir: string;

  constructor(private readonly projectDir: string) {
    this.replayDir = join(projectDir, '.replay');
  }

  private ensureDir(): void {
    if (!existsSync(this.replayDir)) mkdirSync(this.replayDir, { recursive: true });
  }

  private tracePath(sessionId: string): string {
    return join(this.replayDir, `${sessionId}.jsonl`);
  }

  appendStep(sessionId: string, step: TraceStep): void {
    this.ensureDir();
    appendFileSync(this.tracePath(sessionId), JSON.stringify(step) + '\n', 'utf8');
  }

  readTrace(sessionId: string): TraceStep[] {
    const path = this.tracePath(sessionId);
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TraceStep);
  }

  listSessions(): { sessionId: string; stepCount: number; timestamp: number }[] {
    if (!existsSync(this.replayDir)) return [];
    return readdirSync(this.replayDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => {
        const sessionId = f.replace('.jsonl', '');
        const steps = this.readTrace(sessionId);
        return {
          sessionId,
          stepCount: steps.length,
          timestamp: steps.length > 0 ? steps[steps.length - 1].timestamp : 0,
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  saveTrace(sessionId: string, steps: TraceStep[]): void {
    this.ensureDir();
    writeFileSync(this.tracePath(sessionId), steps.map((s) => JSON.stringify(s)).join('\n') + '\n', 'utf8');
  }

  deleteSession(sessionId: string): boolean {
    const path = this.tracePath(sessionId);
    if (!existsSync(path)) return false;
    unlinkSync(path);
    return true;
  }
}
