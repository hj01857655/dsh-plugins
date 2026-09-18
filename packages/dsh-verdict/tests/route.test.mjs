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
import {
  buildPanelPayload, registerVerdictRoutes,
  VERDICT_PANEL_PATH, VERDICT_SKILLS_WRITE_PATH,
} from '../lib/routes.js'
import { recordSession } from '../lib/session.js'
import { findCandidates } from '../lib/skills.js'

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
      skills: () => [],
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
      skills: () => [],
    }
    const registered = []
    const ctx = {
      connection: { fetch: { register: (route) => { registered.push(route) } } },
      inject: (keys, cb) => { if (keys.includes('connection')) cb(ctx) },
    }
    registerVerdictRoutes(ctx, verdict)
    assert.equal(registered.length, 2)
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
    assert.doesNotThrow(() => registerVerdictRoutes({ inject: () => {} }, verdict))
  } finally {
    cleanup()
  }
})

function repeatedFixture() {
  const f = fixture()
  for (let i = 0; i < 3; i++) {
    recordSession(f.dataDir, {
      trigger: 'test', intent: 'verify a change', outcome: 'success',
      steps: ['run tests', 'commit'], rules: [],
    })
  }
  return f
}

function verdictOver(root, dataDir) {
  return {
    panel: () => panelState(root, dataDir),
    rows: () => ruleRows(root, dataDir),
    diff: () => compare(readSnapshot(dataDir, 'before'), readSnapshot(dataDir, 'after')),
    skills: () => [],
    writeSkillByKey: () => undefined,
  }
}

test('the panel payload carries skill candidates distilled from repeated successes', () => {
  const { root, dataDir, cleanup } = repeatedFixture()
  try {
    const verdict = {
      ...verdictOver(root, dataDir),
      skills: () => findCandidates(dataDir),
      writeSkillByKey: (key) => {
        const candidate = findCandidates(dataDir).find((entry) => entry.key === key)
        if (candidate === undefined) return undefined
        return { path: join(root, 'skills', 'written.md'), verified: true }
      },
    }
    const payload = buildPanelPayload(verdict)
    assert.equal(payload.skills.length, 1)
    assert.equal(payload.skills[0].occurrences, 3)
    assert.deepEqual(payload.skills[0].steps, ['run tests', 'commit'])
  } finally {
    cleanup()
  }
})

test('the write route records the skill and reports its verification honestly', async () => {
  const { root, dataDir, cleanup } = repeatedFixture()
  try {
    const verdict = {
      ...verdictOver(root, dataDir),
      skills: () => findCandidates(dataDir),
      writeSkillByKey: (key) => {
        const candidate = findCandidates(dataDir).find((entry) => entry.key === key)
        if (candidate === undefined) return undefined
        return { path: join(root, 'skills', 'written.md'), verified: true }
      },
    }
    const registered = []
    const ctx = {
      connection: { fetch: { register: (r) => { registered.push(r) } } },
      inject: (keys, cb) => { if (keys.includes('connection')) cb(ctx) },
    }
    registerVerdictRoutes(ctx, verdict)
    const route = registered.find((r) => r.path === VERDICT_SKILLS_WRITE_PATH)
    assert.ok(route, 'the write route must be registered')
    assert.deepEqual(route.methods, ['POST'])

    const key = buildPanelPayload(verdict).skills[0].key
    const response = await route.fetch(
      new Request(`http://host${VERDICT_SKILLS_WRITE_PATH}`, {
        method: 'POST', body: JSON.stringify({ key }),
      }),
    )
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.match(String(body.path), /skills/)
    assert.equal(typeof body.verified, 'boolean')
  } finally {
    cleanup()
  }
})

test('the write route answers 404 for an unknown candidate key', async () => {
  const { root, dataDir, cleanup } = repeatedFixture()
  try {
    const verdict = {
      ...verdictOver(root, dataDir),
      skills: () => findCandidates(dataDir),
      writeSkillByKey: () => undefined,
    }
    const registered = []
    const ctx = {
      connection: { fetch: { register: (r) => { registered.push(r) } } },
      inject: (keys, cb) => { if (keys.includes('connection')) cb(ctx) },
    }
    registerVerdictRoutes(ctx, verdict)
    const route = registered.find((r) => r.path === VERDICT_SKILLS_WRITE_PATH)
    const response = await route.fetch(
      new Request(`http://host${VERDICT_SKILLS_WRITE_PATH}`, {
        method: 'POST', body: JSON.stringify({ key: 'nope' }),
      }),
    )
    assert.equal(response.status, 404)
  } finally {
    cleanup()
  }
})
