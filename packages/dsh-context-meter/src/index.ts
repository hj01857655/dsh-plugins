/**
 * Host half of dsh-context-meter.
 *
 * Three capabilities the official composer ContextMeter does not provide:
 *
 * 1. Cross-session comparison — any session by id, not only the one behind the
 *    composer's input bar.
 * 2. Cumulative usage — the four disjoint `tokenUsage` buckets (uncached input,
 *    output, cache read, cache write), which the composer surface does not show.
 * 3. The `context_meter` model tool — the agent reads its own pressure mid-turn.
 *
 * The plugin computes no figures: pressure, breakdown, and usage are the
 * session-projection folds registered by `@deepseek-ai/dsh-token-meter`; the
 * model route is a last-wins fold over `request/header` log events. A host
 * without token-meter reports the keys as absent instead of estimating.
 *
 * `inject` stays empty on purpose — see PLUGIN-CONTRACT 4.1. The registry, the
 * web connection, and the tool registry are optional capabilities taken through
 * `ctx.inject`, so a headless host still runs the service and only loses the
 * panel and the tool.
 *
 * @module context-meter/index
 */

import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'

import { registerMeterRoutes } from './routes.js'
import { registerMeterTool } from './tools.js'

export const name = 'dsh-context-meter'

export const inject: string[] = []

/** Projection keys read from @deepseek-ai/dsh-token-meter. */
export const METER_KEYS = ['contextPressure', 'contextBreakdown', 'tokenUsage', 'title'] as const

export type MeterKey = (typeof METER_KEYS)[number]

/** One session's row in the cross-session comparison table. */
export interface MeterRow {
  sessionId: string
  /** Latest logged session title; null when the session has none. */
  title: string | null
  pressure: PanelPressure | undefined
  usage: PanelUsage | undefined
  /** Last-wins provider/model route folded from request/header events. */
  route: { provider: string; model: string } | undefined
}

export interface PanelPressure {
  pressureTokens?: number
  projectedTokens?: number
  contextWindow?: number
}

export interface PanelUsage {
  uncachedInputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** Minimal surface of `ctx.sessions` this plugin reads. */
interface SessionsSurface {
  list(): Array<{ id: string; seq: number }>
  eventAt?(seq: number): { type: string; data?: { header?: { config?: { provider?: string; model?: string } } } } | undefined
}

/** Minimal surface of `ctx.sessionProjections` this plugin reads. */
interface ProjectionsSurface {
  snapshot(
    session: unknown,
    keys?: readonly string[],
  ): { asOfSeq: number; values: Record<string, unknown> }
}

export class ContextMeter extends Service {
  static inject = ['sessions']

  private readonly projections: ProjectionsSurface | undefined

  constructor(ctx: Context) {
    super(ctx, 'contextMeter')
    // Optional dependency: token-meter registers the keys this panel reads. A host without
    // it keeps the plugin alive and every read reports the keys as absent.
    try {
      this.projections = (ctx as unknown as { sessionProjections?: ProjectionsSurface }).sessionProjections
    } catch {
      this.projections = undefined
    }
  }

  /**
   * Read every live session's meter row, newest first. Projection reads are
   * synchronous whole-value folds; the panel route calls this per request so
   * the table never trails the live log.
   */
  rows(): MeterRow[] {
    const sessions = (this.ctx as unknown as { sessions?: SessionsSurface }).sessions
    const list = [...(sessions?.list() ?? [])]
    list.reverse()
    return list.map((session) => this.rowFor(session.id, session))
  }

  /** Read one session's meter row by id; unknown ids yield a row with absent figures. */
  rowFor(sessionId: string, session?: { id: string; seq: number }): MeterRow {
    const sessions = (this.ctx as unknown as { sessions?: SessionsSurface }).sessions
    const resolved = session ?? sessions?.list().find((entry) => entry.id === sessionId)
    const empty: MeterRow = { sessionId, title: null, pressure: undefined, usage: undefined, route: undefined }
    if (resolved === undefined) return empty
    const snapshot = this.projections?.snapshot(resolved, [...METER_KEYS])
    const values = snapshot?.values ?? {}
    return {
      sessionId,
      title: typeof values.title === 'string' ? values.title : null,
      pressure: values.contextPressure as PanelPressure | undefined,
      usage: values.tokenUsage as PanelUsage | undefined,
      route: this.routeFold(resolved),
    }
  }

  /**
   * Last-wins provider/model fold over `request/header` events, newest first.
   * Reads only string fields through a local structural type, so no dsh-llm
   * peer is added for a display-only fold (PLUGIN-CONTRACT 3).
   */
  private routeFold(session: { id: string; seq: number }): { provider: string; model: string } | undefined {
    const sessions = (this.ctx as unknown as { sessions?: SessionsSurface }).sessions
    const eventAt = sessions?.eventAt?.bind(sessions)
    if (typeof eventAt !== 'function') return undefined
    for (let seq = session.seq - 1; seq >= 0; seq--) {
      const event = eventAt(seq)
      const provider = event?.data?.header?.config?.provider
      const model = event?.data?.header?.config?.model
      if (typeof provider === 'string' && provider !== '' && typeof model === 'string' && model !== '') {
        return { provider, model }
      }
    }
    return undefined
  }
}

export default ContextMeter

export function apply(ctx: Context): void {
  const meter = new ContextMeter(ctx)
  ctx.provide('contextMeter', meter)
  registerMeterRoutes(ctx, meter)
  registerMeterTool(ctx, meter)
}
