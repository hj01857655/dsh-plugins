/**
 * Tests for the host route that serves the panel to the browser half.
 *
 * The route is the only bridge between the panel's view model and the web
 * settings page, so its tests pin down three things: the payload is the
 * re-derived truth (fresh check, rows, comparison), the registration shape
 * matches Connection's fetch route contract, and a host without the web
 * connection keeps loading the plugin instead of failing.
 */

import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { compare, panelState, readSnapshot, ruleRows } from '../lib/client.js'
import { learn } from '../lib/pipeline.js'
import { buildPanelPayload, registerVerdictRoutes, VERDICT_PANEL_PATH } from '../lib/routes.js'

function fixture() {
  const root = join('/tmp', `verdict-route-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const dataDir = join(root, '.verdict')
  return {
    root,
    dataDir,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

test('panel payload carries counts, fresh rows, and the comparison verdict', () => {
  const { root, dataDir, cleanup } = fixture()
  try {
    learn(root, dataDir, 'never commit the file .env')
    const verdict = {
      panel: () => panelState(root, dataDir),
      rows: () => ruleRows(root, dataDir),
      diff: () => compare(readSnapshot(dataDir, 'before'), readSnapshot(dataDir, 'after')),
    }
    const payload = buildPanelPayload(verdict)
    assert.equal(payload.counts.promoted, 1)
    assert.equal(payload.rows.length, 1)
    assert.equal(typeof payload.rows[0].verified, 'boolean')
    assert.equal(payload.comparison.sufficient, false)
  } finally {
    cleanup()
  }
})

test('the panel route is registered as a GET fetch route and serves the payload', async () => {
  const { root, dataDir, cleanup } = fixture()
  try {
    learn(root, dataDir, 'never commit the file .env')
    const verdict = {
      panel: () => panelState(root, dataDir),
      rows: () => ruleRows(root, dataDir),
      diff: () => compare(readSnapshot(dataDir, 'before'), readSnapshot(dataDir, 'after')),
    }
    const registered = []
    const ctx = { connection: { fetch: { register: (route) => { registered.push(route) } } } }
    registerVerdictRoutes(ctx, verdict)
    assert.equal(registered.length, 1)
    assert.equal(registered[0].path, VERDICT_PANEL_PATH)
    assert.ok(registered[0].methods.includes('GET'))
    const response = await registered[0].fetch(new Request(`http://host${VERDICT_PANEL_PATH}`))
    assert.equal(response.status, 200)
    const payload = await response.json()
    assert.equal(payload.counts.promoted, 1)
  } finally {
    cleanup()
  }
})

test('a host without the web connection loads the plugin without a panel', () => {
  const { root, dataDir, cleanup } = fixture()
  try {
    learn(root, dataDir, 'never commit the file .env')
    const verdict = {
      panel: () => panelState(root, dataDir),
      rows: () => ruleRows(root, dataDir),
      diff: () => compare(readSnapshot(dataDir, 'before'), readSnapshot(dataDir, 'after')),
    }
    assert.doesNotThrow(() => registerVerdictRoutes({}, verdict))
  } finally {
    cleanup()
  }
})
