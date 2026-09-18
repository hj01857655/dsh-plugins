/**
 * Browser half of dsh-verdict: the Verdict page inside Settings.
 *
 * Registered into the host's `settings.section` slot; the data comes from
 * `GET /api/verdict.panel`, which the host half registers on the web
 * connection. The page draws only what the view model decides: verification
 * is shown because a guard ran and passed, and a one-sided comparison states
 * its insufficiency instead of a verdict.
 */

import { useCallback, useEffect, useState } from 'react'
import type { ComponentType, CSSProperties } from 'react'

import { buildVerdictView, VERDICT_PANEL_PATH, type PanelPayload, type VerdictView } from '../verdict-view.js'

/**
 * The slice of the slots service this half uses, kept local so typechecking
 * needs no host type packages. The runtime contract is the host's: the
 * settings shell renders every registered `settings.section` entry.
 */
interface SlotsService {
  inject(name: string, register: () => void): void
  register(
    options: { name: string; id: string; order: number; label: () => string },
    component: ComponentType,
  ): unknown
}

interface PanelState {
  view: VerdictView | null
  error: string | null
  loading: boolean
}

/** Fetch, decode, and re-derive the panel; `reload` re-runs the whole pass. */
function useVerdictPanel(): PanelState & { reload: () => void } {
  const [state, setState] = useState<PanelState>({ view: null, error: null, loading: true })
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    setState({ view: null, error: null, loading: true })
    fetch(VERDICT_PANEL_PATH, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`panel request failed with ${response.status}`)
        return buildVerdictView((await response.json()) as PanelPayload)
      })
      .then((view) => {
        if (!controller.signal.aborted) setState({ view, error: null, loading: false })
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setState({ view: null, error: cause instanceof Error ? cause.message : String(cause), loading: false })
      })
    return () => controller.abort()
  }, [tick])

  return { ...state, reload }
}

const card: CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '0.5px solid rgba(128,128,128,0.4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const muted: CSSProperties = { fontSize: 12, opacity: 0.75 }

function VerdictPanel() {
  const { view, error, loading, reload } = useVerdictPanel()

  if (error !== null) {
    return (
      <section style={{ ...card, maxWidth: 760 }}>
        <p style={{ margin: 0, fontSize: 13 }} role="alert">Verdict panel failed to load: {error}</p>
        <button type="button" onClick={reload} style={{ alignSelf: 'flex-start' }}>Retry</button>
      </section>
    )
  }
  if (view === null) return <p style={muted} aria-live="polite">Loading the verdict panel…</p>

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
        <button type="button" onClick={reload} style={{ fontSize: 12 }}>Refresh</button>
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

/** Register the Verdict page into the settings shell. */
export function apply(ctx: { slots: SlotsService }): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'verdict',
    order: 40,
    label: () => 'Verdict',
  }, VerdictPanel))
}
