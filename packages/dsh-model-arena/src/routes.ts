import type { Context } from '@deepseek-ai/cordis';
import type { ArenaService } from './index.js';
import { ARENA_PANEL_PATH, ARENA_RUN_PATH, ARENA_RATE_PATH, ARENA_COMPARE_PATH, ARENA_DELETE_PATH } from './arena-view.js';

export { ARENA_PANEL_PATH, ARENA_RUN_PATH, ARENA_RATE_PATH, ARENA_COMPARE_PATH, ARENA_DELETE_PATH };

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

export function registerArenaRoutes(ctx: Context, arena: ArenaService): void {
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = (connectionCtx as unknown as { connection: FetchRegistrar }).connection;

    // Panel payload (with leaderboard + stats)
    connection.fetch.register({
      path: ARENA_PANEL_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: () => Promise.resolve(Response.json({
        recentRuns: arena.listRuns(),
        leaderboard: arena.leaderboard(),
        stats: arena.stats(),
      }, { headers: { 'cache-control': 'no-store' } })),
    });

    // Run detail
    connection.fetch.register({
      path: ARENA_RUN_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (request: Request) => {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');
        if (!id) return Response.json({ error: 'missing id' }, { status: 400 });
        const run = arena.getRun(id);
        if (!run) return Response.json({ error: 'run not found' }, { status: 404 });
        return Response.json(run, { headers: { 'cache-control': 'no-store' } });
      },
    });

    // Rate a model in a run
    connection.fetch.register({
      path: ARENA_RATE_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request: Request) => {
        let body: { runId?: string; model?: string; rating?: number };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: 'request body must be JSON' }, { status: 400 });
        }
        if (!body.runId || !body.model || body.rating === undefined) {
          return Response.json({ error: 'missing runId, model, or rating' }, { status: 400 });
        }
        const run = arena.rate(body.runId, body.model, body.rating);
        if (!run) return Response.json({ error: 'run not found' }, { status: 404 });
        return Response.json(run, { headers: { 'cache-control': 'no-store' } });
      },
    });

    // Compare two models in a run
    connection.fetch.register({
      path: ARENA_COMPARE_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (request: Request) => {
        const url = new URL(request.url);
        const runId = url.searchParams.get('runId');
        const modelA = url.searchParams.get('modelA');
        const modelB = url.searchParams.get('modelB');
        if (!runId || !modelA || !modelB) {
          return Response.json({ error: 'missing runId, modelA, or modelB' }, { status: 400 });
        }
        const result = arena.compare(runId, modelA, modelB);
        if (!result) return Response.json({ error: 'not found' }, { status: 404 });
        return Response.json(result, { headers: { 'cache-control': 'no-store' } });
      },
    });

    // Delete a run
    connection.fetch.register({
      path: ARENA_DELETE_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request: Request) => {
        let body: { runId?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: 'request body must be JSON' }, { status: 400 });
        }
        if (!body.runId) {
          return Response.json({ error: 'missing runId' }, { status: 400 });
        }
        const ok = arena.deleteRun(body.runId);
        if (!ok) return Response.json({ error: 'run not found' }, { status: 404 });
        return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
      },
    });
  });
}
