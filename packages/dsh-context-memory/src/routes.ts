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
export const MEMORY_RECALL_PATH = '/api/context-memory.recall'
export const MEMORY_REMEMBER_PATH = '/api/context-memory.remember'
export const MEMORY_FORGET_PATH = '/api/context-memory.forget'
export const MEMORY_PREFS_PATH = '/api/context-memory.prefs'

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
          headers: { 'cache-control': 'no-store' },
        })
      },
    })

    // Recall (search) — GET with query param
    connection.fetch.register({
      path: MEMORY_RECALL_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (request: Request) => {
        const url = new URL(request.url)
        const query = url.searchParams.get('q') ?? ''
        const limit = Number(url.searchParams.get('limit') ?? '10')
        const hits = memory.recall(query, limit)
        return Response.json({ hits }, { headers: { 'cache-control': 'no-store' } })
      },
    })

    // Remember (add) — POST with body
    connection.fetch.register({
      path: MEMORY_REMEMBER_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request: Request) => {
        let body: { text?: string; subject?: string; kind?: string; source?: string }
        try { body = await request.json() } catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }) }
        if (!body.text) return Response.json({ error: 'missing text' }, { status: 400 })
        const input: { text: string; subject?: string; kind?: 'fact' | 'decision' | 'preference' | 'pitfall'; source?: 'user' | 'agent' | 'plugin' } = { text: body.text }
        if (body.subject) input.subject = body.subject
        if (body.kind) input.kind = body.kind as 'fact' | 'decision' | 'preference' | 'pitfall'
        if (body.source) input.source = body.source as 'user' | 'agent' | 'plugin'
        const mem = memory.remember(input)
        return Response.json(mem)
      },
    })

    // Forget (supersede) — POST with id + reason
    connection.fetch.register({
      path: MEMORY_FORGET_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request: Request) => {
        let body: { id?: string; reason?: string; replacedBy?: string }
        try { body = await request.json() } catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }) }
        if (!body.id) return Response.json({ error: 'missing id' }, { status: 400 })
        const ok = memory.forget(body.id, body.reason ?? 'superseded from panel', body.replacedBy)
        if (!ok) return Response.json({ error: 'not found' }, { status: 404 })
        return Response.json({ ok: true })
      },
    })

    // Feature switches — GET to read, POST a partial patch to set
    connection.fetch.register({
      path: MEMORY_PREFS_PATH,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: async (request: Request) => {
        if (request.method === 'POST') {
          let body: { autoCapture?: boolean; recallInject?: boolean }
          try { body = await request.json() } catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }) }
          return Response.json(memory.setPrefs(body), { headers: { 'cache-control': 'no-store' } })
        }
        return Response.json(memory.prefs(), { headers: { 'cache-control': 'no-store' } })
      },
    })
  })
}
