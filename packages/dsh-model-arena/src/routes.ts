import type { Context } from '@deepseek-ai/cordis';
import type { ArenaService } from './index.js';
import { ARENA_PANEL_PATH, ARENA_RUN_PATH, ARENA_RATE_PATH } from './arena-view.js';

export { ARENA_PANEL_PATH, ARENA_RUN_PATH, ARENA_RATE_PATH };

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

    connection.fetch.register({
      path: ARENA_PANEL_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: () => Promise.resolve(Response.json(arena.listRuns(), {
        headers: { 'cache-control': 'no-store' },
      })),
    });

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
  });
}
