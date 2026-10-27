/**
 * Host half of dsh-context-meter.
 *
 * One session-scoped read face over the session projections that `@deepseek-ai/dsh-token-meter`
 * registers (`contextPressure`, `contextBreakdown`, `tokenUsage`). The plugin computes nothing:
 * every figure is the projection's own fold, and a host without token-meter reports the key as
 * absent instead of estimating on its own.
 *
 * `inject` stays empty on purpose — see PLUGIN-CONTRACT 4.1. The registry, the web connection,
 * and the tool registry are all optional capabilities taken through `ctx.inject`, so a headless
 * host still runs the service and only loses the panel and the tool.
 *
 * @module context-meter/index
 */

import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'

import { registerMeterRoutes } from './routes.js'
import { registerMeterTool } from './tools.js'

export const name = 'dsh-context-meter'

export const inject: string[] = []

/** Projection keys this panel reads; all registered by @deepseek-ai/dsh-token-meter. */
export const METER_KEYS = ['contextPressure', 'contextBreakdown', 'tokenUsage'] as const

export type MeterKey = (typeof METER_KEYS)[number]

/** One session's meter snapshot as served to the panel and the tool. */
export interface MeterPanel {
  /** The session this snapshot describes. */
  sessionId: string
  /** Epoch milliseconds when the snapshot was taken. */
  takenAt: number
  readonly pressure: PanelPressure | undefined
  readonly breakdown: PanelBreakdown | undefined
  readonly usage: PanelUsage | undefined
}

export interface PanelPressure {
  pressureTokens?: number
  projectedTokens?: number
  contextWindow?: number
}

export interface PanelBreakdown {
  systemTokens: number
  toolsTokens: number
  messageTokens: number
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
    // Optional dependency: token-meter registers the keys this panel reads. A host without it
    // keeps the plugin alive and every read reports the keys as absent.
    try {
      this.projections = (ctx as unknown as { sessionProjections?: ProjectionsSurface }).sessionProjections
    } catch {
      this.projections = undefined
    }
  }

  /**
   * Read the newest session's meter snapshot. Whole-value projection reads are synchronous;
   * the panel route calls this per request so the display never trails the live log.
   */
  panel(): MeterPanel {
    const sessions = (this.ctx as unknown as { sessions?: SessionsSurface }).sessions
    const list = sessions?.list() ?? []
    const newest = list.length === 0 ? undefined : list[list.length - 1]
    if (newest === undefined) {
      return { sessionId: '', takenAt: Date.now(), pressure: undefined, breakdown: undefined, usage: undefined }
    }
    return this.panelFor(newest.id)
  }

  /** Read one session's meter snapshot by id. */
  panelFor(sessionId: string): MeterPanel {
    const sessions = (this.ctx as unknown as { sessions?: SessionsSurface }).sessions
    const list = sessions?.list() ?? []
    const session = list.find((entry: { id: string }) => entry.id === sessionId)
    const empty: MeterPanel = { sessionId, takenAt: Date.now(), pressure: undefined, breakdown: undefined, usage: undefined }
    if (session === undefined || this.projections === undefined) return empty
    const snapshot = this.projections.snapshot(session, [...METER_KEYS])
    return {
      sessionId,
      takenAt: Date.now(),
      pressure: snapshot.values.contextPressure as PanelPressure | undefined,
      breakdown: snapshot.values.contextBreakdown as PanelBreakdown | undefined,
      usage: snapshot.values.tokenUsage as PanelUsage | undefined,
    }
  }

  /**
   * Occupancy ratio of the projected next-request size against the newest known route capacity.
   * Absent figures yield `undefined` — the panel renders "no data" instead of guessing.
   */
  occupancyFor(sessionId: string): number | undefined {
    const { pressure } = this.panelFor(sessionId)
    const projected = pressure?.projectedTokens ?? pressure?.pressureTokens
    const window = pressure?.contextWindow
    if (projected === undefined || window === undefined || window <= 0) return undefined
    return projected / window
  }
}

export default ContextMeter

export function apply(ctx: Context): void {
  const meter = new ContextMeter(ctx)
  ctx.provide('contextMeter', meter)
  registerMeterRoutes(ctx, meter)
  registerMeterTool(ctx, meter)
}
