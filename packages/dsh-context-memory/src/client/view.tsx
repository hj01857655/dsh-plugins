/**
 * Pure rendering half of the contextMemory page. Uses shared UI kit.
 * @module client/view
 */

import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'

import type { MemoryState, PanelPayload, RecallHit } from '../types.js'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal,
  SectionTitle, Select, Spinner, StatCard, ToastProvider, tableStyles,
  usePanel, useToast,
} from './ui.js'

export type Translate = (key: string, params?: Record<string, unknown>) => string
export interface PanelProps { t: Translate }

const PANEL_PATH = '/api/context-memory.panel'
const RECALL_PATH = '/api/context-memory.recall'
const REMEMBER_PATH = '/api/context-memory.remember'
const FORGET_PATH = '/api/context-memory.forget'

export function checkLabel(memory: MemoryState, t: Translate): string {
  if (!memory.guard) return t('checkNone')
  switch (memory.verification?.outcome) {
    case 'passed': return t('checkPassed')
    case 'violated': return t('checkViolated')
    case 'broken': return t('checkBroken')
    default: return t('checkPending')
  }
}

export function provenance(memory: MemoryState): string {
  return [memory.source, memory.sessionId !== undefined ? `session ${memory.sessionId}` : null, memory.step !== undefined ? `step ${String(memory.step)}` : null].filter((part) => part !== null).join(' · ')
}

function AddMemoryModal({ t, onClose, onAdded }: { t: Translate; onClose: () => void; onAdded: () => void }): ReactNode {
  const toast = useToast()
  const [text, setText] = useState('')
  const [subject, setSubject] = useState('')
  const [kind, setKind] = useState('fact')
  const [adding, setAdding] = useState(false)

  const handleAdd = useCallback(async () => {
    if (!text.trim()) return
    setAdding(true)
    try {
      const r = await fetch(REMEMBER_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, subject: subject || undefined, kind, source: 'user' }) })
      if (r.ok) { toast('success', t('memoryAdded')); onAdded(); onClose() }
    } finally { setAdding(false) }
  }, [text, subject, kind, t, toast, onAdded, onClose])

  return (
    <Modal title={t('addMemory')} onClose={onClose} width={500}
      footer={<><Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button variant="primary" disabled={adding || !text.trim()} onClick={handleAdd}>{adding ? <Spinner size={14} /> : null} {t('add')}</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label={t('memoryText')}><Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('memoryTextPlaceholder')} /></Field>
        <Field label={t('subjectOptional')}><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t('subjectPlaceholder')} /></Field>
        <Field label={t('kind')}>
          <Select value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: '100%' }}>
            <option value="fact">{t('kindFact')}</option>
            <option value="decision">{t('kindDecision')}</option>
            <option value="preference">{t('kindPreference')}</option>
            <option value="pitfall">{t('kindPitfall')}</option>
          </Select>
        </Field>
      </div>
    </Modal>
  )
}

function ContextMemoryPanelInner({ t }: PanelProps): ReactNode {
  const { payload, error, reload } = usePanel<PanelPayload>(PANEL_PATH)
  const toast = useToast()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHits, setSearchHits] = useState<RecallHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [forgetTarget, setForgetTarget] = useState<{ id: string; reason: string } | null>(null)

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) { setSearchHits(null); return }
    setSearching(true)
    try { const r = await fetch(`${RECALL_PATH}?q=${encodeURIComponent(searchQuery)}&limit=10`); if (r.ok) { setSearchHits((await r.json() as { hits: RecallHit[] }).hits) } }
    finally { setSearching(false) }
  }, [searchQuery])

  const handleForget = useCallback(async () => {
    if (forgetTarget === null) return
    const r = await fetch(FORGET_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(forgetTarget) })
    if (r.ok) { toast('success', t('forgotten')); setForgetTarget(null); reload() }
  }, [forgetTarget, t, toast, reload])

  const header = (
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
      <strong style={{ fontSize: 15 }}>🧠 {t('title')}</strong>
      <span style={{ flex: 1 }} />
      <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>➕ {t('addMemory')}</Button>
      <Button variant="secondary" size="sm" onClick={reload}>{t('refresh')}</Button>
    </header>
  )

  if (error !== null) return <div style={{ maxWidth: 820 }}>{header}<Card><p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--error, #e53935)' }}>{t('failed')}: {error}</p></Card></div>
  if (payload === null) return <div style={{ maxWidth: 820 }}>{header}<div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={28} /></div></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 820 }}>
      {header}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatCard value={payload.totals.active} label={t('active')} />
        <StatCard value={payload.totals.verified} label={t('checkPassed')} />
        <StatCard value={payload.totals.unverified} label={t('unverified')} />
        <StatCard value={payload.totals.superseded} label={t('superseded')} />
      </div>

      {/* Search */}
      <Card title={t('search')} icon="🔍">
        <div style={{ display: 'flex', gap: 8 }}>
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t('searchPlaceholder')}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }} />
          <Button variant="secondary" onClick={handleSearch} disabled={searching}>{searching ? <Spinner size={14} /> : null} {t('search')}</Button>
        </div>
        {searchHits !== null && (
          <div style={{ marginTop: 10 }}>
            {searchHits.length === 0 ? <EmptyState message={t('noResults')} /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {searchHits.map((hit) => (
                  <div key={hit.memory.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <Badge color="info">{hit.score.toFixed(2)}</Badge>
                    <span style={{ fontSize: 12 }}>{hit.memory.text}</span>
                    <span style={{ fontSize: 10, opacity: 0.5 }}>— {hit.why}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Conflicts */}
      {payload.conflicts.length > 0 && (
        <>
          <SectionTitle icon="⚠️">{t('conflicts')}</SectionTitle>
          {payload.conflicts.map((conflict) => (
            <Card key={conflict.subject} title={conflict.subject}>
              {conflict.memories.map((memory) => (
                <div key={memory.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <code style={{ fontSize: 11 }}>{memory.id}</code>
                  <span style={{ fontSize: 12, flex: 1 }}>{memory.text}</span>
                  <Button variant="danger" size="sm" onClick={() => setForgetTarget({ id: memory.id, reason: `conflict resolved: ${conflict.subject}` })}>{t('resolve')}</Button>
                </div>
              ))}
            </Card>
          ))}
        </>
      )}

      {/* Active memories */}
      <SectionTitle icon="✅">{t('active')}</SectionTitle>
      {payload.active.length === 0 ? <EmptyState icon="📭" message={t('empty')} /> : (
        <Card padding={0}>
          <table style={tableStyles.table}>
            <thead><tr><th style={tableStyles.th}>Id</th><th style={tableStyles.th}>{t('memory')}</th><th style={tableStyles.th}>{t('kind')}</th><th style={tableStyles.th}>{t('status')}</th><th style={tableStyles.th}>{t('from')}</th><th style={tableStyles.th} /></tr></thead>
            <tbody>
              {payload.active.map((memory) => (
                <tr key={memory.id}>
                  <td style={tableStyles.td}><code style={{ fontSize: 11 }}>{memory.id}</code></td>
                  <td style={tableStyles.td}>{memory.text}</td>
                  <td style={tableStyles.td}><Badge>{memory.kind}</Badge></td>
                  <td style={tableStyles.td}>{checkLabel(memory, t)}</td>
                  <td style={{ ...tableStyles.td, fontSize: 11, opacity: 0.6 }}>{provenance(memory)}</td>
                  <td style={tableStyles.td}><Button variant="danger" size="sm" onClick={() => setForgetTarget({ id: memory.id, reason: 'superseded from panel' })}>🗑</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {payload.superseded.length > 0 && (
        <>
          <SectionTitle icon="📦">{t('superseded')} ({payload.superseded.length})</SectionTitle>
          <Card padding={0}>
            <table style={tableStyles.table}>
              <thead><tr><th style={tableStyles.th}>Id</th><th style={tableStyles.th}>{t('memory')}</th><th style={tableStyles.th}>{t('kind')}</th><th style={tableStyles.th}>{t('status')}</th></tr></thead>
              <tbody>
                {payload.superseded.map((memory) => (
                  <tr key={memory.id}><td style={tableStyles.td}><code style={{ fontSize: 11 }}>{memory.id}</code></td><td style={tableStyles.td}>{memory.text}</td><td style={tableStyles.td}><Badge>{memory.kind}</Badge></td><td style={tableStyles.td}>{checkLabel(memory, t)}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {addOpen && <AddMemoryModal t={t} onClose={() => setAddOpen(false)} onAdded={reload} />}
      {forgetTarget !== null && <ConfirmDialog title={t('forget')} message={t('confirmForget')} confirmLabel={t('forget')} danger onConfirm={handleForget} onClose={() => setForgetTarget(null)} />}
    </div>
  )
}

export function ContextMemoryPanel({ t }: PanelProps): ReactNode {
  return <ToastProvider><ContextMemoryPanelInner t={t} /></ToastProvider>
}
