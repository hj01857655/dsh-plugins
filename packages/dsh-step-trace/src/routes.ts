import type { Context } from '@deepseek-ai/cordis';
import type { ReplayService } from './index.js';
import { REPLAY_PANEL_PATH } from './replay.js';

export { REPLAY_PANEL_PATH };
export const REPLAY_TRACE_PATH = '/api/replay.trace';
export const REPLAY_BRANCH_PATH = '/api/replay.branch';
export const REPLAY_DELETE_PATH = '/api/replay.delete';

interface FetchRegistrar {
  fetch: {
    register(route: {
      path: string;
      methods: readonly string[];
      requestBody: string;
      fetch: (request: Request) => Promise<Response>;
    }): void;
  };
}

export function registerReplayRoutes(ctx: Context, replay: ReplayService): void {
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = (connectionCtx as unknown as { connection: FetchRegistrar }).connection;

    connection.fetch.register({
      path: REPLAY_PANEL_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: () => Promise.resolve(Response.json(replay.listSessions(), {
        headers: { 'cache-control': 'no-store' },
      })),
    });

    connection.fetch.register({
      path: '/api/replay.trace',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (request: Request) => {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');
        if (!id) return Response.json({ error: 'missing id' }, { status: 400 });
        const trace = replay.getTrace(id);
        return Response.json({ steps: trace }, { headers: { 'cache-control': 'no-store' } });
      },
    });

    // Branch from a step
    connection.fetch.register({
      path: REPLAY_BRANCH_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request: Request) => {
        let body: { sessionId?: string; stepIndex?: number; newSessionId?: string };
        try { body = await request.json(); } catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }
        if (!body.sessionId || body.stepIndex === undefined || !body.newSessionId) return Response.json({ error: 'missing fields' }, { status: 400 });
        const result = replay.branch(body.sessionId, body.stepIndex, body.newSessionId);
        if (!result) return Response.json({ error: 'not found' }, { status: 404 });
        return Response.json({ steps: result });
      },
    });

    // Delete a session
    connection.fetch.register({
      path: REPLAY_DELETE_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request: Request) => {
        let body: { sessionId?: string };
        try { body = await request.json(); } catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }
        if (!body.sessionId) return Response.json({ error: 'missing sessionId' }, { status: 400 });
        const ok = replay.deleteSession(body.sessionId);
        if (!ok) return Response.json({ error: 'not found' }, { status: 404 });
        return Response.json({ ok: true });
      },
    });
  });
}
