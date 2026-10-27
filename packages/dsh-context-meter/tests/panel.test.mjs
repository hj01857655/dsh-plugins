/**
 * Behavior tests for the meter's own math: occupancy banding and panel shaping.
 *
 * Pure JS, zero type annotations (PLUGIN-CONTRACT 10), targeting `lib/` — the test script
 * compiles first. The projection folds themselves belong to token-meter and are not
 * re-tested here.
 *
 * @module tests/panel.test
 */

import test from 'node:test'
import assert from 'node:assert/strict'

const { ContextMeter } = await import('../lib/index.js')

function fakeCtx({ sessions, projections }) {
  return {
    sessions,
    sessionProjections: projections,
    reflect: { provide() { /* test stub */ } },
    provide() { /* test stub */ },
    inject() { /* test stub */ },
  }
}

test('occupancyFor: undefined when the window is unknown', () => {
  const meter = new ContextMeter(fakeCtx({
    sessions: { list: () => [{ id: 's1', seq: 3 }] },
    projections: {
      snapshot: (_session, _keys) => ({
        asOfSeq: 2,
        values: { contextPressure: { pressureTokens: 100 } },
      }),
    },
  }))
  assert.equal(meter.occupancyFor('s1'), undefined)
})

test('occupancyFor: projectedTokens preferred over pressureTokens', () => {
  const meter = new ContextMeter(fakeCtx({
    sessions: { list: () => [{ id: 's1', seq: 3 }] },
    projections: {
      snapshot: () => ({
        asOfSeq: 2,
        values: { contextPressure: { pressureTokens: 100, projectedTokens: 200, contextWindow: 1000 } },
      }),
    },
  }))
  assert.equal(meter.occupancyFor('s1'), 0.2)
})

test('occupancyFor: falls back to pressureTokens when no projection exists yet', () => {
  const meter = new ContextMeter(fakeCtx({
    sessions: { list: () => [{ id: 's1', seq: 3 }] },
    projections: {
      snapshot: () => ({
        asOfSeq: 2,
        values: { contextPressure: { pressureTokens: 500, contextWindow: 1000 } },
      }),
    },
  }))
  assert.equal(meter.occupancyFor('s1'), 0.5)
})

test('panelFor: reports keys as absent when token-meter is not mounted', () => {
  const meter = new ContextMeter(fakeCtx({
    sessions: { list: () => [{ id: 's1', seq: 1 }] },
    projections: { snapshot: () => ({ asOfSeq: 0, values: {} }) },
  }))
  const panel = meter.panelFor('s1')
  assert.equal(panel.pressure, undefined)
  assert.equal(panel.breakdown, undefined)
  assert.equal(panel.usage, undefined)
  assert.equal(panel.sessionId, 's1')
})

test('panelFor: unknown session yields the empty panel, not a throw', () => {
  const meter = new ContextMeter(fakeCtx({
    sessions: { list: () => [] },
    projections: { snapshot: () => ({ asOfSeq: -1, values: {} }) },
  }))
  const panel = meter.panelFor('missing')
  assert.equal(panel.sessionId, 'missing')
  assert.equal(panel.pressure, undefined)
})

test('panel(): newest session wins', () => {
  const meter = new ContextMeter(fakeCtx({
    sessions: { list: () => [{ id: 'old', seq: 1 }, { id: 'new', seq: 9 }] },
    projections: {
      snapshot: (session) => ({
        asOfSeq: 8,
        values: { contextPressure: { pressureTokens: 1, contextWindow: 2 }, marker: session.id },
      }),
    },
  }))
  const panel = meter.panel()
  assert.equal(panel.sessionId, 'new')
})

test('panel(): zero-window capacity reports undefined occupancy, never a divide-by-zero', () => {
  const meter = new ContextMeter(fakeCtx({
    sessions: { list: () => [{ id: 's1', seq: 1 }] },
    projections: {
      snapshot: () => ({
        asOfSeq: 0,
        values: { contextPressure: { pressureTokens: 10, contextWindow: 0 } },
      }),
    },
  }))
  assert.equal(meter.occupancyFor('s1'), undefined)
})
