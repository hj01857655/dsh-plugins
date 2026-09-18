/**
 * Pure rendering half of the stepTrace page.
 *
 * Separate from `index.tsx` so a static render can assert in Node what the page draws —
 * the shipped bundle is a loader factory only a browser can run. Every user-visible
 * string comes from the `t` seat the renderer binds from this plugin's namespace, so the
 * page follows the UI language; no copy is hardcoded here.
 *
 * @module client/view
 */

import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

import type { PanelPayload } from '../types.js'

/** The translate seat the renderer binds from this plugin's locale namespace. */
export type Translate = (key: string, params?: Record<string, unknown>) => string

export interface PanelProps {
  /** Bound translate function for this plugin's namespace. */
  t: Translate
}

/** Panel route registered by the host half on the web connection. */
const PANEL_PATH = "/api/replay.panel"

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760, fontFamily: 'inherit' }
const head: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }
const muted: CSSProperties = { fontSize: 12, opacity: 0.75 }
const table: CSSProperties = { borderCollapse: 'collapse', width: '100%' }
const th: CSSProperties = { textAlign: 'left', padding: '4px 10px 4px 0', fontWeight: 600, fontSize: 12, opacity: 0.8, borderBottom: '0.5px solid rgba(128,128,128,0.4)' }
const td: CSSProperties = { padding: '6px 10px 6px 0', fontSize: 13, borderBottom: '0.5px solid rgba(128,128,128,0.18)' }

interface PanelState {
  payload: PanelPayload | null
  error: string | null
}

/** Fetch the host panel payload; `reload` re-runs the request. */
export function usePanel(): PanelState & { reload: () => void } {
  const [state, setState] = useState<PanelState>({ payload: null, error: null })
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    setState((previous) => ({ ...previous, error: null }))
    fetch(PANEL_PATH, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.json() as Promise<PanelPayload>
      })
      .then((payload) => {
        if (!controller.signal.aborted) setState({ payload, error: null })
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setState({ payload: null, error: cause instanceof Error ? cause.message : String(cause) })
      })
    return () => controller.abort()
  }, [tick])

  return { ...state, reload }
}

export function StepTracePanel({ t }: PanelProps) {
  const { payload, error, reload } = usePanel()
  const header = (
    <header style={head}>
      <strong style={{ fontSize: 13 }}>{t('title')}</strong>
      <span style={{ flex: 1 }} />
      <button type="button" onClick={reload} style={{ fontSize: 12 }}>{t('refresh')}</button>
    </header>
  )
  if (error !== null) {
    return (
      <div style={wrap}>
        {header}
        <p role="alert" style={{ margin: 0, fontSize: 13 }}>{t('failed')}: {error}</p>
        <button type="button" onClick={reload} style={{ alignSelf: 'flex-start', fontSize: 12 }}>{t('retry')}</button>
      </div>
    )
  }
  if (payload === null) return <p style={muted} aria-live="polite">{t('loading')}</p>
  return (
    <div style={wrap}>
      {header}
      {payload.sessions.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>{t('empty')}</p>
      ) : (
        <table style={table}>
          <thead>
            <tr><th style={th}>{t('session')}</th><th style={th}>{t('steps')}</th><th style={th}>{t('date')}</th></tr>
          </thead>
          <tbody>
            {payload.sessions.map((row) => (
              <tr key={row.sessionId}>
                <td style={td}><code style={{ fontSize: 11 }}>{row.sessionId}</code></td>
                <td style={td}>{row.stepCount}</td>
                <td style={td}>{new Date(row.timestamp).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
