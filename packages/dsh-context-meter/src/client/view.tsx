/**
 * Pure rendering for the session usage comparison table.
 *
 * Presentational only: rows arrive from the host route; the component formats and
 * colors them. The occupancy RING and breakdown composition are intentionally absent —
 * the official composer ContextMeter owns that view; this page covers cross-session
 * comparison, cumulative usage, and model routes.
 *
 * @module client/view
 */

export interface MeterRowDto {
  sessionId: string
  title: string | null
  pressure?: {
    pressureTokens?: number
    projectedTokens?: number
    contextWindow?: number
  }
  usage?: {
    uncachedInputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
  }
  route?: { provider: string; model: string }
}

export type Translate = (key: keyof typeof import('./locales.js').zh) => string

function formatTokens(n: number | undefined): string {
  if (n === undefined) return '—'
  return n.toLocaleString('en-US')
}

function occupancyClass(row: MeterRowDto): string {
  const projected = row.pressure?.projectedTokens ?? row.pressure?.pressureTokens
  const window = row.pressure?.contextWindow
  if (projected === undefined || window === undefined || window <= 0) return 'rt-usage-none'
  const ratio = projected / window
  if (ratio >= 0.85) return 'rt-usage-danger'
  if (ratio >= 0.6) return 'rt-usage-warn'
  return 'rt-usage-safe'
}

function occupancyText(row: MeterRowDto): string {
  const projected = row.pressure?.projectedTokens ?? row.pressure?.pressureTokens
  const window = row.pressure?.contextWindow
  if (projected === undefined || window === undefined || window <= 0) return '—'
  return `${Math.round((projected / window) * 100)}%`
}

export function SessionUsageTable({ rows, t }: { rows: MeterRowDto[] | undefined; t: Translate }) {
  if (rows === undefined) {
    return <div className="rt-usage-empty">{t('noSessions')}</div>
  }
  if (rows.length === 0) {
    return <div className="rt-usage-empty">{t('noSessions')}</div>
  }
  return (
    <table className="rt-usage-table">
      <thead>
        <tr>
          <th>{t('session')}</th>
          <th>{t('route')}</th>
          <th>{t('window')}</th>
          <th>{t('projected')}</th>
          <th>{t('occupancy')}</th>
          <th>{t('uncachedInput')}</th>
          <th>{t('output')}</th>
          <th>{t('cacheRead')}</th>
          <th>{t('cacheWrite')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.sessionId} className={occupancyClass(row)}>
            <td className="rt-usage-session" title={row.sessionId}>{row.title ?? t('untitled')}</td>
            <td className="rt-usage-route">{row.route ? `${row.route.provider}/${row.route.model}` : '—'}</td>
            <td>{formatTokens(row.pressure?.contextWindow)}</td>
            <td>{formatTokens(row.pressure?.projectedTokens ?? row.pressure?.pressureTokens)}</td>
            <td>{occupancyText(row)}</td>
            <td>{formatTokens(row.usage?.uncachedInputTokens)}</td>
            <td>{formatTokens(row.usage?.outputTokens)}</td>
            <td>{formatTokens(row.usage?.cacheReadTokens)}</td>
            <td>{formatTokens(row.usage?.cacheWriteTokens)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
