/**
 * Host routes for the panel.
 *
 * Registered on the host's web connection when one exists. A host running headless
 * simply skips registration and every other part of the plugin keeps working — the
 * panel is a view of the log, not a precondition for keeping it.
 *
 * @module context-memory/routes
 */

import type { Context } from '@deepseek-ai/cordis'

import type { MemoryService } from './index.js'

/** The panel path, shared with the browser half so the two cannot drift apart. */
export const MEMORY_PANEL_PATH = '/api/context-memory.panel'

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

export function registerMemoryRoutes(ctx: Context, memory: MemoryService): void {
  // Injecting rather than reading `ctx.connection` directly: a plain property access on
  // a service that was not declared throws, and the web connection is absent in headless
  // hosts anyway.
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = (connectionCtx as unknown as { connection: FetchRegistrar }).connection

    connection.fetch.register({
      path: MEMORY_PANEL_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      // Rebuilt from the log on every request: the panel must show the file's state,
      // not whatever was in memory when the host started.
      fetch: () => Promise.resolve(Response.json(memory.panel(), { headers: { 'cache-control': 'no-store' } })),
    })

    connection.fetch.register({
      path: '/api/context-memory.verify',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async () => {
        const summary = memory.verify()
        return Response.json(summary, {
          // The verification is the answer, not an error: a violated memory is reported
          // with 200 and the caller decides what it means. Only a broken guard is a
          // defect in the request path itself, and that is reported in the payload.
          headers: { 'cache-control': 'no-store' },
        })
      },
    })
  })
}
