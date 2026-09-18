/**
 * The panel's browser-side view model: payload in, renderable facts out.
 *
 * Pure and dependency-free so it runs in Node's test runner. The React
 * component only draws; every claim on the page is decided here, including
 * the two the plugin exists to enforce — verification is shown only when a
 * guard actually ran and passed, and a one-sided comparison states its
 * insufficiency rather than a verdict.
 *
 * @module verdict/verdict-view
 */

import type { Comparison, RuleRow } from './client.js'

/** The route path the browser half fetches. One panel, one route. */
export const VERDICT_PANEL_PATH = '/api/verdict.panel'

/** POST route that writes one skill candidate out as a file plus its verifying rule. */
export const VERDICT_SKILLS_WRITE_PATH = '/api/verdict.skills.write'

/** A skill candidate as it travels on the wire. */
export interface SkillCandidateWire {
  key: string
  steps: string[]
  occurrences: number
  intent?: string
  evidence: number[]
}

/** The wire shape served by `GET /api/verdict.panel`. */
export interface PanelPayload {
  counts: Record<'candidate' | 'promoted' | 'ineffective', number>
  rows: RuleRow[]
  violated: string[]
  broken: string[]
  unhomed: string[]
  sessions: { total: number; skillCandidates: number }
  comparison: Comparison
  skills: SkillCandidateWire[]
}

/** What a project with no data yet looks like on the wire. */
export const EMPTY_PAYLOAD: PanelPayload = {
  counts: { candidate: 0, promoted: 0, ineffective: 0 },
  rows: [],
  violated: [],
  broken: [],
  unhomed: [],
  sessions: { total: 0, skillCandidates: 0 },
  skills: [],
  comparison: {
    improved: [],
    regressed: [],
    guardChanges: [],
    sufficient: false,
    reason: 'two snapshots are required: one taken before the change and one after',
  },
}

/** One row as the page draws it. */
export interface ViewRow {
  id: string
  text: string
  /** Human-readable lifecycle state. */
  stateLabel: string
  /** The guard ran and passed — never implied by promotion alone. */
  verified: boolean
  broken: boolean
  unhomed: boolean
  recurrences: number
  guard?: string
}

/** One skill candidate as the page draws it. */
export interface ViewSkill {
  key: string
  steps: string[]
  occurrences: number
  intent?: string
}

/** Everything the settings page renders. */
export interface VerdictView {
  /** No rules captured at all: the page shows the capture hint instead. */
  empty: boolean
  /** Rule ids needing attention, with the reason spelled out. */
  alerts: string[]
  summary: { label: string; count: number }[]
  rows: ViewRow[]
  sessions: { total: number; skillCandidates: number }
  skills: ViewSkill[]
  comparison: {
    sufficient: boolean
    improved: string[]
    regressed: string[]
    guardChanges: string[]
    /** Always present when insufficient; the page shows it verbatim. */
    text: string
  }
}

const STATE_LABELS: Record<RuleRow['state'], string> = {
  candidate: 'candidate (no executable check)',
  promoted: 'in force',
  ineffective: 'retired after repeated violations',
}

/** Map the wire payload to the renderable view. */
export function buildVerdictView(payload: PanelPayload): VerdictView {
  const rows = payload.rows.map((rule): ViewRow => ({
    id: rule.id,
    text: rule.text,
    stateLabel: STATE_LABELS[rule.state],
    verified: rule.verified,
    broken: rule.broken,
    unhomed: !rule.homed,
    recurrences: rule.recurrences,
    ...(rule.guard === undefined ? {} : { guard: rule.guard }),
  }))

  // Alerts name the failure, not just the id: a bare id would make the user
  // go find what "broken" means, which is the page's job.
  const alerts = [
    ...payload.broken.map((id) => `${id}: guard cannot run`),
    ...payload.unhomed.map((id) => `${id}: rule no longer present in the agent file`),
  ]

  return {
    empty: payload.rows.length === 0,
    alerts,
    summary: [
      { label: 'candidate', count: payload.counts.candidate },
      { label: 'in force', count: payload.counts.promoted },
      { label: 'retired', count: payload.counts.ineffective },
    ],
    rows,
    sessions: payload.sessions,
    skills: payload.skills.map((candidate): ViewSkill => ({
      key: candidate.key,
      steps: candidate.steps,
      occurrences: candidate.occurrences,
      ...(candidate.intent === undefined ? {} : { intent: candidate.intent }),
    })),
    comparison: {
      sufficient: payload.comparison.sufficient,
      improved: payload.comparison.improved,
      regressed: payload.comparison.regressed,
      guardChanges: payload.comparison.guardChanges,
      text: payload.comparison.reason ?? '',
    },
  }
}
