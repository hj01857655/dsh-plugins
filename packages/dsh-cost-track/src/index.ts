/**
 * dsh-cost host half.
 *
 * Registers a `cost` service that records model-call spend, prices it, and
 * enforces budgets. The web panel rides the host's connection when one exists;
 * headless hosts skip it and the CLI remains the whole surface.
 *
 * @module dsh-cost
 */

import { resolve } from 'node:path';

import type { Context } from '@deepseek-ai/cordis';

import { Cost } from './cost.js';
import { registerCostRoutes } from './routes.js';

/** Display metadata; labels this plugin in Cordis diagnostics. */
export const name = 'dsh-cost-track';

/** The cost service surface. */
export interface CostService {
  record(model: string, promptTokens: number, completionTokens: number, sessionId: string): void;
  summary(): ReturnType<Cost['summary']>;
  isBlocked(): boolean;
  setBudget(monthly?: number, enforce?: boolean): ReturnType<Cost['setBudget']>;
}

/**
 * Register the plugin's contributions.
 *
 * @param ctx - the Cordis context this plugin contributes to.
 */
export function apply(ctx: Context): void {
  const root = resolve(process.cwd());
  const cost = new Cost(root);

  const service = {
    record: (model: string, promptTokens: number, completionTokens: number, sessionId: string) =>
      cost.record(model, promptTokens, completionTokens, sessionId),
    summary: () => cost.summary(),
    isBlocked: () => cost.isBlocked(),
    setBudget: (monthly?: number, enforce?: boolean) => cost.setBudget(monthly, enforce),
  } satisfies CostService;

  ctx.provide('cost', service);

  registerCostRoutes(ctx, service);
}
