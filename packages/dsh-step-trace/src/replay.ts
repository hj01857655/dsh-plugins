import { ReplayStore } from './store.js';
import type { TraceStep, DivergencePoint, PanelPayload, SessionSummary, TraceOverview } from './types.js';

export const REPLAY_PANEL_PATH = '/api/replay.panel'

export class Replay {
  private store: ReplayStore;

  constructor(private projectDir: string) {
    this.store = new ReplayStore(projectDir);
  }

  record(sessionId: string, step: Omit<TraceStep, 'step'>): TraceStep {
    const existing = this.store.readTrace(sessionId);
    const fullStep: TraceStep = { ...step, step: existing.length };
    this.store.appendStep(sessionId, fullStep);
    return fullStep;
  }

  getTrace(sessionId: string): TraceStep[] {
    return this.store.readTrace(sessionId);
  }

  /** Step through a trace: return step at index, or null if out of bounds. */
  step(sessionId: string, index: number): TraceStep | null {
    const steps = this.store.readTrace(sessionId);
    if (index < 0 || index >= steps.length) return null;
    return steps[index];
  }

  /** Branch from a step: create a new session with the trace up to that point. */
  branch(sessionId: string, stepIndex: number, newSessionId: string): TraceStep[] | null {
    const steps = this.store.readTrace(sessionId);
    if (stepIndex < 0 || stepIndex >= steps.length) return null;
    const prefix = steps.slice(0, stepIndex + 1);
    this.store.saveTrace(newSessionId, prefix);
    return prefix;
  }

  /** Find the first step where two sessions diverge. */
  divergence(sessionA: string, sessionB: string): DivergencePoint | null {
    const a = this.store.readTrace(sessionA);
    const b = this.store.readTrace(sessionB);
    const minLen = Math.min(a.length, b.length);

    for (let i = 0; i < minLen; i++) {
      if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
        return {
          step: i,
          description: `Sessions diverge at step ${i}: ${a[i].type} vs ${b[i].type}`,
        };
      }
    }

    if (a.length !== b.length) {
      return {
        step: minLen,
        description: `Sessions diverge at step ${minLen}: one has ${a.length} steps, the other ${b.length}`,
      };
    }

    return null;
  }

  deleteSession(sessionId: string): boolean {
    return this.store.deleteSession(sessionId);
  }

  listSessions(): PanelPayload {
    const rawSessions = this.store.listSessions();
    const sessions: SessionSummary[] = rawSessions.map((s) => {
      const steps = this.store.readTrace(s.sessionId);
      return {
        ...s,
        modelSteps: steps.filter((st) => st.type === 'model').length,
        toolSteps: steps.filter((st) => st.type === 'tool').length,
        totalLatencyMs: steps.reduce((sum, st) => sum + st.latencyMs, 0),
      };
    });
    const totalSteps = sessions.reduce((s, sess) => s + sess.stepCount, 0);
    const totalLatencyMs = sessions.reduce((s, sess) => s + sess.totalLatencyMs, 0);
    const overview: TraceOverview = {
      totalSessions: sessions.length,
      totalSteps,
      avgStepsPerSession: sessions.length > 0 ? Math.round((totalSteps / sessions.length) * 10) / 10 : 0,
      totalLatencyMs,
    };
    return { sessions, overview };
  }
}
