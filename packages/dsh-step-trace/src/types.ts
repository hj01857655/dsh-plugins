// Types for dsh-replay

export interface TraceStep {
  step: number;
  type: 'model' | 'tool';
  input: unknown;
  output: unknown;
  latencyMs: number;
  timestamp: number;
}

export interface Trace {
  sessionId: string;
  steps: TraceStep[];
}

export interface DivergencePoint {
  step: number;
  description: string;
}

export interface SessionSummary {
  sessionId: string;
  stepCount: number;
  timestamp: number;
  modelSteps: number;
  toolSteps: number;
  totalLatencyMs: number;
}

export interface TraceOverview {
  totalSessions: number;
  totalSteps: number;
  avgStepsPerSession: number;
  totalLatencyMs: number;
}

export interface PanelPayload {
  sessions: SessionSummary[];
  overview: TraceOverview;
}
