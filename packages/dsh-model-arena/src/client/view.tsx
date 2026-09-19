/**
 * Pure rendering half of the modelArena page.
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

import type { PanelPayload, LeaderboardEntry, ArenaStats, RunSummary, ArenaRun } from '../types.js'

export type Translate = (key: string, params?: Record<string, unknown>) => string

export interface PanelProps {
  t: Translate
}

const PANEL_PATH = '/api/arena.panel'
const RUN_PATH = '/api/arena.run'
const RATE_PATH = '/api/arena.rate'
const DELETE_PATH = '/api/arena.delete'

// --- Styles ---
const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 820, fontFamily: 'inherit' }
const head: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }
const section: CSSProperties = { marginTop: 8 }
const sectionTitle: CSSProperties = { fontSize: 13, fontWeight: 600, marginBottom: 6 }
const muted: CSSProperties = { fontSize: 12, opacity: 0.75 }
const table: CSSProperties = { borderCollapse: 'collapse', width: '100%' }
const th: CSSProperties = { textAlign: 'left', padding: '4px 10px 4px 0', fontWeight: 600, fontSize: 12, opacity: 0.8, borderBottom: '0.5px solid rgba(128,128,128,0.4)' }
const td: CSSProperties = { padding: '6px 10px 6px 0', fontSize: 13, borderBottom: '0.5px solid rgba(128,128,128,0.18)' }
const card: CSSProperties = { padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(128,128,128,0.2)', background: 'rgba(128,128,128,0.04)', fontSize: 13 }
const badge: CSSProperties = { display: 'inline-block', padding: '1px 6px', borderRadius: 9, fontSize: 11, fontWeight: 600 }
const statRow: CSSProperties = { display: 'flex', gap: 16, flexWrap: 'wrap' }
const statBox: CSSProperties = { ...card, flex: 1, minWidth: 100, textAlign: 'center' as const }
const starBtn: CSSProperties = { cursor: 'pointer', background: 'none', border: 'none', fontSize: 16, padding: '0 1px' }
const clickRow: CSSProperties = { cursor: 'pointer' }
const preBlock: CSSProperties = { whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, maxHeight: 200, overflow: 'auto', padding: 8, borderRadius: 4, background: 'rgba(128,128,128,0.06)', border: '1px solid rgba(128,128,128,0.15)' }
const dangerBtn: CSSProperties = { fontSize: 11, color: '#e55', background: 'none', border: '1px solid #e55', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }

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
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<PanelPayload>
      })
      .then((payload) => { if (!c.signal.aborted) setState({ payload, error: null }) })
      .catch((e: unknown) => { if (!c.signal.aborted) setState({ payload: null, error: e instanceof Error ? e.message : String(e) }) })
    return () => c.abort()
  }, [tick])
  return { ...state, reload }
}

// --- Stars ---
function Stars({ rating, onRate }: { rating: number; onRate: (n: number) => void }) {
  return (
    <span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" style={starBtn} onClick={() => onRate(n)} title={`${n}/5`}>
          {n <= rating ? '★' : '☆'}
        </button>
      ))}
    </span>
  )
}

// --- Leaderboard ---
function Leaderboard({ entries, t }: { entries: LeaderboardEntry[]; t: Translate }) {
  if (entries.length === 0) return null
  return (
    <div style={section}>
      <div style={sectionTitle}>🏆 {t('leaderboard')}</div>
      <table style={table}>
        <thead>
          <tr>
            <th style={th}>#</th>
            <th style={th}>{t('model')}</th>
            <th style={th}>Elo</th>
            <th style={th}>{t('wins')}</th>
            <th style={th}>{t('avgRating')}</th>
            <th style={th}>{t('runs')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={e.model}>
              <td style={td}>{i + 1}</td>
              <td style={td}><strong>{e.model}</strong></td>
              <td style={td}>{e.elo}</td>
              <td style={td}>{e.wins}</td>
              <td style={td}>{e.avgRating > 0 ? e.avgRating.toFixed(1) : '—'}</td>
              <td style={td}>{e.totalRuns}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// --- Stats summary ---
function StatsSummary({ stats, t }: { stats: ArenaStats; t: Translate }) {
  return (
    <div style={statRow}>
      <div style={statBox}><div style={{ fontSize: 20, fontWeight: 700 }}>{stats.totalRuns}</div><div style={muted}>{t('totalRuns')}</div></div>
      <div style={statBox}><div style={{ fontSize: 20, fontWeight: 700 }}>{stats.uniqueModels}</div><div style={muted}>{t('uniqueModels')}</div></div>
      <div style={statBox}><div style={{ fontSize: 20, fontWeight: 700 }}>{stats.totalRatings}</div><div style={muted}>{t('totalRatings')}</div></div>
    </div>
  )
}

// --- Run detail expansion ---
function RunDetail({ runId, t, onDelete }: { runId: string; t: Translate; onDelete: () => void }) {
  const [run, setRun] = useState<ArenaRun | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    fetch(`${RUN_PATH}?id=${runId}`)
      .then((r) => r.json() as Promise<ArenaRun>)
      .then(setRun)
      .catch(() => setRun(null))
      .finally(() => setLoading(false))
  }, [runId])

  const handleRate = useCallback((model: string, rating: number) => {
    fetch(RATE_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, model, rating }),
    })
      .then((r) => r.json() as Promise<ArenaRun>)
      .then(setRun)
      .catch(() => {})
  }, [runId])

  const handleDelete = useCallback(() => {
    if (!confirm(t('confirmDelete'))) return
    fetch(DELETE_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId }),
    }).then(() => onDelete()).catch(() => {})
  }, [runId, t, onDelete])

  if (loading) return <p style={muted}>{t('loading')}</p>
  if (!run) return <p style={muted}>{t('notFound')}</p>
  return (
    <div style={{ ...card, marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>{t('prompt')}: </strong>
        <button type="button" style={dangerBtn} onClick={handleDelete}>{t('delete')}</button>
      </div>
      <div style={preBlock}>{run.prompt}</div>
      {run.reference && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{t('reference')}:</div>
          <div style={preBlock}>{run.reference}</div>
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        {run.results.map((r) => (
          <div key={r.model} style={{ ...card, marginTop: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{r.model}</strong>
              <span>
                {r.error ? (
                  <span style={{ ...badge, background: 'rgba(255,80,80,0.15)', color: '#e55' }}>{t('error')}</span>
                ) : (
                  <span style={{ ...badge, background: 'rgba(80,200,120,0.15)', color: '#4a4' }}>{r.latencyMs}ms</span>
                )}
              </span>
            </div>
            <div style={preBlock}>{r.error ?? r.output}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span style={muted}>{r.promptTokens + r.completionTokens} tokens ({r.promptTokens}↑ {r.completionTokens}↓)</span>
              <Stars rating={r.rating ?? 0} onRate={(n) => handleRate(r.model, n)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Main Panel ---
export function ArenaPanel({ t }: PanelProps) {
  const { payload, error, reload } = usePanel()
  const [expandedRun, setExpandedRun] = useState<string | null>(null)

  const header = (
    <header style={head}>
      <strong style={{ fontSize: 14 }}>⚔️ {t('title')}</strong>
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

      {/* Stats */}
      <StatsSummary stats={payload.stats} t={t} />

      {/* Leaderboard */}
      <Leaderboard entries={payload.leaderboard} t={t} />

      {/* Recent runs */}
      <div style={section}>
        <div style={sectionTitle}>📋 {t('recentRuns')}</div>
        {payload.recentRuns.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>{t('empty')}</p>
        ) : (
          <table style={table}>
            <thead>
              <tr><th style={th}>{t('run')}</th><th style={th}>{t('models')}</th><th style={th}>{t('winner')}</th><th style={th}>{t('date')}</th></tr>
            </thead>
            <tbody>
              {payload.recentRuns.map((row) => (
                <>
                  <tr key={row.id} style={clickRow} onClick={() => setExpandedRun(expandedRun === row.id ? null : row.id)}>
                    <td style={td}>
                      <code style={{ fontSize: 11 }}>{row.id}</code>
                      <span style={{ marginLeft: 6, fontSize: 10 }}>{expandedRun === row.id ? '▼' : '▶'}</span>
                    </td>
                    <td style={td}>{row.modelCount}</td>
                    <td style={td}>{row.winner ?? '—'}</td>
                    <td style={td}>{new Date(row.timestamp).toLocaleString()}</td>
                  </tr>
                  {expandedRun === row.id && (
                    <tr key={`${row.id}-detail`}>
                      <td colSpan={4} style={{ padding: '4px 0' }}>
                        <RunDetail runId={row.id} t={t} onDelete={() => { setExpandedRun(null); reload() }} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
