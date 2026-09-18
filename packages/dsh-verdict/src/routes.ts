/**
 * Host route serving the panel to the browser half.
 *
 * The browser settings page cannot reach the filesystem; everything it renders
 * arrives through this one GET route. The payload is always re-derived from
 * disk at request time — the panel must show the project as it is now, never a
 * cached claim about how it was.
 *
 * A host that has no web connection (a headless dsh run) simply has no panel:
 * the plugin still loads, the CLI still works, and nothing else changes.
 *
 * @module verdict/routes
 */

import type { Context } from '@deepseek-ai/cordis'

import type { Verdict } from './index.js'
import { VERDICT_PANEL_PATH, VERDICT_SKILLS_WRITE_PATH } from './verdict-view.js'

export { VERDICT_PANEL_PATH, VERDICT_SKILLS_WRITE_PATH }

/**
 * Connection's fetch-route slice, typed locally rather than importing the
 * host-only connection package: the plugin declares no runtime dependency on
 * it and only touches this one shape.
 */
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

/**
 * Everything the panel renders, in one payload.
 *
 * Kept as an explicit function over the service rather than reading the
 * filesystem here, so the CLI and the wire serve exactly the same derivation.
 */
export function buildPanelPayload(verdict: Pick<Verdict, 'panel' | 'rows' | 'diff' | 'skills'>): {
  counts: ReturnType<Verdict['panel']>['counts']
  rows: ReturnType<Verdict['rows']>['rows']
  violated: string[]
  broken: string[]
  unhomed: string[]
  sessions: ReturnType<Verdict['panel']>['sessions']
  skills: ReturnType<Verdict['skills']>
  comparison: ReturnType<Verdict['diff']>
} {
  const panel = verdict.panel()
  return {
    counts: panel.counts,
    rows: verdict.rows().rows,
    violated: panel.violated,
    broken: panel.broken,
    unhomed: panel.unhomed,
    sessions: panel.sessions,
    skills: verdict.skills(),
    comparison: verdict.diff(),
  }
}

/**
 * Register the panel route when the host carries the web connection.
 * @param ctx - the Cordis context this plugin contributes to.
 * @param verdict - the plugin's service, already provided on `ctx`.
 */
export function registerVerdictRoutes(ctx: Context, verdict: Verdict): void {
  // Optional on purpose: dsh hosts without the web client have no fetch
  // registry, and a panel is the last thing worth failing a load over.
  const connection = (ctx as unknown as { connection?: FetchRegistrar }).connection
  if (connection === undefined) return
  connection.fetch.register({
    path: VERDICT_PANEL_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: () => Promise.resolve(Response.json(buildPanelPayload(verdict), {
      headers: { 'cache-control': 'no-store' },
    })),
  })
  // Writing a skill is the one write the panel offers, and the response carries the
  // verification result: a written-but-unverifiable skill is reported as such.
  connection.fetch.register({
    path: VERDICT_SKILLS_WRITE_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request: Request) => {
      let key = ''
      try {
        key = String(((await request.json()) as { key?: unknown }).key ?? '')
      } catch {
        return Response.json({ error: 'request body must be JSON: { "key": string }' }, { status: 400 })
      }
      const written = verdict.writeSkillByKey(key)
      if (written === undefined) {
        return Response.json({ error: `no skill candidate with key ${key}` }, { status: 404 })
      }
      return Response.json(written, { headers: { 'cache-control': 'no-store' } })
    },
  })
}
