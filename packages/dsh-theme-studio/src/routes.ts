/**
 * Host route for the theme market.
 *
 * Registered on the host's web connection when one exists — the same pattern
 * dsh-context-memory uses. The host fetches the market index so the browser
 * half never faces CORS or a raw GitHub dependency; a headless host simply
 * skips registration and the panel hides the market instead of erroring.
 *
 * @module theme-studio/routes
 */

import type { Context } from '@deepseek-ai/cordis'

import { normalizeCustomThemeList } from './custom.js'

/** The panel path, shared with the browser half so the two cannot drift apart. */
export const MARKET_PATH = '/api/theme-studio.market'

/**
 * Where the market index lives. A JSON document of the shape
 * `{ "themes": [CustomTheme, ...] }` served from the plugin repo.
 */
const MARKET_INDEX_URL = 'https://raw.githubusercontent.com/hj01857655/dsh-plugins/main/themes/index.json'

/** Timeout for the upstream fetch — the market must never hang the panel. */
const MARKET_FETCH_TIMEOUT_MS = 10_000

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

/** The JSON the browser half reads. `error` is a short human-readable hint. */
interface MarketPayload {
  themes: unknown[]
  error?: string
}

export function registerMarketRoute(ctx: Context): void {
  // Injecting rather than reading `ctx.connection` directly: a plain property access on
  // a service that was not declared throws, and the web connection is absent in headless
  // hosts anyway.
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = (connectionCtx as unknown as { connection: FetchRegistrar }).connection

    connection.fetch.register({
      path: MARKET_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      // Fetched on every request rather than cached at startup: the index is
      // small, the panel opens rarely, and a stale cache would show themes
      // whose tarballs no longer exist.
      fetch: async () => {
        const payload = await loadMarketIndex()
        return Response.json(payload, { headers: { 'cache-control': 'no-store' } })
      },
    })
  })
}

/** Fetch, validate and shape the market index; never throws. */
async function loadMarketIndex(): Promise<MarketPayload> {
  try {
    const response = await fetch(MARKET_INDEX_URL, { signal: AbortSignal.timeout(MARKET_FETCH_TIMEOUT_MS) })
    if (!response.ok) {
      return { themes: [], error: `upstream ${response.status}` }
    }
    const data = (await response.json()) as { themes?: unknown }
    // Normalize host-side: the browser half receives only themes that already
    // passed the verified-token filter, so "install" cannot smuggle tokens.
    return { themes: normalizeCustomThemeList(data['themes']) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { themes: [], error: message }
  }
}
