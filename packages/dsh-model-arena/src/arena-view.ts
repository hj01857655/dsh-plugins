import type { PanelPayload, ArenaRun, RunSummary, LeaderboardEntry, ArenaStats } from './types.js';

/** Route paths shared between host and client. */
export const ARENA_PANEL_PATH = '/api/arena.panel'
export const ARENA_RUN_PATH = '/api/arena.run'
export const ARENA_RATE_PATH = '/api/arena.rate'
export const ARENA_COMPARE_PATH = '/api/arena.compare'
export const ARENA_DELETE_PATH = '/api/arena.delete'

export function panelState(
  runs: RunSummary[],
  leaderboard: LeaderboardEntry[],
  stats: ArenaStats,
): PanelPayload {
  return { recentRuns: runs.slice(0, 20), leaderboard, stats };
}
