// Types for dsh-cost

export interface CostEntry {
  timestamp: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  sessionId: string;
}

export interface ModelPricing {
  promptPerMillion: number;
  completionPerMillion: number;
}

export interface Budget {
  monthly: number;
  enforce: boolean;
  periodStart: number;
}

export interface BudgetConfig {
  monthly?: number;
  enforce?: boolean;
}

export interface BudgetStatus {
  exceeded: boolean;
  spent: number;
  remaining: number;
}

/** Per-day spend and token counts for trend charts. */
export interface DailyTrend {
  date: string;      // YYYY-MM-DD
  spend: number;
  promptTokens: number;
  completionTokens: number;
  calls: number;
}

/** A single model's aggregate stats within a time range. */
export interface ModelBreakdown {
  model: string;
  spend: number;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  avgCostPerCall: number;
}

/** An individual call within a session detail view. */
export interface SessionCall {
  timestamp: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

/** Expanded session with individual calls. */
export interface SessionDetail {
  sessionId: string;
  spend: number;
  calls: number;
  timestamp: number;
  entries: SessionCall[];
}

/** Time range filter for queries. */
export interface TimeRange {
  from?: number;   // epoch ms, inclusive
  to?: number;     // epoch ms, exclusive
}

export interface PanelPayload {
  todaySpend: number;
  monthSpend: number;
  totalSpend: number;
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  perModel: ModelBreakdown[];
  recentSessions: { sessionId: string; spend: number; calls: number; timestamp: number }[];
  budget: BudgetStatus | null;
  dailyTrend: DailyTrend[];
  supportedModels: string[];
}
