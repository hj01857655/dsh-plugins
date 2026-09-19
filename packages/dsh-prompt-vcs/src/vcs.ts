import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { VcsStore } from './store.js';
import { unifiedDiff } from './diff.js';
import type { Change, TimelineEntry, PanelPayload, FileStat } from './types.js';

export const VCS_PANEL_PATH = '/api/vcs.panel'

/** Files that shape agent behaviour — the instruction surface. */
const WATCHED_FILES = ['AGENTS.md', 'CLAUDE.md'];

export class PromptVcs {
  private store: VcsStore;

  constructor(private projectDir: string) {
    this.store = new VcsStore(projectDir);
  }

  /** Record a change to a file. Called when a watched file is modified. */
  recordChange(
    file: string,
    oldContent: string,
    newContent: string,
    changedBy: 'user' | 'plugin' | 'agent' = 'user',
    pluginId?: string,
  ): Change | null {
    if (oldContent === newContent) return null;

    const rel = relative(this.projectDir, file);
    const { diff, added, removed } = unifiedDiff(oldContent, newContent, rel, rel);
    const hash = VcsStore.hashChange(file, oldContent, newContent);

    const change: Change = {
      hash,
      timestamp: Date.now(),
      file: rel,
      changedBy,
      addedLines: added,
      removedLines: removed,
      diff,
      oldContent,
      newContent,
    };
    if (pluginId !== undefined) change.pluginId = pluginId;

    this.store.append(change);
    return change;
  }

  /** Snapshot a file's current content, detecting changes since last snapshot. */
  checkFile(file: string, lastKnownContent: string | null): Change | null {
    const fullPath = join(this.projectDir, file);
    if (!existsSync(fullPath)) return null;
    const current = readFileSync(fullPath, 'utf8');
    if (lastKnownContent === current) return null;
    return this.recordChange(fullPath, lastKnownContent ?? '', current);
  }

  timeline(): TimelineEntry[] {
    return this.store.readAll().map((c) => ({
      hash: c.hash,
      timestamp: c.timestamp,
      file: c.file,
      changedBy: c.changedBy,
      addedLines: c.addedLines,
      removedLines: c.removedLines,
    }));
  }

  getDiff(hash: string): string | null {
    const change = this.store.readAll().find((c) => c.hash === hash);
    return change?.diff ?? null;
  }

  /** Get full change detail by hash. */
  getChange(hash: string): Change | null {
    const change = this.store.readAll().find((c) => c.hash === hash);
    return change ?? null;
  }

  /** Rollback a file to its state before the given change. */
  rollback(hash: string): boolean {
    const changes = this.store.readAll();
    const change = changes.find((c) => c.hash === hash);
    if (!change) return false;

    const fullPath = join(this.projectDir, change.file);
    writeFileSync(fullPath, change.oldContent, 'utf8');

    // Record the rollback itself
    this.recordChange(fullPath, change.newContent, change.oldContent, 'user');
    return true;
  }

  /** Get stats per file. */
  fileStats(): FileStat[] {
    const changes = this.store.readAll();
    const byFile = new Map<string, { changes: number; lastChanged: number }>();
    for (const c of changes) {
      const f = byFile.get(c.file) ?? { changes: 0, lastChanged: 0 };
      f.changes++;
      f.lastChanged = Math.max(f.lastChanged, c.timestamp);
      byFile.set(c.file, f);
    }
    return [...byFile.entries()].map(([file, v]) => {
      const fullPath = join(this.projectDir, file);
      let currentSize = 0;
      try { currentSize = existsSync(fullPath) ? readFileSync(fullPath, 'utf8').length : 0; } catch { /* */ }
      return { file, ...v, currentSize };
    }).sort((a, b) => b.lastChanged - a.lastChanged);
  }

  panel(): PanelPayload {
    const changes = this.store.readAll();
    return {
      timeline: this.timeline(),
      files: this.fileStats(),
      totalChanges: changes.length,
      watchedFiles: WATCHED_FILES,
    };
  }

  static get watchedFiles(): string[] {
    return WATCHED_FILES;
  }
}
