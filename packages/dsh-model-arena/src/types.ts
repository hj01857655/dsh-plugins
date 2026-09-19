// Types for dsh-model-arena

export interface ModelResult {
  model: string;
  output: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  error?: string;
  rating?: number;
}

export interface Score {
  userRating?: number;
  lengthScore?: number;
  latencyScore?: number;
  referenceMatch?: number;
}

export interface ArenaRun {
  id: string;
  prompt: string;
  timestamp: number;
  results: ModelResult[];
  scores: Record<string, Score>;
  reference?: string | undefined;
}

export interface Suite {
  name: string;
  prompts: string[];
  models: string[];
}

export interface RegressionReport {
  suiteName: string;
  baselineRunId: string;
  currentRunId: string;
  changes: { model: string; prompt: string; improved: boolean; baselineOutput: string; currentOutput: string }[];
}

export interface LeaderboardEntry {
  model: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  games: number;
  totalRuns: number;
  avgRating: number;
  avgLatencyMs: number;
  avgTokens: number;
}

export interface RunSummary {
  id: string;
  prompt: string;
  timestamp: number;
  modelCount: number;
  winner?: string | undefined;
}

export interface ComparePayload {
  runId: string;
  modelA: string;
  modelB: string;
  outputA: string;
  outputB: string;
  diff: { type: 'same' | 'added' | 'removed'; text: string }[];
  summary: { added: number; removed: number; changed: number };
  scoreA: Score;
  scoreB: Score;
}

export interface ArenaStats {
  totalRuns: number;
  totalModels: number;
  uniqueModels: number;
  uniquePrompts: number;
  totalRatings: number;
  avgModelsPerRun: number;
}

export interface PanelPayload {
  recentRuns: RunSummary[];
  leaderboard: LeaderboardEntry[];
  stats: ArenaStats;
}
