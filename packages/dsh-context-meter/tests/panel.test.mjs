/**
 * Behavior tests for the meter's own folds: row shaping, route fold, occupancy banding.
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

test('rows(): newest session first', () => {
  const meter = new ContextMeter(fakeCtx({
    sessions: {
      list: () => [{ id: 'old', seq: 1 }, { id: 'new', seq: 9 }],
      eventAt: () => undefined,
    },
    projections: { snapshot: () => ({ asOfSeq: 0, values: {} }) },
  }))
  const rows = meter.rows()
  assert.equal(rows.length, 2)
  assert.equal(rows[0].sessionId, 'new')
  assert.equal(rows[1].sessionId, 'old')
})

test('rowFor: title flows from the title projection', () => {
  const meter = new ContextMeter(fakeCtx({
    sessions: { list: () => [{ id: 's1', seq: 3 }], eventAt: () => undefined },
    projections: {
      snapshot: () => ({ asOfSeq: 2, values: { title: '重构登录流程' } }),
    },
  }))
  const row = meter.rowFor('s1')
  assert.equal(row.title, '重构登录流程')
})

test('routeFold: last-wins provider/model from request/header events', () => {
  const events = new Map([
    [0, { type: 'request/header', data: { header: { config: { provider: 'deepseek', model: 'old-model' } } } }],
    [3, { type: 'request/header', data: { header: { config: { provider: 'deepseek', model: 'new-model' } } } }],
  ])
  const meter = new ContextMeter(fakeCtx({
    sessions: {
      list: () => [{ id: 's1', seq: 5 }],
      eventAt: (seq) => events.get(seq),
    },
    projections: { snapshot: () => ({ asOfSeq: 4, values: {} }) },
  }))
  const row = meter.rowFor('s1')
  assert.deepEqual(row.route, { provider: 'deepseek', model: 'new-model' })
})

test('routeFold: non-header events are skipped, not treated as absent routes', () => {
  const meter = new ContextMeter(fakeCtx({
    sessions: {
      list: () => [{ id: 's1', seq: 2 }],
      eventAt: () => ({ type: 'user/message', data: {} }),
    },
    projections: { snapshot: () => ({ asOfSeq: 1, values: {} }) },
  }))
  const row = meter.rowFor('s1')
  assert.equal(row.route, undefined)
})

test('rowFor: unknown session yields a row with absent figures, not a throw', () => {
  const meter = new ContextMeter(fakeCtx({
    sessions: { list: () => [] },
    projections: { snapshot: () => ({ asOfSeq: -1, values: {} }) },
  }))
  const row = meter.rowFor('missing')
  assert.equal(row.sessionId, 'missing')
  assert.equal(row.pressure, undefined)
  assert.equal(row.route, undefined)
})

test('rowFor: token-meter absent reports keys as absent, never estimates', () => {
  const meter = new ContextMeter(fakeCtx({
    sessions: { list: () => [{ id: 's1', seq: 1 }], eventAt: () => undefined },
    projections: { snapshot: () => ({ asOfSeq: 0, values: {} }) },
  }))
  const row = meter.rowFor('s1')
  assert.equal(row.pressure, undefined)
  assert.equal(row.usage, undefined)
})

test('host without a sessionProjections registry keeps the service alive', () => {
  const meter = new ContextMeter(fakeCtx({
    sessions: { list: () => [{ id: 's1', seq: 1 }] },
    projections: undefined,
  }))
  const row = meter.rowFor('s1')
  assert.equal(row.pressure, undefined)
})

test('host without eventAt loses only the route column', () => {
  const meter = new ContextMeter(fakeCtx({
    sessions: { list: () => [{ id: 's1', seq: 4 }] },
    projections: {
      snapshot: () => ({ asOfSeq: 3, values: { title: 't' } }),
    },
  }))
  const row = meter.rowFor('s1')
  assert.equal(row.title, 't')
  assert.equal(row.route, undefined)
})
