import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { VcsStore } from './store.js';
import { unifiedDiff } from './diff.js';
import type { Change, TimelineEntry, PanelPayload } from './types.js';

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

  panel(): PanelPayload {
    return { timeline: this.timeline() };
  }

  static get watchedFiles(): string[] {
    return WATCHED_FILES;
  }
}
