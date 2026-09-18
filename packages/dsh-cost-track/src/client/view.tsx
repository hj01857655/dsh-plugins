/**
 * Pure rendering half of the costTrack page.
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

import type { PanelPayload, SessionDetail } from '../types.js'

/** The translate seat the renderer binds from this plugin's locale namespace. */
export type Translate = (key: string, params?: Record<string, unknown>) => string

export interface PanelProps {
  /** Bound translate function for this plugin's namespace. */
  t: Translate
}

/** Panel routes registered by the host half on the web connection. */
const PANEL_PATH = "/api/cost.panel"
const BUDGET_PATH = "/api/cost.budget.set"
const SESSION_PATH = "/api/cost.session"
const EXPORT_PATH = "/api/cost.export"

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 820, fontFamily: 'inherit' }
const head: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }
const muted: CSSProperties = { fontSize: 12, opacity: 0.75 }
const table: CSSProperties = { borderCollapse: 'collapse', width: '100%' }
const th: CSSProperties = { textAlign: 'left', padding: '4px 10px 4px 0', fontWeight: 600, fontSize: 12, opacity: 0.8, borderBottom: '0.5px solid rgba(128,128,128,0.4)' }
const td: CSSProperties = { padding: '6px 10px 6px 0', fontSize: 13, borderBottom: '0.5px solid rgba(128,128,128,0.18)' }
const sectionHead: CSSProperties = { fontSize: 13, fontWeight: 600, marginTop: 6 }
const btn: CSSProperties = { fontSize: 12, cursor: 'pointer', padding: '3px 10px', borderRadius: 4, border: '0.5px solid rgba(128,128,128,0.4)' }
const barBg: CSSProperties = { width: '100%', height: 16, background: 'rgba(128,128,128,0.15)', borderRadius: 3, overflow: 'hidden', position: 'relative' }

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

/** Mini bar chart for daily trend — pure CSS, no chart library. */
function TrendChart({ trend, t }: { trend: PanelPayload['dailyTrend']; t: Translate }) {
  if (trend.length === 0) return null
  const maxSpend = Math.max(...trend.map((d) => d.spend), 0.0001)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={sectionHead}>{t('dailyTrend')}</span>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60 }}>
        {trend.map((d) => {
          const pct = Math.max((d.spend / maxSpend) * 100, 2)
          return (
            <div
              key={d.date}
              title={`${d.date}: $${d.spend.toFixed(4)} · ${d.calls} ${t('calls')}`}
              style={{
                flex: 1, minWidth: 6, maxWidth: 20,
                height: `${pct}%`,
                background: 'var(--accent, #4B8BBE)',
                borderRadius: '2px 2px 0 0',
                cursor: 'default',
              }}
            />
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, opacity: 0.5 }}>
        <span>{trend[0]?.date}</span>
        <span>{trend[trend.length - 1]?.date}</span>
      </div>
    </div>
  )
}

/** Budget bar with form to set budget. */
function BudgetSection({ payload, t, reload }: { payload: PanelPayload; t: Translate; reload: () => void }) {
  const [editing, setEditing] = useState(false)
  const [monthly, setMonthly] = useState('')
  const [enforce, setEnforce] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = useCallback(async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {}
      const m = parseFloat(monthly)
      if (!isNaN(m) && m > 0) body.monthly = m
      body.enforce = enforce
      await fetch(BUDGET_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      reload()
      setEditing(false)
    } finally { setSaving(false) }
  }, [monthly, enforce, reload])

  if (payload.budget !== null) {
    const total = payload.budget.spent + payload.budget.remaining
    const pct = total > 0 ? Math.min((payload.budget.spent / total) * 100, 100) : 0
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={muted}>{t('budget')}</span>
          <span style={{ fontSize: 13 }}>${payload.budget.spent.toFixed(2)} / ${total.toFixed(2)}</span>
          {payload.budget.exceeded && <span style={{ fontSize: 11, color: 'var(--error, #e53935)', fontWeight: 600 }}>{t('budgetExceeded')}</span>}
          <span style={{ flex: 1 }} />
          <button type="button" style={btn} onClick={() => setEditing(!editing)}>{t('editBudget')}</button>
        </div>
        <div style={barBg}>
          <div style={{ width: `${pct}%`, height: '100%', background: payload.budget.exceeded ? 'var(--error, #e53935)' : 'var(--accent, #4B8BBE)', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
        {editing && <BudgetForm monthly={monthly} setMonthly={setMonthly} enforce={enforce} setEnforce={setEnforce} saving={saving} save={save} t={t} />}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={muted}>{t('noBudget')}</span>
        <button type="button" style={btn} onClick={() => setEditing(!editing)}>{t('setBudget')}</button>
      </div>
      {editing && <BudgetForm monthly={monthly} setMonthly={setMonthly} enforce={enforce} setEnforce={setEnforce} saving={saving} save={save} t={t} />}
    </div>
  )
}

function BudgetForm({ monthly, setMonthly, enforce, setEnforce, saving, save, t }: {
  monthly: string; setMonthly: (v: string) => void
  enforce: boolean; setEnforce: (v: boolean) => void
  saving: boolean; save: () => void; t: Translate
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
      <label>{t('monthlyLimit')} $<input type="number" step="1" min="1" value={monthly} onChange={(e) => setMonthly(e.target.value)} style={{ width: 70, fontSize: 12 }} /></label>
      <label><input type="checkbox" checked={enforce} onChange={(e) => setEnforce(e.target.checked)} /> {t('enforceBlock')}</label>
      <button type="button" style={btn} disabled={saving} onClick={save}>{saving ? '…' : t('saveBudget')}</button>
    </div>
  )
}

/** Session row that can expand to show individual calls. */
function SessionRow({ session, t }: {
  session: PanelPayload['recentSessions'][number]
  t: Translate
}) {
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(false)

  const toggle = useCallback(async () => {
    if (detail) { setDetail(null); return }
    setLoading(true)
    try {
      const r = await fetch(SESSION_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId }),
      })
      if (r.ok) setDetail(await r.json() as SessionDetail)
    } finally { setLoading(false) }
  }, [detail, session.sessionId])

  return (
    <>
      <tr style={{ cursor: 'pointer' }} onClick={toggle}>
        <td style={td}>{session.sessionId.slice(0, 8)}…</td>
        <td style={td}>{session.calls}</td>
        <td style={td}>${session.spend.toFixed(4)}</td>
        <td style={td}>{new Date(session.timestamp).toLocaleString()}</td>
        <td style={td}>{loading ? '…' : detail ? '▼' : '▶'}</td>
      </tr>
      {detail && detail.entries.map((e, i) => (
        <tr key={`${session.sessionId}-${i}`} style={{ opacity: 0.75, fontSize: 11 }}>
          <td style={{ ...td, paddingLeft: 16 }}>{e.model}</td>
          <td style={td}>{e.promptTokens}+{e.completionTokens}</td>
          <td style={td}>${e.cost.toFixed(6)}</td>
          <td style={td}>{new Date(e.timestamp).toLocaleString()}</td>
          <td style={td} />
        </tr>
      ))}
    </>
  )
}

export function CostPanel({ t }: PanelProps) {
  const { payload, error, reload } = usePanel()

  const header = (
    <header style={head}>
      <strong style={{ fontSize: 13 }}>{t('title')}</strong>
      <span style={{ flex: 1 }} />
      <a href={EXPORT_PATH} download style={{ ...btn, textDecoration: 'none', color: 'inherit' }}>{t('exportCSV')}</a>
      <button type="button" onClick={reload} style={btn}>{t('refresh')}</button>
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

      {/* Summary stats */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
        <span>{t('today')} <strong>${payload.todaySpend.toFixed(4)}</strong></span>
        <span>{t('month')} <strong>${payload.monthSpend.toFixed(4)}</strong></span>
        <span>{t('total')} <strong>${payload.totalSpend.toFixed(4)}</strong></span>
        <span>{t('totalCalls')} <strong>{payload.totalCalls}</strong></span>
        <span style={muted}>{t('tokens')}: {payload.totalPromptTokens.toLocaleString()} in / {payload.totalCompletionTokens.toLocaleString()} out</span>
      </div>

      {/* Budget */}
      <BudgetSection payload={payload} t={t} reload={reload} />

      {/* Daily trend chart */}
      <TrendChart trend={payload.dailyTrend} t={t} />

      {/* Per-model breakdown */}
      {payload.perModel.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>{t('empty')}</p>
      ) : (
        <>
          <span style={sectionHead}>{t('modelBreakdown')}</span>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>{t('model')}</th>
                <th style={th}>{t('calls')}</th>
                <th style={th}>{t('spend')}</th>
                <th style={th}>{t('avgPerCall')}</th>
                <th style={th}>{t('tokens')}</th>
              </tr>
            </thead>
            <tbody>
              {payload.perModel.map((row) => (
                <tr key={row.model}>
                  <td style={td}>{row.model}</td>
                  <td style={td}>{row.calls}</td>
                  <td style={td}>${row.spend.toFixed(4)}</td>
                  <td style={td}>${row.avgCostPerCall.toFixed(6)}</td>
                  <td style={{ ...td, fontSize: 11, opacity: 0.7 }}>{row.promptTokens.toLocaleString()} / {row.completionTokens.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Recent sessions (expandable) */}
      {payload.recentSessions.length > 0 && (
        <>
          <span style={sectionHead}>{t('recentSessions')}</span>
          <table style={table}>
            <thead>
              <tr><th style={th}>{t('session')}</th><th style={th}>{t('calls')}</th><th style={th}>{t('spend')}</th><th style={th}>{t('date')}</th><th style={th} /></tr>
            </thead>
            <tbody>
              {payload.recentSessions.map((row) => (
                <SessionRow key={row.sessionId} session={row} t={t} />
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Supported models count */}
      <span style={{ ...muted, marginTop: 4 }}>
        {t('supportedModels')}: {payload.supportedModels.length}
      </span>
    </div>
  )
}
