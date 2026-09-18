// Types for dsh-model-arena

export interface ModelResult {
  model: string;
  output: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  error?: string;
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

export interface PanelPayload {
  recentRuns: { id: string; prompt: string; timestamp: number; modelCount: number }[];
}
