/**
 * Model-facing tool: lets the agent read its own context usage mid-turn.
 *
 * Registered through `ctx.inject(['tools'])` so a host without a tool registry loses only
 * this tool, not the plugin. Reads the same projections as the panel — one source of truth
 * for both the human and the model. Deliberately excludes the breakdown table: the official
 * composer meter already shows composition to the human.
 *
 * @module context-meter/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ContextMeter, MeterRow } from './index.js'

/** Minimal structural type of the host tool registry this plugin registers into. */
interface ToolsRegistrar {
  register(tool: {
    name: string
    description: string
    parameters: Record<string, unknown>
    execute(args: Record<string, unknown>): Promise<string>
  }): void
}

/** Shape one row for the model: short, factual, no invented figures. */
function renderRow(row: MeterRow): string {
  if (row.pressure === undefined) {
    return JSON.stringify({ ok: false, reason: 'token-meter not mounted: no contextPressure projection' }, null, 2)
  }
  const { pressureTokens, projectedTokens, contextWindow } = row.pressure
  const projected = projectedTokens ?? pressureTokens
  const occupancy = projected !== undefined && contextWindow !== undefined && contextWindow > 0
    ? Math.round((projected / contextWindow) * 100)
    : undefined
  return JSON.stringify({
    ok: true,
    sessionId: row.sessionId,
    route: row.route,
    contextWindow,
    pressureTokens,
    projectedTokens,
    occupancyPercent: occupancy,
    usage: row.usage,
  }, null, 2)
}

export function registerMeterTool(ctx: Context, meter: ContextMeter): void {
  ctx.inject(['tools'], (toolsCtx: unknown) => {
    const tools = (toolsCtx as { tools: ToolsRegistrar }).tools
    tools.register({
      name: 'context_meter',
      description: '读取当前会话的上下文用量：模型路由、窗口大小、下一请求预估 token、占用百分比、累计用量四桶（未缓存输入/输出/缓存读/缓存写）。长会话中判断是否接近压缩阈值、或向用户汇报本会话成本时使用。',
      parameters: {
        sessionId: {
          type: 'string',
          description: '可选：目标会话 id。省略时读最新会话。',
        },
      },
      async execute(args) {
        const sessionId = typeof args.sessionId === 'string' && args.sessionId !== ''
          ? args.sessionId
          : (meter.rows()[0]?.sessionId ?? '')
        if (sessionId === '') {
          return JSON.stringify({ ok: false, reason: 'no sessions exist yet' }, null, 2)
        }
        return renderRow(meter.rowFor(sessionId))
      },
    })
  })
}
