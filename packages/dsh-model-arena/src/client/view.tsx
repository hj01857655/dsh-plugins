/**
 * Pure rendering half of the modelArena page. Uses shared UI kit.
 * @module client/view
 */

import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'

import type { PanelPayload, ArenaRun } from '../types.js'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, Modal, SectionTitle,
  Spinner, StatCard, ToastProvider, tableStyles, usePanel, useToast,
} from './ui.js'

export type Translate = (key: string, params?: Record<string, unknown>) => string
export interface PanelProps { t: Translate }

const PANEL_PATH = '/api/arena.panel'
const RUN_PATH = '/api/arena.run'
const RATE_PATH = '/api/arena.rate'
const DELETE_PATH = '/api/arena.delete'

function Stars({ rating, onRate }: { rating: number; onRate: (n: number) => void }): ReactNode {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" style={{
          background: 'none', border: 'none', cursor: 'pointer', fontSize: 18,
          color: n <= rating ? 'var(--warning, #ed6c02)' : 'rgba(128,128,128,0.3)',
          padding: '0 2px',
        }} onClick={() => onRate(n)} title={`${n}/5`}>★</button>
      ))}
    </span>
  )
}

function RunModal({ runId, t, onClose, onDeleted }: {
  runId: string; t: Translate; onClose: () => void; onDeleted: () => void
}): ReactNode {
  const toast = useToast()
  const [run, setRun] = useState<ArenaRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmDel, setConfirmDel] = useState(false)

  useCallback(() => {
    setLoading(true)
    fetch(`${RUN_PATH}?id=${runId}`).then(async (r) => r.json() as Promise<ArenaRun>)
      .then(setRun).catch(() => setRun(null)).finally(() => setLoading(false))
  }, [runId])()

  const handleRate = useCallback((model: string, rating: number) => {
    fetch(RATE_PATH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId, model, rating }) })
      .then(async (r) => r.json() as Promise<ArenaRun>).then(setRun).catch(() => {})
  }, [runId])

  const handleDelete = useCallback(async () => {
    const r = await fetch(DELETE_PATH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId }) })
    if (r.ok) { toast('success', t('deleted')); onDeleted(); onClose() }
  }, [runId, t, toast, onDeleted, onClose])

  return (
    <Modal title={`${t('run')} ${runId.slice(0, 8)}…`} onClose={onClose} width={720}
      footer={<Button variant="danger" size="sm" onClick={() => setConfirmDel(true)}>🗑 {t('delete')}</Button>}>
      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><Spinner size={24} /></div>
        : run === null ? <EmptyState message={t('notFound')} />
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card title={t('prompt')}><pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, margin: 0 }}>{run.prompt}</pre></Card>
            {run.reference && <Card title={t('reference')}><pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, margin: 0 }}>{run.reference}</pre></Card>}
            {run.results.map((r) => (
              <Card key={r.model}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong style={{ fontSize: 13 }}>{r.model}</strong>
                  {r.error ? <Badge color="error">{t('error')}</Badge> : <Badge color="success">{r.latencyMs}ms</Badge>}
                </div>
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, margin: 0, padding: 8, borderRadius: 6, background: 'rgba(128,128,128,0.06)', maxHeight: 150, overflow: 'auto' }}>{r.error ?? r.output}</pre>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ fontSize: 11, opacity: 0.6 }}>{r.promptTokens + r.completionTokens} tokens</span>
                  <Stars rating={r.rating ?? 0} onRate={(n) => handleRate(r.model, n)} />
                </div>
              </Card>
            ))}
          </div>
        )}
      {confirmDel && <ConfirmDialog title={t('delete')} message={t('confirmDelete')} confirmLabel={t('delete')}
        danger onConfirm={handleDelete} onClose={() => setConfirmDel(false)} />}
    </Modal>
  )
}

function ArenaPanelInner({ t }: PanelProps): ReactNode {
  const { payload, error, reload } = usePanel<PanelPayload>(PANEL_PATH)
  const [runModal, setRunModal] = useState<string | null>(null)

  const header = (
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
      <strong style={{ fontSize: 15 }}>⚔️ {t('title')}</strong>
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
        <StatCard value={payload.stats.totalRuns} label={t('totalRuns')} />
        <StatCard value={payload.stats.uniqueModels} label={t('uniqueModels')} />
        <StatCard value={payload.stats.totalRatings} label={t('totalRatings')} />
      </div>

      {payload.leaderboard.length > 0 && (
        <>
          <SectionTitle icon="🏆">{t('leaderboard')}</SectionTitle>
          <Card padding={0}>
            <table style={tableStyles.table}>
              <thead><tr><th style={tableStyles.th}>#</th><th style={tableStyles.th}>{t('model')}</th><th style={tableStyles.th}>Elo</th><th style={tableStyles.th}>{t('wins')}</th><th style={tableStyles.th}>{t('avgRating')}</th><th style={tableStyles.th}>{t('runs')}</th></tr></thead>
              <tbody>
                {payload.leaderboard.map((e, i) => (
                  <tr key={e.model}><td style={tableStyles.td}>{i + 1}</td><td style={tableStyles.td}><strong>{e.model}</strong></td>
                    <td style={tableStyles.td}>{e.elo}</td><td style={tableStyles.td}>{e.wins}</td>
                    <td style={tableStyles.td}>{e.avgRating > 0 ? e.avgRating.toFixed(1) : '—'}</td><td style={tableStyles.td}>{e.totalRuns}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <SectionTitle icon="📋">{t('recentRuns')}</SectionTitle>
      {payload.recentRuns.length === 0 ? <EmptyState icon="📭" message={t('empty')} /> : (
        <Card padding={0}>
          <table style={tableStyles.table}>
            <thead><tr><th style={tableStyles.th}>{t('run')}</th><th style={tableStyles.th}>{t('models')}</th><th style={tableStyles.th}>{t('winner')}</th><th style={tableStyles.th}>{t('date')}</th></tr></thead>
            <tbody>
              {payload.recentRuns.map((row) => (
                <tr key={row.id} style={tableStyles.clickRow} onClick={() => setRunModal(row.id)}>
                  <td style={tableStyles.td}><code style={{ fontSize: 11 }}>{row.id.slice(0, 8)}</code></td>
                  <td style={tableStyles.td}>{row.modelCount}</td>
                  <td style={tableStyles.td}>{row.winner ?? '—'}</td>
                  <td style={tableStyles.td}>{new Date(row.timestamp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {runModal !== null && <RunModal runId={runModal} t={t} onClose={() => setRunModal(null)} onDeleted={reload} />}
    </div>
  )
}

export function ArenaPanel({ t }: PanelProps): ReactNode {
  return <ToastProvider><ArenaPanelInner t={t} /></ToastProvider>
}
