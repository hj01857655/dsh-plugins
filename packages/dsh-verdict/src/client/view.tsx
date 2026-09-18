/**
 * Pure rendering half of the Verdict page.
 *
 * Deliberately separate from `index.tsx`: this module imports nothing but React and the
 * view model types, so a static render (`react-dom/server`) can assert in Node what the
 * page draws — the bundle itself is a loader factory that only a browser can run. The
 * rule the component enforces with its structure is the plugin's rule: draw exactly what
 * the view model decided, invent nothing here.
 */

import type { CSSProperties } from 'react'

import type { VerdictView } from '../verdict-view.js'

/** Props for the pure rendering half; data fetching stays in VerdictPanel. */
export interface ViewPanelProps {
  view: VerdictView
  onRefresh: () => void
  onWrite: (key: string) => void
  writing: string | null
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
export function ViewPanel({ view, onRefresh, onWrite, writing }: ViewPanelProps) {
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
        <strong style={{ fontSize: 13 }}>Rules</strong>
        {view.summary.map((entry) => (
          <span key={entry.label} style={muted}>{entry.count} {entry.label}</span>
        ))}
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onRefresh} style={{ fontSize: 12 }}>Refresh</button>
      </header>

      {view.empty ? (
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
          No rules captured yet. Record one with <code>verdict learn "…"</code> or <code>ctx.verdict.learn(…)</code>.
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {view.rows.map((rule) => (
            <li key={rule.id} style={card}>
              <span style={{ fontSize: 13 }}>{rule.text}</span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, ...muted }}>
                <span>{rule.stateLabel}</span>
                {rule.verified && <span>guard passed</span>}
                {rule.broken && <span>guard cannot run</span>}
                {rule.unhomed && <span>missing from the agent file</span>}
                {rule.recurrences > 0 && <span>{rule.recurrences} violation episode(s)</span>}
                {rule.guard !== undefined && <code style={{ fontSize: 11 }}>{rule.guard}</code>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <strong style={{ fontSize: 13 }}>Skills</strong>
        <span style={muted}>
          {view.skills.length === 0
            ? 'none yet — a procedure appears here after the same steps succeed three times'
            : `${view.skills.length} procedure(s) repeated enough to become skills`}
        </span>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {view.skills.map((skill) => (
            <li key={skill.key} style={card}>
              <span style={{ fontSize: 13 }}>{skill.intent ?? skill.key}</span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, ...muted }}>
                <span>{skill.occurrences} successful run(s) · {skill.steps.length} step(s)</span>
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
                {writing === skill.key ? 'writing…' : 'Write skill'}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <strong style={{ fontSize: 13 }}>Sessions &amp; comparison</strong>
        <span style={muted}>
          {view.sessions.total} session(s) recorded · {view.sessions.skillCandidates} skill candidate(s)
        </span>
        {view.comparison.sufficient ? (
          <>
            <span style={muted}>
              improved: {view.comparison.improved.length === 0 ? 'none' : view.comparison.improved.join(', ')}
            </span>
            <span style={muted}>
              regressed: {view.comparison.regressed.length === 0 ? 'none' : view.comparison.regressed.join(', ')}
            </span>
            {view.comparison.guardChanges.length > 0 && (
              <span style={muted}>guard changes (not verdicts): {view.comparison.guardChanges.join('; ')}</span>
            )}
          </>
        ) : (
          <span style={muted}>comparison unavailable — {view.comparison.text}</span>
        )}
      </section>
    </div>
  )
}
