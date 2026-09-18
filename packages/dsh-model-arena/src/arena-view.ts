import type { PanelPayload, ArenaRun } from './types.js';

/** Route paths shared between host and client. */
export const ARENA_PANEL_PATH = '/api/arena.panel'
export const ARENA_RUN_PATH = '/api/arena.run'
export const ARENA_RATE_PATH = '/api/arena.rate'

export function panelState(runs: ArenaRun[]): PanelPayload {
  return {
    recentRuns: runs
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        prompt: r.prompt,
        timestamp: r.timestamp,
        modelCount: r.results.length,
      })),
  };
}
