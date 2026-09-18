/**
 * Host route serving the cost panel to the browser half.
 *
 * @module cost/routes
 */

import type { Context } from '@deepseek-ai/cordis';

import type { CostService } from './index.js';
import { COST_PANEL_PATH, COST_BUDGET_PATH } from './cost-view.js';

export { COST_PANEL_PATH, COST_BUDGET_PATH };

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
 * Register the panel and budget routes when the host carries the web connection.
 */
export function registerCostRoutes(ctx: Context, cost: CostService): void {
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = (connectionCtx as unknown as { connection: FetchRegistrar }).connection;
    connection.fetch.register({
      path: COST_PANEL_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: () => Promise.resolve(Response.json(cost.summary(), {
        headers: { 'cache-control': 'no-store' },
      })),
    });
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
  });
}
