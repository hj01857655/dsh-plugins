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

import type { PanelPayload, TraceStep } from '../types.js'

export type Translate = (key: string, params?: Record<string, unknown>) => string

export interface PanelProps {
  t: Translate
}

const PANEL_PATH = '/api/replay.panel'
const TRACE_PATH = '/api/replay.trace'
const BRANCH_PATH = '/api/replay.branch'
const DELETE_PATH = '/api/replay.delete'

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 820, fontFamily: 'inherit' }
const head: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }
const muted: CSSProperties = { fontSize: 12, opacity: 0.75 }
const table: CSSProperties = { borderCollapse: 'collapse', width: '100%' }
const th: CSSProperties = { textAlign: 'left', padding: '4px 10px 4px 0', fontWeight: 600, fontSize: 12, opacity: 0.8, borderBottom: '0.5px solid rgba(128,128,128,0.4)' }
const td: CSSProperties = { padding: '6px 10px 6px 0', fontSize: 13, borderBottom: '0.5px solid rgba(128,128,128,0.18)' }
const card: CSSProperties = { padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(128,128,128,0.2)', fontSize: 13 }
const btn: CSSProperties = { fontSize: 12, cursor: 'pointer', padding: '3px 10px', borderRadius: 4, border: '0.5px solid rgba(128,128,128,0.4)' }
const dangerBtn: CSSProperties = { ...btn, color: '#e55', borderColor: '#e55' }
const preBlock: CSSProperties = { whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, maxHeight: 150, overflow: 'auto', padding: 8, borderRadius: 4, background: 'rgba(128,128,128,0.06)', border: '1px solid rgba(128,128,128,0.15)' }
const clickRow: CSSProperties = { cursor: 'pointer' }
const statRow: CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap' }
const statBox: CSSProperties = { ...card, flex: 1, minWidth: 100, textAlign: 'center' as const }

interface PanelState {
  payload: PanelPayload | null
  error: string | null
}

export function usePanel(): PanelState & { reload: () => void } {
  const [state, setState] = useState<PanelState>({ payload: null, error: null })
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((v) => v + 1), [])
  useEffect(() => {
    const c = new AbortController()
    setState((p) => ({ ...p, error: null }))
    fetch(PANEL_PATH, { signal: c.signal })
      .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<PanelPayload> })
      .then((payload) => { if (!c.signal.aborted) setState({ payload, error: null }) })
      .catch((e: unknown) => { if (!c.signal.aborted) setState({ payload: null, error: e instanceof Error ? e.message : String(e) }) })
    return () => c.abort()
  }, [tick])
  return { ...state, reload }
}

// --- Session trace expansion ---
function SessionTrace({ sessionId, t, onBranch, onDelete }: { sessionId: string; t: Translate; onBranch: (stepIndex: number) => void; onDelete: () => void }) {
  const [steps, setSteps] = useState<TraceStep[] | null>(null)
  const [expandedStep, setExpandedStep] = useState<number | null>(null)

  useEffect(() => {
    fetch(`${TRACE_PATH}?id=${sessionId}`)
      .then(async (r) => r.ok ? (await r.json()).steps as TraceStep[] : [])
      .then(setSteps)
      .catch(() => setSteps([]))
  }, [sessionId])

  const handleDelete = useCallback(async () => {
    if (!confirm(t('confirmDelete'))) return
    await fetch(DELETE_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId }) })
    onDelete()
  }, [sessionId, t, onDelete])

  if (steps === null) return <p style={muted}>{t('loading')}</p>
  return (
    <div style={{ ...card, marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 12 }}>{t('timeline')} ({steps.length} {t('steps')})</strong>
        <button type="button" style={dangerBtn} onClick={handleDelete}>🗑 {t('delete')}</button>
      </div>
      {steps.length === 0 ? (
        <p style={muted}>{t('noSteps')}</p>
      ) : (
        <table style={table}>
          <thead>
            <tr><th style={th} /><th style={th}>#</th><th style={th}>{t('type')}</th><th style={th}>{t('latency')}</th><th style={th}>{t('time')}</th><th style={th}>{t('actions')}</th></tr>
          </thead>
          <tbody>
            {steps.map((s, i) => (
              <>
                <tr key={i} style={clickRow} onClick={() => setExpandedStep(expandedStep === i ? null : i)}>
                  <td style={td}>{expandedStep === i ? '▼' : '▶'}</td>
                  <td style={td}>{s.step}</td>
                  <td style={td}>{s.type === 'model' ? '🤖' : '🔧'} {s.type}</td>
                  <td style={td}>{s.latencyMs}ms</td>
                  <td style={td}>{new Date(s.timestamp).toLocaleTimeString()}</td>
                  <td style={td}>
                    <button type="button" style={btn} onClick={(e) => { e.stopPropagation(); onBranch(i); }}>⎇ {t('branch')}</button>
                  </td>
                </tr>
                {expandedStep === i && (
                  <tr key={`${i}-detail`}>
                    <td colSpan={6} style={{ padding: '4px 0' }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 250 }}>
                          <strong style={{ fontSize: 12 }}>{t('input')}</strong>
                          <pre style={preBlock}>{JSON.stringify(s.input, null, 2).slice(0, 2000)}</pre>
                        </div>
                        <div style={{ flex: 1, minWidth: 250 }}>
                          <strong style={{ fontSize: 12 }}>{t('output')}</strong>
                          <pre style={preBlock}>{JSON.stringify(s.output, null, 2).slice(0, 2000)}</pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function StepTracePanel({ t }: PanelProps) {
  const { payload, error, reload } = usePanel()
  const [expandedSession, setExpandedSession] = useState<string | null>(null)

  const handleBranch = useCallback(async (sessionId: string, stepIndex: number) => {
    const newId = `${sessionId}-branch-${Date.now().toString(36)}`
    await fetch(BRANCH_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, stepIndex, newSessionId: newId }),
    })
    reload()
  }, [reload])

  const header = (
    <header style={head}>
      <strong style={{ fontSize: 13 }}>🔍 {t('title')}</strong>
      <span style={{ flex: 1 }} />
      <button type="button" style={btn} onClick={reload}>{t('refresh')}</button>
    </header>
  )
  if (error !== null) {
    return (
      <div style={wrap}>
        {header}
        <p role="alert" style={{ margin: 0, fontSize: 13 }}>{t('failed')}: {error}</p>
        <button type="button" onClick={reload} style={{ ...btn, alignSelf: 'flex-start' }}>{t('retry')}</button>
      </div>
    )
  }
  if (payload === null) return <p style={muted} aria-live="polite">{t('loading')}</p>
  return (
    <div style={wrap}>
      {header}

      {/* Overview */}
      <div style={statRow}>
        <div style={statBox}><div style={{ fontSize: 18, fontWeight: 700 }}>{payload.overview.totalSessions}</div><div style={muted}>{t('totalSessions')}</div></div>
        <div style={statBox}><div style={{ fontSize: 18, fontWeight: 700 }}>{payload.overview.totalSteps}</div><div style={muted}>{t('totalSteps')}</div></div>
        <div style={statBox}><div style={{ fontSize: 18, fontWeight: 700 }}>{payload.overview.avgStepsPerSession}</div><div style={muted}>{t('avgSteps')}</div></div>
        <div style={statBox}><div style={{ fontSize: 14, fontWeight: 600 }}>{(payload.overview.totalLatencyMs / 1000).toFixed(1)}s</div><div style={muted}>{t('totalLatency')}</div></div>
      </div>

      {/* Sessions */}
      {payload.sessions.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>{t('empty')}</p>
      ) : (
        <div>
          <strong style={{ fontSize: 13 }}>📋 {t('sessions')}</strong>
          <table style={{ ...table, marginTop: 4 }}>
            <thead>
              <tr>
                <th style={th} /><th style={th}>{t('session')}</th><th style={th}>{t('steps')}</th>
                <th style={th}>{t('model')}</th><th style={th}>{t('tool')}</th><th style={th}>{t('date')}</th>
              </tr>
            </thead>
            <tbody>
              {payload.sessions.map((row) => (
                <>
                  <tr key={row.sessionId} style={clickRow} onClick={() => setExpandedSession(expandedSession === row.sessionId ? null : row.sessionId)}>
                    <td style={td}>{expandedSession === row.sessionId ? '▼' : '▶'}</td>
                    <td style={td}><code style={{ fontSize: 11 }}>{row.sessionId}</code></td>
                    <td style={td}>{row.stepCount}</td>
                    <td style={td}>🤖 {row.modelSteps}</td>
                    <td style={td}>🔧 {row.toolSteps}</td>
                    <td style={td}>{new Date(row.timestamp).toLocaleString()}</td>
                  </tr>
                  {expandedSession === row.sessionId && (
                    <tr key={`${row.sessionId}-trace`}>
                      <td colSpan={6} style={{ padding: '4px 0' }}>
                        <SessionTrace
                          sessionId={row.sessionId}
                          t={t}
                          onBranch={(i) => handleBranch(row.sessionId, i)}
                          onDelete={() => { setExpandedSession(null); reload() }}
                        />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
