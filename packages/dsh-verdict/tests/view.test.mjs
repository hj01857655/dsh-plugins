/**
 * Tests for the panel's browser-side view model.
 *
 * The view model is the pure half of the browser bundle — importable in Node,
 * testable without a DOM. Its tests pin down what the page may claim: a
 * promoted rule is only "verified" when the payload says its guard ran and
 * passed, and a comparison without both sides shows its insufficiency instead
 * of an improvement.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildVerdictView, EMPTY_PAYLOAD } from '../lib/verdict-view.js'

const row = (over = {}) => ({
  id: 'abc123', text: 'never commit the file .env', state: 'promoted', verified: true,
  broken: false, homed: true, recurrences: 0, ...over,
})

test('an untouched project renders the empty state, not a row', () => {
  const view = buildVerdictView(EMPTY_PAYLOAD)
  assert.equal(view.empty, true)
  assert.equal(view.rows.length, 0)
})

test('a verified promoted rule shows its verification separately from promotion', () => {
  const view = buildVerdictView({
    counts: { candidate: 0, promoted: 1, ineffective: 0 },
    rows: [row()],
    violated: [], broken: [], unhomed: [],
    sessions: { total: 3, skillCandidates: 1 },
    skills: [],
    comparison: { sufficient: false, improved: [], regressed: [], guardChanges: [] },
  })
  assert.equal(view.empty, false)
  assert.equal(view.rows[0].stateLabel, 'in force')
  assert.equal(view.rows[0].verified, true)
  assert.deepEqual(view.alerts, [])
})

test('broken and unhomed rules surface as alerts, not as silent rows', () => {
  const view = buildVerdictView({
    counts: { candidate: 0, promoted: 2, ineffective: 0 },
    rows: [
      row({ id: 'b1', broken: true }),
      row({ id: 'u1', homed: false }),
    ],
    violated: [], broken: ['b1'], unhomed: ['u1'],
    sessions: { total: 0, skillCandidates: 0 },
    skills: [],
    comparison: { sufficient: false, improved: [], regressed: [], guardChanges: [] },
  })
  assert.deepEqual(view.alerts, ['b1: guard cannot run', 'u1: rule no longer present in the agent file'])
})

test('an insufficient comparison states why instead of claiming a result', () => {
  const view = buildVerdictView({
    counts: { candidate: 0, promoted: 0, ineffective: 0 },
    rows: [], violated: [], broken: [], unhomed: [],
    sessions: { total: 0, skillCandidates: 0 },
    skills: [],
    comparison: {
      sufficient: false, improved: [], regressed: [], guardChanges: [],
      reason: 'two snapshots are required: one taken before the change and one after',
    },
  })
  assert.equal(view.comparison.sufficient, false)
  assert.match(view.comparison.text, /two snapshots are required/)
})

test('a sufficient comparison reports improvements and regressions by id', () => {
  const view = buildVerdictView({
    counts: { candidate: 0, promoted: 2, ineffective: 0 },
    rows: [row({ id: 'good' }), row({ id: 'bad', verified: false })],
    violated: ['bad'], broken: [], unhomed: [],
    sessions: { total: 0, skillCandidates: 0 },
    skills: [],
    comparison: { sufficient: true, improved: ['good'], regressed: ['bad'], guardChanges: [] },
  })
  assert.equal(view.comparison.sufficient, true)
  assert.deepEqual(view.comparison.improved, ['good'])
  assert.deepEqual(view.comparison.regressed, ['bad'])
})

test('skill candidates map to the page view with intent preserved', () => {
  const view = buildVerdictView({
    counts: { candidate: 0, promoted: 0, ineffective: 0 },
    rows: [], violated: [], broken: [], unhomed: [],
    sessions: { total: 3, skillCandidates: 1 },
    skills: [{ key: 'k1', steps: ['run tests', 'commit'], occurrences: 3, intent: 'verify a change', evidence: [1, 2, 3] }],
    comparison: { sufficient: false, improved: [], regressed: [], guardChanges: [] },
  })
  assert.equal(view.skills.length, 1)
  assert.equal(view.skills[0].intent, 'verify a change')
  assert.deepEqual(view.skills[0].steps, ['run tests', 'commit'])
})

test('a candidate without an agreed intent shows without one', () => {
  const view = buildVerdictView({
    counts: { candidate: 0, promoted: 0, ineffective: 0 },
    rows: [], violated: [], broken: [], unhomed: [],
    sessions: { total: 3, skillCandidates: 1 },
    skills: [{ key: 'k2', steps: ['a'], occurrences: 3, evidence: [1, 2, 3] }],
    comparison: { sufficient: false, improved: [], regressed: [], guardChanges: [] },
  })
  assert.equal(view.skills[0].intent, undefined)
})
