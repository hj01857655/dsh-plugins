/**
 * Host half of dsh-theme-studio.
 *
 * Client-side plugin with one host duty: the theme-market route. The route is
 * registered only when a web connection exists (headless hosts skip it), and
 * everything else — preferences, custom themes, the panel — lives in the
 * browser half's localStorage and publishes through `ctx.theme`.
 *
 * @module index
 */

import type { Context } from '@deepseek-ai/cordis'

import { registerMarketRoute } from './routes.js'

export function apply(ctx: Context): void {
  registerMarketRoute(ctx)
}
