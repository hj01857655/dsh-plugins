import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { ArenaRun, Suite } from './types.js';

export class ArenaStore {
  private readonly arenaDir: string;

  constructor(private readonly projectDir: string) {
    this.arenaDir = join(projectDir, '.arena');
  }

  private ensureDir(): void {
    if (!existsSync(this.arenaDir)) mkdirSync(this.arenaDir, { recursive: true });
  }

  saveRun(run: ArenaRun): void {
    this.ensureDir();
    writeFileSync(join(this.arenaDir, `${run.id}.json`), JSON.stringify(run, null, 2), 'utf8');
  }

  getRun(id: string): ArenaRun | null {
    const path = join(this.arenaDir, `${id}.json`);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8')) as ArenaRun;
  }

  listRuns(): ArenaRun[] {
    if (!existsSync(this.arenaDir)) return [];
    return readdirSync(this.arenaDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(this.arenaDir, f), 'utf8')) as ArenaRun)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  saveSuite(suite: Suite): void {
    this.ensureDir();
    writeFileSync(join(this.arenaDir, `suite-${suite.name}.json`), JSON.stringify(suite, null, 2), 'utf8');
  }

  getSuite(name: string): Suite | null {
    const path = join(this.arenaDir, `suite-${name}.json`);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8')) as Suite;
  }

  deleteRun(id: string): boolean {
    const path = join(this.arenaDir, `${id}.json`);
    if (!existsSync(path)) return false;
    unlinkSync(path);
    return true;
  }

  static generateId(prompt: string, models: string[]): string {
    const hash = createHash('sha256');
    hash.update(prompt);
    hash.update(models.join(','));
    hash.update(Date.now().toString());
    return hash.digest('hex').slice(0, 12);
  }
}
