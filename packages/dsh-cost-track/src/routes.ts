/**
 * Host routes serving the cost panel and operations to the browser half.
 *
 * @module cost/routes
 */

import type { Context } from '@deepseek-ai/cordis';

import type { CostService } from './index.js';
import {
  COST_PANEL_PATH, COST_BUDGET_PATH,
  COST_SESSION_PATH, COST_EXPORT_PATH,
  COST_CLEAR_PATH, COST_PRICING_UPDATE_PATH,
} from './cost-view.js';

export {
  COST_PANEL_PATH, COST_BUDGET_PATH,
  COST_SESSION_PATH, COST_EXPORT_PATH,
  COST_CLEAR_PATH, COST_PRICING_UPDATE_PATH,
};

/**
 * Connection's fetch-route slice, typed locally rather than importing the
 * host-only connection package.
 */
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

/**
 * Register cost routes when the host carries the web connection.
 */
export function registerCostRoutes(ctx: Context, cost: CostService): void {
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = (connectionCtx as unknown as { connection: FetchRegistrar }).connection;

    // Panel summary
    connection.fetch.register({
      path: COST_PANEL_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: () => Promise.resolve(Response.json(cost.summary(), {
        headers: { 'cache-control': 'no-store' },
      })),
    });

    // Set budget
    connection.fetch.register({
      path: COST_BUDGET_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request: Request) => {
        let body: { monthly?: number; enforce?: boolean };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: 'request body must be JSON' }, { status: 400 });
        }
        cost.setBudget(body.monthly, body.enforce);
        return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
      },
    });

    // Session detail
    connection.fetch.register({
      path: COST_SESSION_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request: Request) => {
        let body: { sessionId?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: 'request body must be JSON: { "sessionId": string }' }, { status: 400 });
        }
        const sid = String(body.sessionId ?? '');
        if (!sid) return Response.json({ error: 'sessionId required' }, { status: 400 });
        const detail = cost.sessionDetail(sid);
        if (!detail) return Response.json({ error: `session ${sid} not found` }, { status: 404 });
        return Response.json(detail, { headers: { 'cache-control': 'no-store' } });
      },
    });

    // Export CSV
    connection.fetch.register({
      path: COST_EXPORT_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: () => {
        const csv = cost.exportCSV();
        return Promise.resolve(new Response(csv, {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="cost-export.csv"',
            'cache-control': 'no-store',
          },
        }));
      },
    });

    // Clear all data
    connection.fetch.register({
      path: COST_CLEAR_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: () => {
        const result = cost.clearData();
        return Promise.resolve(Response.json(result, { headers: { 'cache-control': 'no-store' } }));
      },
    });

    // Update pricing from models.dev
    connection.fetch.register({
      path: COST_PRICING_UPDATE_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async () => {
        try {
          const result = await cost.updatePricing();
          return Response.json(result, { headers: { 'cache-control': 'no-store' } });
        } catch (err) {
          return Response.json(
            { error: `pricing update failed: ${(err as Error).message}` },
            { status: 502 },
          );
        }
      },
    });
  });
}
