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

export interface PanelPayload {
  sessions: { sessionId: string; stepCount: number; timestamp: number }[];
}
