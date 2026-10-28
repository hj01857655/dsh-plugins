/**
 * The candidate routes, exercised through the real connection registration path.
 *
 * The queue's own contract is covered in `candidates.test.mjs`. What is checked here is
 * the part that only exists once the plugin is mounted on a host with a web connection:
 * that the panel can see pending proposals, that accepting through the route writes a
 * memory, and that the route cannot be talked into accepting something that is not open.
 *
 * A stub connection is used because the shape being tested is the registration contract —
 * `fetch.register({ path, methods, requestBody, fetch })` — not the HTTP transport.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Context, Service } from '@deepseek-ai/cordis'

import { ContextMemory } from '../lib/memory.js'
import { MEMORY_CANDIDATES_PATH, registerMemoryRoutes } from '../lib/routes.js'

function tempProject() {
  return mkdtempSync(join(tmpdir(), 'context-memory-routes-'))
}

/** A connection service that just records what was registered. */
class FakeConnection extends Service {
  constructor(ctx) {
    super(ctx, 'connection')
    this.routes = new Map()
    this.fetch = {
      register: (route) => { this.routes.set(route.path, route) },
    }
  }
}

/** The service shape `registerMemoryRoutes` reads, over a real `ContextMemory`. */
function serviceOver(memory) {
  return {
    panel: () => memory.panel(),
    recall: (query, limit) => memory.recall(query, limit),
    remember: (input) => memory.remember(input),
    forget: (id, reason, replacedBy) => memory.forget(id, reason, replacedBy),
    verify: () => memory.verify(),
    active: () => memory.active(),
    conflicts: () => memory.conflicts(),
    candidates: () => memory.candidates(),
    accept: (id, overrides) => memory.accept(id, overrides),
    dismiss: (id) => memory.dismiss(id),
    prefs: () => ({ autoCapture: true, recallInject: true }),
    setPrefs: (patch) => ({ autoCapture: patch.autoCapture ?? true, recallInject: patch.recallInject ?? true }),
    locations: () => memory.locations,
  }
}

async function hostWithRoute(memory) {
  const ctx = new Context()
  await ctx.plugin(FakeConnection)
  registerMemoryRoutes(ctx, serviceOver(memory))
  await new Promise((resolve) => setImmediate(resolve))
  return { ctx, connection: ctx.get('connection') }
}

function post(route, body) {
  return route.fetch(new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

test('routes: the candidate route answers GET with the pending proposals', async () => {
  const dir = tempProject()
  try {
    const memory = new ContextMemory(dir)
    memory.propose({ text: 'we use sqlite' })
    const { connection } = await hostWithRoute(memory)
    const route = connection.routes.get(MEMORY_CANDIDATES_PATH)
    assert.ok(route, 'the route was registered')

    const response = await route.fetch(new Request('http://localhost/api', { method: 'GET' }))
    const body = await response.json()
    assert.equal(body.candidates.length, 1)
    assert.equal(body.candidates[0].text, 'we use sqlite')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('routes: accepting through the route writes a memory', async () => {
  const dir = tempProject()
  try {
    const memory = new ContextMemory(dir)
    const proposed = memory.propose({ text: 'we use sqlite', kind: 'decision' })
    const { connection } = await hostWithRoute(memory)
    const response = await post(connection.routes.get(MEMORY_CANDIDATES_PATH), { id: proposed.id, action: 'accept' })
    assert.equal(response.status, 200)
    const stored = await response.json()
    assert.equal(stored.id, proposed.id)
    assert.equal(stored.kind, 'decision');
    assert.equal(memory.active().length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('routes: dismissing through the route leaves the log alone', async () => {
  const dir = tempProject()
  try {
    const memory = new ContextMemory(dir)
    const proposed = memory.propose({ text: 'we use sqlite' })
    const { connection } = await hostWithRoute(memory)
    const response = await post(connection.routes.get(MEMORY_CANDIDATES_PATH), { id: proposed.id, action: 'dismiss' })
    assert.equal(response.status, 200)
    assert.equal(memory.candidates().length, 0)
    assert.equal(memory.active().length, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('routes: an unknown id is a 404, not a silent success', async () => {
  const dir = tempProject()
  try {
    const memory = new ContextMemory(dir)
    const { connection } = await hostWithRoute(memory)
    const route = connection.routes.get(MEMORY_CANDIDATES_PATH)
    assert.equal((await post(route, { id: 'nope', action: 'accept' })).status, 404)
    assert.equal((await post(route, { id: 'nope', action: 'dismiss' })).status, 404)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('routes: a missing id or an unknown action is rejected', async () => {
  const dir = tempProject()
  try {
    const memory = new ContextMemory(dir)
    const proposed = memory.propose({ text: 'we use sqlite' })
    const { connection } = await hostWithRoute(memory)
    const route = connection.routes.get(MEMORY_CANDIDATES_PATH)
    assert.equal((await post(route, { action: 'accept' })).status, 400)
    assert.equal((await post(route, { id: proposed.id, action: 'maybe' })).status, 400)
    // Nothing happened to the queue either way.
    assert.equal(memory.candidates().length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('routes: there is no route that remembers an unaccepted proposal', async () => {
  // The route table is the boundary a browser can reach. If accepting were implicit
  // anywhere — a POST that remembers whatever text it is given — the queue would be
  // decoration. The only writer for candidates takes an id that must already be open.
  const dir = tempProject()
  try {
    const memory = new ContextMemory(dir)
    memory.propose({ text: 'we use sqlite' })
    const { connection } = await hostWithRoute(memory)
    assert.deepEqual([...connection.routes.keys()].sort(), [
      '/api/context-memory.candidates',
      '/api/context-memory.forget',
      '/api/context-memory.panel',
      '/api/context-memory.prefs',
      '/api/context-memory.recall',
      '/api/context-memory.remember',
      '/api/context-memory.stats',
      '/api/context-memory.verify',
    ].sort())
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
