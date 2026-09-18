import { resolve } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import { Replay } from './replay.js';
import { registerReplayRoutes } from './routes.js';

export const name = 'dsh-trace';

export interface ReplayService {
  record(sessionId: string, step: { type: 'model' | 'tool'; input: unknown; output: unknown; latencyMs: number; timestamp: number }): ReturnType<Replay['record']>;
  getTrace(sessionId: string): ReturnType<Replay['getTrace']>;
  step(sessionId: string, index: number): ReturnType<Replay['step']>;
  branch(sessionId: string, stepIndex: number, newSessionId: string): ReturnType<Replay['branch']>;
  divergence(sessionA: string, sessionB: string): ReturnType<Replay['divergence']>;
  listSessions(): ReturnType<Replay['listSessions']>;
}

export function apply(ctx: Context): void {
  const root = resolve(process.cwd());
  const replay = new Replay(root);

  const service = {
    record: (sessionId: string, step: Parameters<ReplayService['record']>[1]) => replay.record(sessionId, step),
    getTrace: (sessionId: string) => replay.getTrace(sessionId),
    step: (sessionId: string, index: number) => replay.step(sessionId, index),
    branch: (sessionId: string, stepIndex: number, newSessionId: string) => replay.branch(sessionId, stepIndex, newSessionId),
    divergence: (sessionA: string, sessionB: string) => replay.divergence(sessionA, sessionB),
    listSessions: () => replay.listSessions(),
  } satisfies ReplayService;

  ctx.provide('replay', service);
  registerReplayRoutes(ctx, service);
}
