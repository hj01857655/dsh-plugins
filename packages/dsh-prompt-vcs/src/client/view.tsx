/**
 * Pure rendering half of the promptVcs page.
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

import type { PanelPayload, Change } from '../types.js'

export type Translate = (key: string, params?: Record<string, unknown>) => string

export interface PanelProps {
  t: Translate
}

const PANEL_PATH = '/api/vcs.panel'
const CHANGE_PATH = '/api/vcs.change'
const ROLLBACK_PATH = '/api/vcs.rollback'

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 820, fontFamily: 'inherit' }
const head: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }
const muted: CSSProperties = { fontSize: 12, opacity: 0.75 }
const table: CSSProperties = { borderCollapse: 'collapse', width: '100%' }
const th: CSSProperties = { textAlign: 'left', padding: '4px 10px 4px 0', fontWeight: 600, fontSize: 12, opacity: 0.8, borderBottom: '0.5px solid rgba(128,128,128,0.4)' }
const td: CSSProperties = { padding: '6px 10px 6px 0', fontSize: 13, borderBottom: '0.5px solid rgba(128,128,128,0.18)' }
const card: CSSProperties = { padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(128,128,128,0.2)', fontSize: 13 }
const btn: CSSProperties = { fontSize: 12, cursor: 'pointer', padding: '3px 10px', borderRadius: 4, border: '0.5px solid rgba(128,128,128,0.4)' }
const dangerBtn: CSSProperties = { ...btn, color: '#e55', borderColor: '#e55' }
const preBlock: CSSProperties = { whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, maxHeight: 200, overflow: 'auto', padding: 8, borderRadius: 4, background: 'rgba(128,128,128,0.06)', border: '1px solid rgba(128,128,128,0.15)' }
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

// --- Change detail expansion with diff and rollback ---
function ChangeDetail({ hash, t, onRollback }: { hash: string; t: Translate; onRollback: () => void }) {
  const [change, setChange] = useState<Change | null>(null)
  const [loading, setLoading] = useState(false)
  const [rolling, setRolling] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${CHANGE_PATH}?hash=${hash}`)
      if (r.ok) setChange(await r.json() as Change)
    } finally { setLoading(false) }
  }, [hash])

  useEffect(() => { load() }, [load])

  const handleRollback = useCallback(async () => {
    if (!confirm(t('confirmRollback'))) return
    setRolling(true)
    try {
      await fetch(ROLLBACK_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hash }),
      })
      onRollback()
    } finally { setRolling(false) }
  }, [hash, t, onRollback])

  if (loading) return <p style={muted}>{t('loading')}</p>
  if (!change) return <p style={muted}>{t('notFound')}</p>
  return (
    <div style={{ ...card, marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>{change.file}</strong>
        <button type="button" style={dangerBtn} disabled={rolling} onClick={handleRollback}>
          {rolling ? '…' : `↩ ${t('rollback')}`}
        </button>
      </div>
      {/* Diff display */}
      <div style={{ marginBottom: 8 }}>
        <strong style={{ fontSize: 12 }}>{t('diff')}</strong>
        <pre style={preBlock}>{change.diff}</pre>
      </div>
      {/* Old / New content */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 250 }}>
          <strong style={{ fontSize: 12, color: '#e55' }}>{t('before')}</strong>
          <pre style={{ ...preBlock, maxHeight: 150 }}>{change.oldContent.slice(0, 2000)}{change.oldContent.length > 2000 ? '\n…' : ''}</pre>
        </div>
        <div style={{ flex: 1, minWidth: 250 }}>
          <strong style={{ fontSize: 12, color: '#4a4' }}>{t('after')}</strong>
          <pre style={{ ...preBlock, maxHeight: 150 }}>{change.newContent.slice(0, 2000)}{change.newContent.length > 2000 ? '\n…' : ''}</pre>
        </div>
      </div>
    </div>
  )
}

export function PromptVcsPanel({ t }: PanelProps) {
  const { payload, error, reload } = usePanel()
  const [expandedHash, setExpandedHash] = useState<string | null>(null)

  const header = (
    <header style={head}>
      <strong style={{ fontSize: 13 }}>📝 {t('title')}</strong>
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
        <div style={statBox}><div style={{ fontSize: 18, fontWeight: 700 }}>{payload.totalChanges}</div><div style={muted}>{t('totalChanges')}</div></div>
        <div style={statBox}><div style={{ fontSize: 18, fontWeight: 700 }}>{payload.files.length}</div><div style={muted}>{t('filesTracked')}</div></div>
        <div style={statBox}><div style={{ fontSize: 14, fontWeight: 600 }}>{payload.watchedFiles.join(', ')}</div><div style={muted}>{t('watched')}</div></div>
      </div>

      {/* File stats */}
      {payload.files.length > 0 && (
        <div>
          <strong style={{ fontSize: 13 }}>📁 {t('files')}</strong>
          <table style={{ ...table, marginTop: 4 }}>
            <thead>
              <tr><th style={th}>{t('file')}</th><th style={th}>{t('changes')}</th><th style={th}>{t('lastChanged')}</th><th style={th}>{t('size')}</th></tr>
            </thead>
            <tbody>
              {payload.files.map((f) => (
                <tr key={f.file}>
                  <td style={td}><code style={{ fontSize: 11 }}>{f.file}</code></td>
                  <td style={td}>{f.changes}</td>
                  <td style={td}>{new Date(f.lastChanged).toLocaleString()}</td>
                  <td style={td}>{f.currentSize}B</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Timeline (expandable with diff + rollback) */}
      {payload.timeline.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>{t('empty')}</p>
      ) : (
        <div>
          <strong style={{ fontSize: 13 }}>🕒 {t('timeline')}</strong>
          <table style={{ ...table, marginTop: 4 }}>
            <thead>
              <tr>
                <th style={th} /><th style={th}>{t('hash')}</th><th style={th}>{t('date')}</th><th style={th}>{t('by')}</th>
                <th style={th}>{t('file')}</th><th style={th}>{t('added')}</th><th style={th}>{t('removed')}</th>
              </tr>
            </thead>
            <tbody>
              {payload.timeline.map((row) => (
                <>
                  <tr key={row.hash} style={clickRow} onClick={() => setExpandedHash(expandedHash === row.hash ? null : row.hash)}>
                    <td style={td}>{expandedHash === row.hash ? '▼' : '▶'}</td>
                    <td style={td}><code style={{ fontSize: 11 }}>{row.hash}</code></td>
                    <td style={td}>{new Date(row.timestamp).toLocaleString()}</td>
                    <td style={td}>{row.changedBy}</td>
                    <td style={td}>{row.file}</td>
                    <td style={{ ...td, color: '#4a4' }}>+{row.addedLines}</td>
                    <td style={{ ...td, color: '#e55' }}>-{row.removedLines}</td>
                  </tr>
                  {expandedHash === row.hash && (
                    <tr key={`${row.hash}-detail`}>
                      <td colSpan={7} style={{ padding: '4px 0' }}>
                        <ChangeDetail hash={row.hash} t={t} onRollback={() => { setExpandedHash(null); reload() }} />
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
