/**
 * Pure rendering for the Context meter page.
 *
 * Presentational only: figures arrive from the host route; the component formats and
 * colors them. All visible copy goes through `t` so language switching re-renders.
 *
 * @module client/view
 */

import type { PanelBreakdown, PanelPressure, PanelUsage } from '../index.js'

export interface MeterPanelDto {
  sessionId: string
  takenAt: number
  pressure?: PanelPressure
  breakdown?: PanelBreakdown
  usage?: PanelUsage
}

export type Translate = (key: keyof typeof import('./locales.js').zh) => string

function formatTokens(n: number | undefined): string {
  if (n === undefined) return '—'
  return n.toLocaleString('en-US')
}

function formatPercent(ratio: number | undefined): string {
  if (ratio === undefined) return '—'
  return `${Math.round(ratio * 100)}%`
}

function occupancyRatio(pressure: PanelPressure | undefined): number | undefined {
  const projected = pressure?.projectedTokens ?? pressure?.pressureTokens
  const window = pressure?.contextWindow
  if (projected === undefined || window === undefined || window <= 0) return undefined
  return projected / window
}

function bandClass(ratio: number | undefined): string {
  if (ratio === undefined) return 'rt-meter-band none'
  if (ratio >= 0.85) return 'rt-meter-band danger'
  if (ratio >= 0.6) return 'rt-meter-band warn'
  return 'rt-meter-band safe'
}

function bandLabel(ratio: number | undefined, t: Translate): string {
  if (ratio === undefined) return ''
  if (ratio >= 0.85) return t('danger')
  if (ratio >= 0.6) return t('warn')
  return t('safe')
}

export function ContextMeterPanel({ panel, t }: { panel: MeterPanelDto | undefined; t: Translate }) {
  if (panel === undefined) {
    return <div className="rt-meter-empty">{t('noSessions')}</div>
  }
  const hasData = panel.pressure !== undefined || panel.breakdown !== undefined || panel.usage !== undefined
  if (!hasData) {
    return <div className="rt-meter-empty">{t('noData')}</div>
  }
  const ratio = occupancyRatio(panel.pressure)
  const pct = ratio === undefined ? undefined : Math.min(ratio, 1) * 100
  return (
    <div className="rt-meter">
      <div className="rt-meter-occupancy">
        <div className="rt-meter-row">
          <span className="rt-meter-label">{t('occupancy')}</span>
          <span className="rt-meter-value">{formatPercent(ratio)} {bandLabel(ratio, t)}</span>
        </div>
        <div className={bandClass(ratio)}>
          {pct !== undefined ? <div className="rt-meter-fill" style={{ width: `${pct}%` }} /> : null}
        </div>
        <div className="rt-meter-row">
          <span>{t('window')}: {formatTokens(panel.pressure?.contextWindow)}</span>
          <span>{t('pressure')}: {formatTokens(panel.pressure?.pressureTokens)}</span>
          <span>{t('projected')}: {formatTokens(panel.pressure?.projectedTokens ?? panel.pressure?.pressureTokens)}</span>
        </div>
      </div>

      {panel.breakdown !== undefined ? (
        <div className="rt-meter-section">
          <h3>{t('breakdown')}</h3>
          <table className="rt-meter-table">
            <tbody>
              <tr><td>{t('system')}</td><td>{formatTokens(panel.breakdown.systemTokens)}</td></tr>
              <tr><td>{t('tools')}</td><td>{formatTokens(panel.breakdown.toolsTokens)}</td></tr>
              <tr><td>{t('messages')}</td><td>{formatTokens(panel.breakdown.messageTokens)}</td></tr>
            </tbody>
          </table>
        </div>
      ) : null}

      {panel.usage !== undefined ? (
        <div className="rt-meter-section">
          <h3>{t('usage')}</h3>
          <table className="rt-meter-table">
            <tbody>
              <tr><td>{t('uncachedInput')}</td><td>{formatTokens(panel.usage.uncachedInputTokens)}</td></tr>
              <tr><td>{t('output')}</td><td>{formatTokens(panel.usage.outputTokens)}</td></tr>
              <tr><td>{t('cacheRead')}</td><td>{formatTokens(panel.usage.cacheReadTokens)}</td></tr>
              <tr><td>{t('cacheWrite')}</td><td>{formatTokens(panel.usage.cacheWriteTokens)}</td></tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
