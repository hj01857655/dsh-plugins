/**
 * The 1.1 additions: the model can finish the review loop, and the stats face says so.
 *
 * The turn-end harvest proposes; until 1.1 only the panel or the CLI could decide. These
 * tests pin the model-facing half: `memory_accept` and `memory_dismiss` act on exactly one
 * pending candidate, report a miss instead of throwing, and `memory_stats` surfaces the
 * queue depth so the model can discover there is something to decide.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Context, Service } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'

import { ContextMemory } from '../lib/memory.js'
import { registerMemoryTools } from '../lib/tools.js'

/** `ToolRuntime` declares `systemPrompt`; registration never runs without it. */
class FakeSystemPrompt extends Service {
  constructor(ctx) { super(ctx, 'systemPrompt') }
  tools() {}
  section() { return () => {} }
  getSectionOrder() { return 0 }
}

function newMemory() {
  const dir = mkdtempSync(join(tmpdir(), 'context-memory-accept-'))
  // A user-global log as well: the scope override has to reach a real store to be tested.
  return new ContextMemory(dir, { userDir: join(dir, 'user-log') })
}

async function hostWithTools(memory) {
  const ctx = new Context()
  await ctx.plugin(FakeSystemPrompt)
  await ctx.plugin(ToolRuntime)
  registerMemoryTools(ctx, { resolve: () => Promise.resolve(memory) })
  await new Promise((resolve) => setImmediate(resolve))
  return ctx
}

function call(ctx, name, args) {
  return ctx.tools.execute({
    callId: `call-${name}-${Math.random().toString(16).slice(2)}`,
    name,
    arguments: args,
    signal: new AbortController().signal,
  })
}

/** Propose one statement and return its id, the way the harvest seam would leave it. */
function proposeOne(memory, text) {
  const candidate = memory.propose({ text })
  assert.ok(candidate !== undefined, 'the proposal was not queued')
  return candidate.id
}

test('tools: memory_stats reports how many candidates are waiting', async () => {
  const memory = newMemory()
  const ctx = await hostWithTools(memory)
  proposeOne(memory, 'the build uses pnpm instead of npm')
  const stats = await call(ctx, 'memory_stats', {})
  assert.equal(stats.isError, false, JSON.stringify(stats.error))
  assert.equal(stats.value.pendingCandidates, 1)
  // The rendered line points at the tools that decide, not just at the count.
  const text = stats.content.map((block) => block.text ?? '').join('\n')
  assert.match(text, /memory_accept/)
})

test('tools: memory_accept turns a pending candidate into a recallable memory', async () => {
  const memory = newMemory()
  const ctx = await hostWithTools(memory)
  const id = proposeOne(memory, 'the build uses pnpm instead of npm')
  const accepted = await call(ctx, 'memory_accept', { id })
  assert.equal(accepted.isError, false, JSON.stringify(accepted.error))
  assert.equal(accepted.value.ok, true)
  assert.equal(accepted.value.text, 'the build uses pnpm instead of npm')
  // The queue is empty and the statement is now guidance: the same call path the model
  // uses for recall must find it.
  assert.equal(memory.candidates().filter((entry) => entry.status === 'pending').length, 0)
  const recall = await call(ctx, 'memory_recall', { query: 'build pnpm' })
  assert.ok(recall.value.hits.some((hit) => hit.id === accepted.value.memoryId))
})

test('tools: memory_accept honours a kind and scope override', async () => {
  const memory = newMemory()
  const ctx = await hostWithTools(memory)
  const id = proposeOne(memory, 'the build uses pnpm instead of npm')
  const accepted = await call(ctx, 'memory_accept', { id, kind: 'pitfall', scope: 'user' })
  assert.equal(accepted.value.ok, true)
  const stored = memory.all().find((entry) => entry.id === accepted.value.memoryId)
  assert.equal(stored.kind, 'pitfall')
  assert.equal(stored.scope, 'user')
})

test('tools: memory_accept on an unknown id reports a miss instead of throwing', async () => {
  const memory = newMemory()
  const ctx = await hostWithTools(memory)
  const accepted = await call(ctx, 'memory_accept', { id: 'no-such-candidate' })
  assert.equal(accepted.isError, false, JSON.stringify(accepted.error))
  assert.equal(accepted.value.ok, false)
  assert.match(accepted.value.reason, /no pending candidate/)
})

test('tools: memory_accept is not a second writer for a decided candidate', async () => {
  const memory = newMemory()
  const ctx = await hostWithTools(memory)
  const id = proposeOne(memory, 'the build uses pnpm instead of npm')
  await call(ctx, 'memory_dismiss', { id })
  const second = await call(ctx, 'memory_accept', { id })
  assert.equal(second.value.ok, false)
  assert.equal(memory.active().length, 0)
})

test('tools: memory_dismiss retires the proposal and empties the queue', async () => {
  const memory = newMemory()
  const ctx = await hostWithTools(memory)
  const id = proposeOne(memory, 'the build uses pnpm instead of npm')
  const dismissed = await call(ctx, 'memory_dismiss', { id })
  assert.equal(dismissed.isError, false, JSON.stringify(dismissed.error))
  assert.equal(dismissed.value.ok, true)
  assert.equal(memory.candidates().filter((entry) => entry.status === 'pending').length, 0)
  assert.equal(memory.active().length, 0, 'dismissing must never write a memory')
})

test('tools: memory_dismiss on an unknown id reports a miss instead of throwing', async () => {
  const memory = newMemory()
  const ctx = await hostWithTools(memory)
  const dismissed = await call(ctx, 'memory_dismiss', { id: 'no-such-candidate' })
  assert.equal(dismissed.isError, false, JSON.stringify(dismissed.error))
  assert.equal(dismissed.value.ok, false)
  assert.match(dismissed.value.reason, /no pending candidate/)
})

test('tools: the accepted memory carries agent provenance', async () => {
  const memory = newMemory()
  const ctx = await hostWithTools(memory)
  const id = proposeOne(memory, 'the build uses pnpm instead of npm')
  const accepted = await call(ctx, 'memory_accept', { id })
  const stored = memory.all().find((entry) => entry.id === accepted.value.memoryId)
  // A model accepting its own proposal is still recorded as the agent, not as the user.
  assert.equal(stored.source, 'agent')
  rmSync(join(memory.locations.project, '..', '..'), { recursive: true, force: true })
})
