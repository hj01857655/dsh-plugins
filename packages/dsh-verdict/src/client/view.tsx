/**
 * Pure rendering half of the Verdict page. Uses shared UI kit.
 *
 * @module client/view
 */

import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'

import type { VerdictView } from '../verdict-view.js'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal,
  SectionTitle, Spinner, StatCard, ToastProvider, useToast,
} from './ui.js'

export type Translate = (key: string, params?: Record<string, unknown>) => string

export interface ViewPanelProps {
  view: VerdictView
  t: Translate
  onRefresh: () => void
  onWrite: (key: string) => void
  writing: string | null
  onLearn: (text: string, guard?: string) => void
  learning: boolean
  onCheck: () => void
  checking: boolean
}

export function ViewPanel({ view, t, onRefresh, onWrite, writing, onLearn, learning, onCheck, checking }: ViewPanelProps): ReactNode {
  const toast = useToast()
  const [learnOpen, setLearnOpen] = useState(false)
  const [writeTarget, setWriteTarget] = useState<string | null>(null)

  const handleWrite = useCallback(() => {
    if (writeTarget !== null) { onWrite(writeTarget); setWriteTarget(null) }
  }, [writeTarget, onWrite])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 820 }}>
      {view.alerts.length > 0 && (
        <Card style={{ borderColor: 'var(--warning, #ed6c02)', background: 'rgba(245,124,0,0.06)' }}>
          {view.alerts.map((alert) => <div key={alert} style={{ fontSize: 12, marginBottom: 2 }}>{alert}</div>)}
        </Card>
      )}

      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>⚖️ {t('title')}</strong>
        {view.summary.map((entry) => <Badge key={entry.label} color="info">{entry.count} {entry.label}</Badge>)}
        <span style={{ flex: 1 }} />
        <Button variant="primary" size="sm" onClick={() => setLearnOpen(true)}>➕ {t('addRule')}</Button>
        <Button variant="secondary" size="sm" onClick={onCheck} disabled={checking}>{checking ? <Spinner size={14} /> : null} {t('runCheck')}</Button>
        <Button variant="secondary" size="sm" onClick={onRefresh}>{t('refresh')}</Button>
      </header>

      {view.empty ? <EmptyState icon="📋" message={t('empty')} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {view.rows.map((rule) => (
            <Card key={rule.id}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>{rule.text}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <Badge>{rule.stateLabel}</Badge>
                {rule.verified && <Badge color="success">{t('guardPassed')}</Badge>}
                {rule.broken && <Badge color="error">{t('guardCannotRun')}</Badge>}
                {rule.unhomed && <Badge color="warning">{t('unhomed')}</Badge>}
                {rule.recurrences > 0 && <Badge color="error">{t('violationEpisodes', { count: rule.recurrences })}</Badge>}
                {rule.guard !== undefined && <code style={{ fontSize: 11, opacity: 0.7 }}>{rule.guard}</code>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle icon="📦">{t('skills')}</SectionTitle>
      {view.skills.length === 0 ? <EmptyState message={t('skillsNone')} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {view.skills.map((skill) => (
            <Card key={skill.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong style={{ fontSize: 13 }}>{skill.intent ?? skill.key}</strong>
                <Button variant="secondary" size="sm" onClick={() => setWriteTarget(skill.key)} disabled={writing !== null}>
                  {writing === skill.key ? <Spinner size={12} /> : null} {t('writeSkill')}
                </Button>
              </div>
              <Badge color="info">{t('successfulRuns', { runs: skill.occurrences, steps: skill.steps.length })}</Badge>
              <ol style={{ margin: '6px 0 0 18px', fontSize: 12, opacity: 0.85 }}>
                {skill.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle icon="📊">{t('sessionsTitle')}</SectionTitle>
      <Card>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>{t('sessionsCount', { total: view.sessions.total, candidates: view.sessions.skillCandidates })}</div>
        {view.comparison.sufficient ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 12 }}>{t('improved')} <strong>{view.comparison.improved.length === 0 ? t('none') : view.comparison.improved.join(', ')}</strong></div>
            <div style={{ fontSize: 12 }}>{t('regressed')} <strong style={{ color: view.comparison.regressed.length > 0 ? 'var(--error, #e53935)' : undefined }}>{view.comparison.regressed.length === 0 ? t('none') : view.comparison.regressed.join(', ')}</strong></div>
            {view.comparison.guardChanges.length > 0 && <div style={{ fontSize: 11, opacity: 0.6 }}>{t('guardChanges')} {view.comparison.guardChanges.join('; ')}</div>}
          </div>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.6 }}>{t('comparisonUnavailable')} {view.comparison.text}</div>
        )}
      </Card>

      {learnOpen && <LearnModal t={t} onClose={() => setLearnOpen(false)} onLearn={onLearn} learning={learning} />}
      {writeTarget !== null && <ConfirmDialog title={t('writeSkill')} message={t('confirmWrite')} confirmLabel={t('writeSkill')} onConfirm={handleWrite} onClose={() => setWriteTarget(null)} />}
    </div>
  )
}

function LearnModal({ t, onClose, onLearn, learning }: {
  t: Translate; onClose: () => void; onLearn: (text: string, guard?: string) => void; learning: boolean
}): ReactNode {
  const [text, setText] = useState('')
  const [guard, setGuard] = useState('')

  const handleAdd = useCallback(() => {
    if (text.trim()) { onLearn(text, guard.trim() || undefined); onClose() }
  }, [text, guard, onLearn, onClose])

  return (
    <Modal title={t('addRule')} onClose={onClose} width={520}
      footer={<><Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
        <Button variant="primary" disabled={learning || !text.trim()} onClick={handleAdd}>{learning ? <Spinner size={14} /> : null} {t('add')}</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label={t('ruleText')} hint={t('ruleTextHint')}>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('ruleTextPlaceholder')} />
        </Field>
        <Field label={t('guard')} hint={t('guardHint')}>
          <Input value={guard} onChange={(e) => setGuard(e.target.value)} placeholder={t('guardPlaceholder')} />
        </Field>
      </div>
    </Modal>
  )
}
