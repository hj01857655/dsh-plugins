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

export interface PanelPayload {
  todaySpend: number;
  monthSpend: number;
  perModel: { model: string; spend: number; calls: number }[];
  recentSessions: { sessionId: string; spend: number; calls: number; timestamp: number }[];
  budget: BudgetStatus | null;
}
