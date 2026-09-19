/**
 * Pure rendering half of the costTrack page.
 *
 * Uses the shared UI kit (Modal, Card, Button, Toast, …) for a polished panel.
 *
 * @module client/view
 */

import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import type { PanelPayload, SessionDetail } from '../types.js'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  ProgressBar,
  SectionTitle,
  Spinner,
  StatCard,
  ToastProvider,
  tableStyles,
  usePanel,
  useToast,
} from './ui.js'

export type Translate = (key: string, params?: Record<string, unknown>) => string

export interface PanelProps {
  t: Translate
}

const PANEL_PATH = '/api/cost.panel'
const BUDGET_PATH = '/api/cost.budget.set'
const SESSION_PATH = '/api/cost.session'
const EXPORT_PATH = '/api/cost.export'

// ─── Trend chart ───────────────────────────────────────────────
function TrendChart({ trend, t }: { trend: PanelPayload['dailyTrend']; t: Translate }): ReactNode {
  if (trend.length === 0) return null
  const maxSpend = Math.max(...trend.map((d) => d.spend), 0.0001)
  return (
    <Card title={t('dailyTrend')} icon="📈">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 72 }}>
        {trend.map((d) => {
          const pct = Math.max((d.spend / maxSpend) * 100, 2)
          return (
            <div
              key={d.date}
              title={`${d.date}: $${d.spend.toFixed(4)} · ${d.calls} ${t('calls')}`}
              style={{
                flex: 1, minWidth: 6, maxWidth: 24,
                height: `${pct}%`,
                background: 'var(--dsw-alias-brand-primary)',
                borderRadius: '3px 3px 0 0',
              }}
            />
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, opacity: 0.5, marginTop: 6 }}>
        <span>{trend[0]?.date}</span>
        <span>{trend[trend.length - 1]?.date}</span>
      </div>
    </Card>
  )
}

// ─── Budget modal ──────────────────────────────────────────────
function BudgetModal({ t, current, onClose, onSaved }: {
  t: Translate
  current: { monthly: number; enforce: boolean } | null
  onClose: () => void
  onSaved: () => void
}): ReactNode {
  const toast = useToast()
  const [monthly, setMonthly] = useState(current?.monthly?.toString() ?? '')
  const [enforce, setEnforce] = useState(current?.enforce ?? false)
  const [saving, setSaving] = useState(false)

  const save = useCallback(async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {}
      const m = parseFloat(monthly)
      if (!isNaN(m) && m > 0) body.monthly = m
      body.enforce = enforce
      const r = await fetch(BUDGET_PATH, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      if (r.ok) { toast('success', t('budgetSaved')); onSaved(); onClose() }
      else { toast('error', `${t('failed')}: ${r.status}`) }
    } finally { setSaving(false) }
  }, [monthly, enforce, t, toast, onSaved, onClose])

  return (
    <Modal title={current !== null ? t('editBudget') : t('setBudget')} onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" disabled={saving} onClick={save}>
            {saving ? <Spinner size={14} /> : null} {t('saveBudget')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label={t('monthlyLimit')} hint={t('monthlyHint')}>
          <Input type="number" step="1" min="1" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="100" />
        </Field>
        <Field label={t('enforceBlock')}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={enforce} onChange={(e) => setEnforce(e.target.checked)} />
            {t('enforceHint')}
          </label>
        </Field>
      </div>
    </Modal>
  )
}

// ─── Session detail modal ──────────────────────────────────────
function SessionModal({ sessionId, t, onClose }: { sessionId: string; t: Translate; onClose: () => void }): ReactNode {
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(SESSION_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId }) })
      .then(async (r) => { if (r.ok) setDetail(await r.json() as SessionDetail) })
      .finally(() => setLoading(false))
  }, [sessionId])

  return (
    <Modal title={`${t('session')} ${sessionId.slice(0, 8)}…`} onClose={onClose} width={680}>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><Spinner size={24} /></div>
      ) : detail === null ? (
        <EmptyState message={t('notFound')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {detail.entries.map((e, i) => (
            <Card key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong style={{ fontSize: 13 }}>{e.model}</strong>
                <Badge color="info">${e.cost.toFixed(6)}</Badge>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, opacity: 0.7 }}>
                <span>{e.promptTokens.toLocaleString()} ↑</span>
                <span>{e.completionTokens.toLocaleString()} ↓</span>
                <span>{new Date(e.timestamp).toLocaleString()}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Modal>
  )
}

// ─── Main panel ────────────────────────────────────────────────
function CostPanelInner({ t }: PanelProps): ReactNode {
  const { payload, error, reload } = usePanel<PanelPayload>(PANEL_PATH)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [sessionOpen, setSessionOpen] = useState<string | null>(null)

  const header = (
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
      <strong style={{ fontSize: 15 }}>💰 {t('title')}</strong>
      <span style={{ flex: 1 }} />
      <a href={EXPORT_PATH} download><Button variant="secondary" size="sm">{t('exportCSV')}</Button></a>
      <Button variant="secondary" size="sm" onClick={reload}>{t('refresh')}</Button>
    </header>
  )

  if (error !== null) return (
    <div style={{ maxWidth: 820 }}>
      {header}
      <Card><p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--dsw-alias-state-error-primary)' }}>{t('failed')}: {error}</p>
        <Button variant="secondary" onClick={reload} style={{ marginTop: 10 }}>{t('retry')}</Button></Card>
    </div>
  )
  if (payload === null) return (
    <div style={{ maxWidth: 820 }}>{header}
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={28} /></div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 820 }}>
      {header}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatCard value={`$${payload.todaySpend.toFixed(2)}`} label={t('today')} />
        <StatCard value={`$${payload.monthSpend.toFixed(2)}`} label={t('month')} />
        <StatCard value={`$${payload.totalSpend.toFixed(2)}`} label={t('total')} />
        <StatCard value={payload.totalCalls} label={t('totalCalls')} />
      </div>

      <Card title={t('budget')} icon="🎯">
        {payload.budget !== null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13 }}>${payload.budget.spent.toFixed(2)} / ${(payload.budget.spent + payload.budget.remaining).toFixed(2)}</span>
              {payload.budget.exceeded && <Badge color="error">{t('budgetExceeded')}</Badge>}
              <span style={{ flex: 1 }} />
              <Button variant="secondary" size="sm" onClick={() => setBudgetOpen(true)}>{t('editBudget')}</Button>
            </div>
            <ProgressBar pct={payload.budget.remaining > 0 ? (payload.budget.spent / (payload.budget.spent + payload.budget.remaining)) * 100 : 100}
              color={payload.budget.exceeded ? 'var(--dsw-alias-state-error-primary)' : undefined as unknown as string} />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, opacity: 0.7 }}>{t('noBudget')}</span>
            <span style={{ flex: 1 }} />
            <Button variant="primary" size="sm" onClick={() => setBudgetOpen(true)}>{t('setBudget')}</Button>
          </div>
        )}
      </Card>

      <TrendChart trend={payload.dailyTrend} t={t} />

      <SectionTitle icon="🤖">{t('modelBreakdown')}</SectionTitle>
      {payload.perModel.length === 0 ? (
        <EmptyState icon="📭" message={t('empty')} />
      ) : (
        <Card padding={0}>
          <table style={tableStyles.table}>
            <thead><tr>
              <th style={tableStyles.th}>{t('model')}</th><th style={tableStyles.th}>{t('calls')}</th>
              <th style={tableStyles.th}>{t('spend')}</th><th style={tableStyles.th}>{t('avgPerCall')}</th><th style={tableStyles.th}>{t('tokens')}</th>
            </tr></thead>
            <tbody>
              {payload.perModel.map((row) => (
                <tr key={row.model}>
                  <td style={tableStyles.td}><strong>{row.model}</strong></td>
                  <td style={tableStyles.td}>{row.calls}</td>
                  <td style={tableStyles.td}>${row.spend.toFixed(4)}</td>
                  <td style={tableStyles.td}>${row.avgCostPerCall.toFixed(6)}</td>
                  <td style={{ ...tableStyles.td, fontSize: 11, opacity: 0.7 }}>{row.promptTokens.toLocaleString()} / {row.completionTokens.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {payload.recentSessions.length > 0 && (
        <>
          <SectionTitle icon="🕒">{t('recentSessions')}</SectionTitle>
          <Card padding={0}>
            <table style={tableStyles.table}>
              <thead><tr>
                <th style={tableStyles.th}>{t('session')}</th><th style={tableStyles.th}>{t('calls')}</th>
                <th style={tableStyles.th}>{t('spend')}</th><th style={tableStyles.th}>{t('date')}</th>
              </tr></thead>
              <tbody>
                {payload.recentSessions.map((row) => (
                  <tr key={row.sessionId} style={tableStyles.clickRow} onClick={() => setSessionOpen(row.sessionId)}>
                    <td style={tableStyles.td}><code style={{ fontSize: 11 }}>{row.sessionId.slice(0, 8)}…</code></td>
                    <td style={tableStyles.td}>{row.calls}</td>
                    <td style={tableStyles.td}>${row.spend.toFixed(4)}</td>
                    <td style={tableStyles.td}>{new Date(row.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <span style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>{t('supportedModels')}: {payload.supportedModels.length}</span>

      {budgetOpen && (
        <BudgetModal t={t} current={payload.budget !== null ? { monthly: payload.budget.spent + payload.budget.remaining, enforce: false } : null}
          onClose={() => setBudgetOpen(false)} onSaved={reload} />
      )}
      {sessionOpen !== null && <SessionModal sessionId={sessionOpen} t={t} onClose={() => setSessionOpen(null)} />}
    </div>
  )
}

export function CostPanel({ t }: PanelProps): ReactNode {
  return <ToastProvider><CostPanelInner t={t} /></ToastProvider>
}
