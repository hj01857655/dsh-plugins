import { resolve } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import { PromptVcs } from './vcs.js';
import { registerVcsRoutes } from './routes.js';

export const name = 'dsh-prompt-vcs';

export interface VcsService {
  recordChange(file: string, oldContent: string, newContent: string, changedBy?: 'user' | 'plugin' | 'agent', pluginId?: string): ReturnType<PromptVcs['recordChange']>;
  timeline(): ReturnType<PromptVcs['timeline']>;
  getDiff(hash: string): ReturnType<PromptVcs['getDiff']>;
  rollback(hash: string): boolean;
  panel(): ReturnType<PromptVcs['panel']>;
}

export function apply(ctx: Context): void {
  const root = resolve(process.cwd());
  const vcs = new PromptVcs(root);

  const service = {
    recordChange: (file: string, oldContent: string, newContent: string, changedBy?: 'user' | 'plugin' | 'agent', pluginId?: string) => vcs.recordChange(file, oldContent, newContent, changedBy, pluginId),
    timeline: () => vcs.timeline(),
    getDiff: (hash: string) => vcs.getDiff(hash),
    rollback: (hash: string) => vcs.rollback(hash),
    panel: () => vcs.panel(),
  } satisfies VcsService;

  ctx.provide('promptVcs', service);
  registerVcsRoutes(ctx, service);
}
