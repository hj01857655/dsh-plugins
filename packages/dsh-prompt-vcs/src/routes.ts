import type { Context } from '@deepseek-ai/cordis';
import type { VcsService } from './index.js';
import { VCS_PANEL_PATH } from './vcs.js';

export { VCS_PANEL_PATH };
export const VCS_DIFF_PATH = '/api/vcs.diff';
export const VCS_ROLLBACK_PATH = '/api/vcs.rollback';
export const VCS_CHANGE_PATH = '/api/vcs.change';

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

export function registerVcsRoutes(ctx: Context, vcs: VcsService): void {
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = (connectionCtx as unknown as { connection: FetchRegistrar }).connection;

    connection.fetch.register({
      path: VCS_PANEL_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: () => Promise.resolve(Response.json(vcs.panel(), {
        headers: { 'cache-control': 'no-store' },
      })),
    });

    connection.fetch.register({
      path: '/api/vcs.diff',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (request: Request) => {
        const url = new URL(request.url);
        const hash = url.searchParams.get('hash');
        if (!hash) return Response.json({ error: 'missing hash' }, { status: 400 });
        const diff = vcs.getDiff(hash);
        if (diff === null) return Response.json({ error: 'not found' }, { status: 404 });
        return Response.json({ diff }, { headers: { 'cache-control': 'no-store' } });
      },
    });

    connection.fetch.register({
      path: '/api/vcs.rollback',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request: Request) => {
        let body: { hash?: string };
        try { body = await request.json(); } catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }
        if (!body.hash) return Response.json({ error: 'missing hash' }, { status: 400 });
        const ok = vcs.rollback(body.hash);
        if (!ok) return Response.json({ error: 'not found' }, { status: 404 });
        return Response.json({ ok: true });
      },
    });

    // Full change detail (with old/new content)
    connection.fetch.register({
      path: VCS_CHANGE_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (request: Request) => {
        const url = new URL(request.url);
        const hash = url.searchParams.get('hash');
        if (!hash) return Response.json({ error: 'missing hash' }, { status: 400 });
        const change = vcs.getChange(hash);
        if (!change) return Response.json({ error: 'not found' }, { status: 404 });
        return Response.json(change, { headers: { 'cache-control': 'no-store' } });
      },
    });
  });
}
