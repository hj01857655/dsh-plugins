import type { Context } from '@deepseek-ai/cordis';
import type { ReplayService } from './index.js';
import { REPLAY_PANEL_PATH } from './replay.js';

export { REPLAY_PANEL_PATH };

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
  });
}
