/**
 * Pure rendering half of the Verdict page.
 *
 * Deliberately separate from `index.tsx`: this module imports nothing but React and the
 * view model types, so a static render (`react-dom/server`) can assert in Node what the
 * page draws — the bundle itself is a loader factory that only a browser can run. The
 * rule the component enforces with its structure is the plugin's rule: draw exactly what
 * the view model decided, invent nothing here.
 *
 * Every user-visible string comes from the `t` seat the renderer binds from this plugin's
 * namespace, so the page follows the UI language.
 */

import { useState } from 'react'
import type { CSSProperties } from 'react'

import type { VerdictView } from '../verdict-view.js'

/** The translate seat the renderer binds from this plugin's locale namespace. */
export type Translate = (key: string, params?: Record<string, unknown>) => string

/** Props for the pure rendering half; data fetching stays in VerdictPanel. */
export interface ViewPanelProps {
  view: VerdictView
  /** Bound translate function for this plugin's namespace. */
  t: Translate
  onRefresh: () => void
  onWrite: (key: string) => void
  writing: string | null
  onLearn: (text: string, guard?: string) => void
  learning: boolean
  onCheck: () => void
  checking: boolean
}

export const card: CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '0.5px solid rgba(128,128,128,0.4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

export const muted: CSSProperties = { fontSize: 12, opacity: 0.75 }

/** Draws exactly what the view model decided: verification shown only because a guard ran. */
export function ViewPanel({ view, t, onRefresh, onWrite, writing, onLearn, learning, onCheck, checking }: ViewPanelProps) {
  const [learnText, setLearnText] = useState('')
  const [learnGuard, setLearnGuard] = useState('')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760, fontFamily: 'inherit' }}>
      {view.alerts.length > 0 && (
        <ul
          role="alert"
          style={{
            margin: 0, padding: '8px 12px', borderRadius: 8, listStyle: 'none',
            background: 'rgba(255,159,10,0.14)', fontSize: 12, lineHeight: '20px',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}
        >
          {view.alerts.map((alert) => <li key={alert}>{alert}</li>)}
        </ul>
      )}

      <header style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>{t('title')}</strong>
        {view.summary.map((entry) => (
          <span key={entry.label} style={muted}>{entry.count} {entry.label}</span>
        ))}
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onCheck} disabled={checking} style={{ fontSize: 12, marginRight: 8 }}>{checking ? t('checking') : t('runCheck')}</button>
        <button type="button" onClick={onRefresh} style={{ fontSize: 12 }}>{t('refresh')}</button>
      </header>

      {/* Add rule form */}
      <div style={{ ...card, gap: 6 }}>
        <strong style={{ fontSize: 12 }}>➕ {t('addRule')}</strong>
        <input
          style={{ fontSize: 13, padding: '4px 8px', borderRadius: 4, border: '0.5px solid rgba(128,128,128,0.4)' }}
          placeholder={t('ruleTextPlaceholder')}
          value={learnText}
          onChange={(e) => setLearnText(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ fontSize: 13, padding: '4px 8px', borderRadius: 4, border: '0.5px solid rgba(128,128,128,0.4)', flex: 1 }}
            placeholder={t('guardPlaceholder')}
            value={learnGuard}
            onChange={(e) => setLearnGuard(e.target.value)}
          />
          <button
            type="button"
            onClick={() => { if (learnText.trim()) { onLearn(learnText, learnGuard.trim() || undefined); setLearnText(''); setLearnGuard('') } }}
            disabled={learning || !learnText.trim()}
            style={{ fontSize: 12 }}
          >
            {learning ? t('adding') : t('add')}
          </button>
        </div>
      </div>

      {view.empty ? (
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
          {t('empty')}
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {view.rows.map((rule) => (
            <li key={rule.id} style={card}>
              <span style={{ fontSize: 13 }}>{rule.text}</span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, ...muted }}>
                <span>{rule.stateLabel}</span>
                {rule.verified && <span>{t('guardPassed')}</span>}
                {rule.broken && <span>{t('guardCannotRun')}</span>}
                {rule.unhomed && <span>{t('unhomed')}</span>}
                {rule.recurrences > 0 && <span>{t('violationEpisodes', { count: rule.recurrences })}</span>}
                {rule.guard !== undefined && <code style={{ fontSize: 11 }}>{rule.guard}</code>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <strong style={{ fontSize: 13 }}>{t('skills')}</strong>
        <span style={muted}>
          {view.skills.length === 0
            ? t('skillsNone')
            : t('skillsCount', { count: view.skills.length })}
        </span>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {view.skills.map((skill) => (
            <li key={skill.key} style={card}>
              <span style={{ fontSize: 13 }}>{skill.intent ?? skill.key}</span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, ...muted }}>
                <span>{t('successfulRuns', { runs: skill.occurrences, steps: skill.steps.length })}</span>
              </span>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, opacity: 0.85 }}>
                {skill.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <button
                type="button"
                onClick={() => onWrite(skill.key)}
                disabled={writing !== null}
                style={{ fontSize: 12, alignSelf: 'flex-start' }}
              >
                {writing === skill.key ? t('writing') : t('writeSkill')}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <strong style={{ fontSize: 13 }}>{t('sessionsTitle')}</strong>
        <span style={muted}>
          {t('sessionsCount', { total: view.sessions.total, candidates: view.sessions.skillCandidates })}
        </span>
        {view.comparison.sufficient ? (
          <>
            <span style={muted}>
              {t('improved')} {view.comparison.improved.length === 0 ? t('none') : view.comparison.improved.join(', ')}
            </span>
            <span style={muted}>
              {t('regressed')} {view.comparison.regressed.length === 0 ? t('none') : view.comparison.regressed.join(', ')}
            </span>
            {view.comparison.guardChanges.length > 0 && (
              <span style={muted}>{t('guardChanges')} {view.comparison.guardChanges.join('; ')}</span>
            )}
          </>
        ) : (
          <span style={muted}>{t('comparisonUnavailable')} {view.comparison.text}</span>
        )}
      </section>
    </div>
  )
}
