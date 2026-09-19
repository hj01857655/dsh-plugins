/**
 * Pure rendering half of the promptVcs page. Uses shared UI kit.
 * @module client/view
 */

import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'

import type { PanelPayload, Change } from '../types.js'
import {
  Badge, Button, Card, CodeBlock, ConfirmDialog, EmptyState, Modal,
  SectionTitle, Spinner, StatCard, ToastProvider, tableStyles, usePanel, useToast,
} from './ui.js'

export type Translate = (key: string, params?: Record<string, unknown>) => string
export interface PanelProps { t: Translate }

const PANEL_PATH = '/api/vcs.panel'
const CHANGE_PATH = '/api/vcs.change'
const ROLLBACK_PATH = '/api/vcs.rollback'

function ChangeModal({ hash, t, onClose, onRollback }: {
  hash: string; t: Translate; onClose: () => void; onRollback: () => void
}): ReactNode {
  const toast = useToast()
  const [change, setChange] = useState<Change | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmRb, setConfirmRb] = useState(false)
  const [rolling, setRolling] = useState(false)

  useCallback(() => {
    setLoading(true)
    fetch(`${CHANGE_PATH}?hash=${hash}`).then(async (r) => { if (r.ok) setChange(await r.json() as Change) }).finally(() => setLoading(false))
  }, [hash])()

  const handleRollback = useCallback(async () => {
    setRolling(true)
    try {
      const r = await fetch(ROLLBACK_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hash }) })
      if (r.ok) { toast('success', t('rolledBack')); onRollback(); onClose() }
    } finally { setRolling(false) }
  }, [hash, t, toast, onRollback, onClose])

  return (
    <Modal title={`${t('change')} ${hash.slice(0, 8)}…`} onClose={onClose} width={760}
      footer={<Button variant="danger" size="sm" disabled={rolling} onClick={() => setConfirmRb(true)}>↩ {t('rollback')}</Button>}>
      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><Spinner size={24} /></div>
        : change === null ? <EmptyState message={t('notFound')} />
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{change.file}</div>
            <Card title={t('diff')}><CodeBlock>{change.diff}</CodeBlock></Card>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 250 }}>
                <Badge color="error">{t('before')}</Badge>
                <CodeBlock style={{ marginTop: 6 }} maxHeight={180}>{`${change.oldContent.slice(0, 2000)}${change.oldContent.length > 2000 ? '\n…' : ''}`}</CodeBlock>
              </div>
              <div style={{ flex: 1, minWidth: 250 }}>
                <Badge color="success">{t('after')}</Badge>
                <CodeBlock style={{ marginTop: 6 }} maxHeight={180}>{`${change.newContent.slice(0, 2000)}${change.newContent.length > 2000 ? '\n…' : ''}`}</CodeBlock>
              </div>
            </div>
          </div>
        )}
      {confirmRb && <ConfirmDialog title={t('rollback')} message={t('confirmRollback')} confirmLabel={t('rollback')} danger
        onConfirm={handleRollback} onClose={() => setConfirmRb(false)} />}
    </Modal>
  )
}

function PromptVcsPanelInner({ t }: PanelProps): ReactNode {
  const { payload, error, reload } = usePanel<PanelPayload>(PANEL_PATH)
  const [changeModal, setChangeModal] = useState<string | null>(null)

  const header = (
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
      <strong style={{ fontSize: 15 }}>📝 {t('title')}</strong>
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
        <StatCard value={payload.totalChanges} label={t('totalChanges')} />
        <StatCard value={payload.files.length} label={t('filesTracked')} />
        <StatCard value={payload.watchedFiles.length} label={t('watched')} />
      </div>

      {payload.files.length > 0 && (
        <>
          <SectionTitle icon="📁">{t('files')}</SectionTitle>
          <Card padding={0}>
            <table style={tableStyles.table}>
              <thead><tr><th style={tableStyles.th}>{t('file')}</th><th style={tableStyles.th}>{t('changes')}</th><th style={tableStyles.th}>{t('lastChanged')}</th><th style={tableStyles.th}>{t('size')}</th></tr></thead>
              <tbody>
                {payload.files.map((f) => (
                  <tr key={f.file}><td style={tableStyles.td}><code style={{ fontSize: 11 }}>{f.file}</code></td>
                    <td style={tableStyles.td}>{f.changes}</td><td style={tableStyles.td}>{new Date(f.lastChanged).toLocaleString()}</td><td style={tableStyles.td}>{f.currentSize}B</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <SectionTitle icon="🕒">{t('timeline')}</SectionTitle>
      {payload.timeline.length === 0 ? <EmptyState icon="📭" message={t('empty')} /> : (
        <Card padding={0}>
          <table style={tableStyles.table}>
            <thead><tr><th style={tableStyles.th}>{t('hash')}</th><th style={tableStyles.th}>{t('date')}</th><th style={tableStyles.th}>{t('by')}</th><th style={tableStyles.th}>{t('file')}</th><th style={tableStyles.th}>{t('added')}</th><th style={tableStyles.th}>{t('removed')}</th></tr></thead>
            <tbody>
              {payload.timeline.map((row) => (
                <tr key={row.hash} style={tableStyles.clickRow} onClick={() => setChangeModal(row.hash)}>
                  <td style={tableStyles.td}><code style={{ fontSize: 11 }}>{row.hash.slice(0, 8)}</code></td>
                  <td style={tableStyles.td}>{new Date(row.timestamp).toLocaleString()}</td>
                  <td style={tableStyles.td}>{row.changedBy}</td><td style={tableStyles.td}>{row.file}</td>
                  <td style={{ ...tableStyles.td, color: 'var(--success, #2e7d32)' }}>+{row.addedLines}</td>
                  <td style={{ ...tableStyles.td, color: 'var(--error, #e53935)' }}>-{row.removedLines}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {changeModal !== null && <ChangeModal hash={changeModal} t={t} onClose={() => setChangeModal(null)} onRollback={reload} />}
    </div>
  )
}

export function PromptVcsPanel({ t }: PanelProps): ReactNode {
  return <ToastProvider><PromptVcsPanelInner t={t} /></ToastProvider>
}
