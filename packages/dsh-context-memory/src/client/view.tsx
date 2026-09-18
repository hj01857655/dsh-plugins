/**
 * Pure rendering half of the contextMemory page.
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

import type { MemoryState, PanelPayload } from '../types.js'

/** The translate seat the renderer binds from this plugin's locale namespace. */
export type Translate = (key: string, params?: Record<string, unknown>) => string

export interface PanelProps {
  /** Bound translate function for this plugin's namespace. */
  t: Translate
}

/** Panel route registered by the host half on the web connection. */
const PANEL_PATH = "/api/context-memory.panel"

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760, fontFamily: 'inherit' }
const head: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }
const muted: CSSProperties = { fontSize: 12, opacity: 0.75 }
const table: CSSProperties = { borderCollapse: 'collapse', width: '100%' }
const th: CSSProperties = { textAlign: 'left', padding: '4px 10px 4px 0', fontWeight: 600, fontSize: 12, opacity: 0.8, borderBottom: '0.5px solid rgba(128,128,128,0.4)' }
const td: CSSProperties = { padding: '6px 10px 6px 0', fontSize: 13, borderBottom: '0.5px solid rgba(128,128,128,0.18)' }
const list: CSSProperties = { margin: 0, paddingLeft: 18, fontSize: 13 }

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

/**
 * A memory's verification label.
 *
 * Four states, not two, because "no check exists" and "the check could not run" are
 * different answers from "the check failed" — collapsing them would report an
 * unverifiable memory and a false one identically, which is the failure this plugin
 * exists to avoid.
 */
export function checkLabel(memory: MemoryState, t: Translate): string {
  if (!memory.guard) return t('checkNone')
  switch (memory.verification?.outcome) {
    case 'passed': return t('checkPassed')
    case 'violated': return t('checkViolated')
    case 'broken': return t('checkBroken')
    default: return t('checkPending')
  }
}

/** Where a memory came from: the answer to "why does the agent think it knows this". */
export function provenance(memory: MemoryState): string {
  return [
    memory.source,
    memory.sessionId !== undefined ? `session ${memory.sessionId}` : null,
    memory.step !== undefined ? `step ${String(memory.step)}` : null,
  ].filter((part) => part !== null).join(' · ')
}

export function ContextMemoryPanel({ t }: PanelProps) {
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
  const rows = (memories: MemoryState[]) => memories.map((memory) => (
    <tr key={memory.id}>
      <td style={td}><code style={{ fontSize: 11 }}>{memory.id}</code></td>
      <td style={td}>{memory.text}</td>
      <td style={td}>{memory.kind}</td>
      <td style={td}>{checkLabel(memory, t)}</td>
      <td style={td}>{provenance(memory)}</td>
    </tr>
  ))
  const { totals } = payload
  return (
    <div style={wrap}>
      {header}
      <span style={muted}>
        {t('active')} {totals.active} · {t('checkPassed')} {totals.verified} · {t('unverified')} {totals.unverified} · {t('superseded')} {totals.superseded}
      </span>
      <span style={muted}>{t('checkLegend')}</span>
      <strong style={{ fontSize: 13 }}>{t('conflicts')}</strong>
      {payload.conflicts.length === 0 ? (
        <span style={muted}>{t('noConflicts')}</span>
      ) : (
        <ul style={list}>
          {payload.conflicts.map((conflict) => (
            <li key={conflict.subject}>
              <strong>{conflict.subject}</strong>
              <ul style={{ ...list, fontSize: 12, opacity: 0.85 }}>
                {conflict.memories.map((memory) => (
                  <li key={memory.id}><code style={{ fontSize: 11 }}>{memory.id}</code> {memory.text}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <strong style={{ fontSize: 13 }}>{t('active')}</strong>
      {payload.active.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>{t('empty')}</p>
      ) : (
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Id</th><th style={th}>{t('memory')}</th><th style={th}>{t('kind')}</th>
              <th style={th}>{t('status')}</th><th style={th}>{t('from')}</th>
            </tr>
          </thead>
          <tbody>{rows(payload.active)}</tbody>
        </table>
      )}
      {payload.superseded.length > 0 && (
        <>
          <strong style={{ fontSize: 13 }}>{t('superseded')} ({payload.superseded.length})</strong>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Id</th><th style={th}>{t('memory')}</th><th style={th}>{t('kind')}</th>
                <th style={th}>{t('status')}</th><th style={th}>{t('from')}</th>
              </tr>
            </thead>
            <tbody>{rows(payload.superseded)}</tbody>
          </table>
        </>
      )}
    </div>
  )
}
