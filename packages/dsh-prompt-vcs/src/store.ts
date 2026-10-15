import { writeFileSync, readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Change } from './types.js';

export class VcsStore {
  private readonly vcsDir: string;
  private readonly historyPath: string;

  constructor(private readonly projectDir: string) {
    this.vcsDir = join(projectDir, '.promptvcs');
    this.historyPath = join(this.vcsDir, 'history.jsonl');
  }

  private ensureDir(): void {
    if (!existsSync(this.vcsDir)) mkdirSync(this.vcsDir, { recursive: true });
  }

  append(change: Change): void {
    this.ensureDir();
    appendFileSync(this.historyPath, JSON.stringify(change) + '\n', 'utf8');
  }

  readAll(): Change[] {
    if (!existsSync(this.historyPath)) return [];
    return readFileSync(this.historyPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Change);
  }

  static hashChange(file: string, oldContent: string, newContent: string): string {
    return createHash('sha256')
      .update(`${file}:${oldContent}:${newContent}:${Date.now()}`)
      .digest('hex')
      .slice(0, 12);
  }
}
