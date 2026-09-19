/**
 * Pure rendering half of the stepTrace page. Uses shared UI kit.
 * @module client/view
 */

import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'

import type { PanelPayload, TraceStep } from '../types.js'
import {
  Badge, Button, Card, CodeBlock, ConfirmDialog, EmptyState, Field,
  Input, Modal, SectionTitle, Spinner, StatCard, ToastProvider,
  tableStyles, usePanel, useToast,
} from './ui.js'

export type Translate = (key: string, params?: Record<string, unknown>) => string
export interface PanelProps { t: Translate }

const PANEL_PATH = '/api/replay.panel'
const TRACE_PATH = '/api/replay.trace'
const BRANCH_PATH = '/api/replay.branch'
const DELETE_PATH = '/api/replay.delete'

function BranchModal({ sessionId, stepIndex, t, onClose, onBranched }: {
  sessionId: string; stepIndex: number; t: Translate; onClose: () => void; onBranched: () => void
}): ReactNode {
  const toast = useToast()
  const [newId, setNewId] = useState(`${sessionId}-branch-${Date.now().toString(36)}`)
  const [branching, setBranching] = useState(false)

  const handleBranch = useCallback(async () => {
    setBranching(true)
    try {
      const r = await fetch(BRANCH_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, stepIndex, newSessionId: newId }) })
      if (r.ok) { toast('success', t('branched')); onBranched(); onClose() }
      else { toast('error', `${t('failed')}: ${r.status}`) }
    } finally { setBranching(false) }
  }, [sessionId, stepIndex, newId, t, toast, onBranched, onClose])

  return (
    <Modal title={t('branch')} onClose={onClose} width={460}
      footer={<><Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button variant="primary" disabled={branching || !newId.trim()} onClick={handleBranch}>{branching ? <Spinner size={14} /> : null} {t('branch')}</Button></>}>
      <Field label={t('newSessionId')} hint={t('branchHint')}>
        <Input value={newId} onChange={(e) => setNewId(e.target.value)} />
      </Field>
    </Modal>
  )
}

function SessionModal({ sessionId, t, onClose, reload }: {
  sessionId: string; t: Translate; onClose: () => void; reload: () => void
}): ReactNode {
  const toast = useToast()
  const [steps, setSteps] = useState<TraceStep[] | null>(null)
  const [expandedStep, setExpandedStep] = useState<number | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [branchModal, setBranchModal] = useState<number | null>(null)

  useCallback(() => {
    fetch(`${TRACE_PATH}?id=${sessionId}`).then(async (r) => r.ok ? (await r.json()).steps as TraceStep[] : []).then(setSteps).catch(() => setSteps([]))
  }, [sessionId])()

  const handleDelete = useCallback(async () => {
    const r = await fetch(DELETE_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId }) })
    if (r.ok) { toast('success', t('deleted')); reload(); onClose() }
  }, [sessionId, t, toast, reload, onClose])

  return (
    <Modal title={`${t('session')} ${sessionId.slice(0, 8)}…`} onClose={onClose} width={720}
      footer={<Button variant="danger" size="sm" onClick={() => setConfirmDel(true)}>🗑 {t('delete')}</Button>}>
      {steps === null ? <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><Spinner size={24} /></div>
        : steps.length === 0 ? <EmptyState message={t('noSteps')} />
        : (
          <table style={tableStyles.table}>
            <thead><tr><th style={tableStyles.th}>#</th><th style={tableStyles.th}>{t('type')}</th><th style={tableStyles.th}>{t('latency')}</th><th style={tableStyles.th}>{t('time')}</th><th style={tableStyles.th}>{t('actions')}</th></tr></thead>
            <tbody>
              {steps.map((s, i) => (
                <>
                  <tr key={i} style={tableStyles.clickRow} onClick={() => setExpandedStep(expandedStep === i ? null : i)}>
                    <td style={tableStyles.td}>{s.step}</td>
                    <td style={tableStyles.td}>{s.type === 'model' ? '🤖' : '🔧'} {s.type}</td>
                    <td style={tableStyles.td}>{s.latencyMs}ms</td>
                    <td style={tableStyles.td}>{new Date(s.timestamp).toLocaleTimeString()}</td>
                    <td style={tableStyles.td}>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setBranchModal(i) }}>⎇</Button>
                    </td>
                  </tr>
                  {expandedStep === i && (
                    <tr key={`${i}-d`}><td colSpan={5} style={{ padding: '4px 0' }}>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 250 }}><Badge color="info">{t('input')}</Badge><CodeBlock style={{ marginTop: 4 }}>{JSON.stringify(s.input, null, 2).slice(0, 2000)}</CodeBlock></div>
                        <div style={{ flex: 1, minWidth: 250 }}><Badge color="success">{t('output')}</Badge><CodeBlock style={{ marginTop: 4 }}>{JSON.stringify(s.output, null, 2).slice(0, 2000)}</CodeBlock></div>
                      </div>
                    </td></tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      {confirmDel && <ConfirmDialog title={t('delete')} message={t('confirmDelete')} confirmLabel={t('delete')} danger onConfirm={handleDelete} onClose={() => setConfirmDel(false)} />}
      {branchModal !== null && <BranchModal sessionId={sessionId} stepIndex={branchModal} t={t} onClose={() => setBranchModal(null)} onBranched={reload} />}
    </Modal>
  )
}

function StepTracePanelInner({ t }: PanelProps): ReactNode {
  const { payload, error, reload } = usePanel<PanelPayload>(PANEL_PATH)
  const [sessionModal, setSessionModal] = useState<string | null>(null)

  const header = (
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
      <strong style={{ fontSize: 15 }}>🔍 {t('title')}</strong>
      <span style={{ flex: 1 }} />
      <Button variant="secondary" size="sm" onClick={reload}>{t('refresh')}</Button>
    </header>
  )

  if (error !== null) return <div style={{ maxWidth: 820 }}>{header}<Card><p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--error, #e53935)' }}>{t('failed')}: {error}</p></Card></div>
  if (payload === null) return <div style={{ maxWidth: 820 }}>{header}<div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={28} /></div></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 820 }}>
      {header}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatCard value={payload.overview.totalSessions} label={t('totalSessions')} />
        <StatCard value={payload.overview.totalSteps} label={t('totalSteps')} />
        <StatCard value={payload.overview.avgStepsPerSession} label={t('avgSteps')} />
        <StatCard value={(payload.overview.totalLatencyMs / 1000).toFixed(1)} unit="s" label={t('totalLatency')} />
      </div>

      <SectionTitle icon="📋">{t('sessions')}</SectionTitle>
      {payload.sessions.length === 0 ? <EmptyState icon="📭" message={t('empty')} /> : (
        <Card padding={0}>
          <table style={tableStyles.table}>
            <thead><tr><th style={tableStyles.th}>{t('session')}</th><th style={tableStyles.th}>{t('steps')}</th><th style={tableStyles.th}>{t('model')}</th><th style={tableStyles.th}>{t('tool')}</th><th style={tableStyles.th}>{t('date')}</th></tr></thead>
            <tbody>
              {payload.sessions.map((row) => (
                <tr key={row.sessionId} style={tableStyles.clickRow} onClick={() => setSessionModal(row.sessionId)}>
                  <td style={tableStyles.td}><code style={{ fontSize: 11 }}>{row.sessionId.slice(0, 8)}</code></td>
                  <td style={tableStyles.td}>{row.stepCount}</td>
                  <td style={tableStyles.td}>🤖 {row.modelSteps}</td>
                  <td style={tableStyles.td}>🔧 {row.toolSteps}</td>
                  <td style={tableStyles.td}>{new Date(row.timestamp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {sessionModal !== null && <SessionModal sessionId={sessionModal} t={t} onClose={() => setSessionModal(null)} reload={reload} />}
    </div>
  )
}

export function StepTracePanel({ t }: PanelProps): ReactNode {
  return <ToastProvider><StepTracePanelInner t={t} /></ToastProvider>
}
