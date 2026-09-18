import { resolve } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import { Arena } from './arena.js';
import { registerArenaRoutes } from './routes.js';

export const name = 'dsh-model-arena';

export interface ArenaService {
  saveRun(prompt: string, results: { model: string; output: string; promptTokens: number; completionTokens: number; latencyMs: number; error?: string }[], reference?: string): ReturnType<Arena['saveRun']>;
  getRun(id: string): ReturnType<Arena['getRun']>;
  listRuns(): ReturnType<Arena['listRuns']>;
  compare(runId: string, modelA: string, modelB: string): ReturnType<Arena['compare']>;
  rate(runId: string, model: string, rating: number): ReturnType<Arena['rate']>;
  saveSuite(suite: { name: string; prompts: string[]; models: string[] }): void;
  regression(suiteName: string, baselineRunId: string, currentRunId: string): ReturnType<Arena['regression']>;
}

export function apply(ctx: Context): void {
  const root = resolve(process.cwd());
  const arena = new Arena(root);

  const service = {
    saveRun: (prompt: string, results: Parameters<Arena['saveRun']>[1], reference?: string) => arena.saveRun(prompt, results, reference),
    getRun: (id: string) => arena.getRun(id),
    listRuns: () => arena.listRuns(),
    compare: (runId: string, modelA: string, modelB: string) => arena.compare(runId, modelA, modelB),
    rate: (runId: string, model: string, rating: number) => arena.rate(runId, model, rating),
    saveSuite: (suite: Parameters<Arena['saveSuite']>[0]) => arena.saveSuite(suite),
    regression: (suiteName: string, baselineRunId: string, currentRunId: string) => arena.regression(suiteName, baselineRunId, currentRunId),
  } satisfies ArenaService;

  ctx.provide('arena', service);
  registerArenaRoutes(ctx, service);
}
