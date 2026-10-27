/**
 * Host routes for the panel.
 *
 * Registered on the host's web connection when one exists. A headless host simply skips
 * registration and every other part of the plugin keeps working — the panel is a view of
 * projections, not a precondition for keeping them.
 *
 * @module context-meter/routes
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ContextMeter } from './index.js'

/** Panel paths, shared with the browser half so the two cannot drift apart. */
export const METER_PANEL_PATH = '/api/context-meter.panel'
export const METER_SESSION_PATH = '/api/context-meter.session'

interface FetchRegistrar {
  fetch: {
    register(route: {
      path: string
      methods: readonly string[]
      requestBody: string
      fetch: (request: Request) => Promise<Response>
    }): void
  }
}

export function registerMeterRoutes(ctx: Context, meter: ContextMeter): void {
  // Injecting rather than reading `ctx.connection` directly: a plain property access on
  // a service that was not declared throws, and the web connection is absent in headless
  // hosts anyway.
  ctx.inject(['connection'], (connectionCtx: unknown) => {
    const connection = (connectionCtx as { connection: FetchRegistrar }).connection

    connection.fetch.register({
      path: METER_PANEL_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      // Recomputed on every request: the projection fold is synchronous and cheap, and the
      // panel must show the live log, not a startup-time stale copy.
      fetch: () => Promise.resolve(Response.json(meter.panel(), { headers: { 'cache-control': 'no-store' } })),
    })

    connection.fetch.register({
      path: METER_SESSION_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: (request: Request) => {
        const url = new URL(request.url)
        const sessionId = url.searchParams.get('sessionId') ?? ''
        const panel = sessionId === '' ? meter.panel() : meter.panelFor(sessionId)
        return Promise.resolve(Response.json(panel, { headers: { 'cache-control': 'no-store' } }))
      },
    })
  })
}
