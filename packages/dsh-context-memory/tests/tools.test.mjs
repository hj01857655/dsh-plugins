/**
 * The pull half: `memory_recall` and `memory_remember` as real registered tools.
 *
 * These run against the host's actual `ToolRuntime`, not a stub. That matters more here
 * than elsewhere in the suite: a tool is a schema plus an execution, and `defineTool`
 * compiles the schema at registration time and validates both arguments and output at
 * call time. A test that called the executor directly would pass on a definition the
 * registry rejects — the same class of mistake as testing `ContextMemory` on a plugin the
 * loader refuses to boot.
 *
 * What is checked here, in the order the registry applies it:
 *
 *   1. registration succeeds on a real runtime (schema compiles)
 *   2. the tool is reachable by name through `tools.execute` (the model's path)
 *   3. arguments are validated and the output validates against its declared schema
 *   4. the two populations behave differently: `guidance` never returns a contradicted
 *      memory, `contradicted` returns only those
 *   5. a written memory carries `source: 'agent'`, and a repeated statement reports
 *      `updated: true` instead of claiming a new record
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Context, Service } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'

import { ContextMemory } from '../lib/memory.js'
import { registerMemoryTools } from '../lib/tools.js'

/** A temp project, cleaned up by the caller. */
function tempProject() {
  return mkdtempSync(join(tmpdir(), 'context-memory-tools-'))
}

/**
 * The one service `ToolRuntime` declares, faked down to what registration touches.
 *
 * `ToolRuntime` has `static inject = ['systemPrompt']`, so with no system prompt the
 * registry never loads and every tool registration in this file would silently vanish.
 * Only `tools` registration is under test here; the prompt sections a real host gets are
 * built by the registry itself, not by this plugin.
 */
class FakeSystemPrompt extends Service {
  constructor(ctx) { super(ctx, 'systemPrompt') }
  tools() {}
  section() { return () => {} }
  getSectionOrder() { return 0 }
}

/** A host with a real tool registry and this plugin's two tools registered. */
async function hostWithTools(memory) {
  const ctx = new Context()
  await ctx.plugin(FakeSystemPrompt)
  await ctx.plugin(ToolRuntime)
  registerMemoryTools(ctx, {
    resolve: () => Promise.resolve(memory),
  })
  // `ctx.inject` defers the callback until `tools` exists; awaiting the fiber above is not
  // enough to guarantee the injected child ran, so give the microtask queue its turn and
  // then assert the registration happened rather than assuming it.
  await new Promise((resolve) => setImmediate(resolve))
  return ctx
}

/** Call one registered tool the way the agent loop does. */
function call(ctx, name, args) {
  return ctx.tools.execute({
    callId: `call-${name}-${Math.random().toString(16).slice(2)}`,
    name,
    arguments: args,
    signal: new AbortController().signal,
  })
}

test('tools: both tools register on a real tool runtime', async () => {
  const dir = tempProject()
  try {
    const memory = new ContextMemory(dir)
    const ctx = await hostWithTools(memory)
    // Registration is verified by using the tools: a name that was not registered produces
    // an UNKNOWN_TOOL failure from the same call path the model uses, so this checks the
    // registration, the compiled schema, and the execution together.
    const recall = await call(ctx, 'memory_recall', {})
    const remember = await call(ctx, 'memory_remember', { text: 'the build uses pnpm' })
    assert.equal(recall.isError, false, JSON.stringify(recall.error))
    assert.equal(remember.isError, false, JSON.stringify(remember.error))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('tools: memory_recall returns guidance and never a contradicted memory by default', async () => {
  const dir = tempProject()
  try {
    writeFileSync(join(dir, 'package.json'), '{"name":"x"}')
    const memory = new ContextMemory(dir)
    memory.remember({ text: 'the file present.txt exists' })
    memory.remember({ text: 'the file missing.txt exists' })
    writeFileSync(join(dir, 'present.txt'), '')
    // Records a `violated` verification for the second memory.
    const summary = memory.verify()
    assert.equal(summary.violated, 1)

    const ctx = await hostWithTools(memory)
    const result = await call(ctx, 'memory_recall', { query: 'file exists' })
    assert.equal(result.isError, false)
    const texts = result.value.hits.map((hit) => hit.text)
    assert.deepEqual(texts, ['the file present.txt exists'])
    assert.equal(result.value.hits[0].verification, 'passed')
    assert.equal(result.value.include, 'guidance')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('tools: memory_recall reaches contradicted memories only when asked', async () => {
  const dir = tempProject()
  try {
    const memory = new ContextMemory(dir)
    memory.remember({ text: 'the file missing.txt exists' })
    memory.verify()

    const ctx = await hostWithTools(memory)
    const result = await call(ctx, 'memory_recall', { query: 'file exists', include: 'contradicted' })
    assert.equal(result.isError, false)
    assert.equal(result.value.hits.length, 1)
    assert.equal(result.value.hits[0].verification, 'violated')
    // The reason travels with the verdict: "contradicted" with no detail is a claim the
    // reader cannot check, and the whole point of the three-outcome model is that the
    // evidence is available.
    assert.match(result.value.hits[0].detail, /missing\.txt/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('tools: memory_recall with no query lists the newest instead of returning nothing', async () => {
  const dir = tempProject()
  try {
    const memory = new ContextMemory(dir)
    memory.remember({ text: 'the build uses pnpm' }, 1000)
    memory.remember({ text: 'always answer in Chinese' }, 2000)

    const ctx = await hostWithTools(memory)
    const result = await call(ctx, 'memory_recall', {})
    assert.equal(result.isError, false)
    assert.equal(result.value.hits.length, 2)
    assert.equal(result.value.hits[0].text, 'always answer in Chinese')
    assert.match(result.value.note, /newest memories/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('tools: memory_recall rejects arguments the schema forbids', async () => {
  const dir = tempProject()
  try {
    const memory = new ContextMemory(dir)
    const ctx = await hostWithTools(memory)
    const result = await call(ctx, 'memory_recall', { include: 'everything' })
    // A bad enum is the model's mistake, and the registry — not the tool body — is what
    // catches it. If validation happened in the body, the failure would be indistinguishable
    // from a search that legitimately found nothing.
    assert.equal(result.isError, true)
    assert.match(JSON.stringify(result.error), /invalid arguments/i)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('tools: memory_remember records with agent provenance and a compiled check', async () => {
  const dir = tempProject()
  try {
    const memory = new ContextMemory(dir)
    const ctx = await hostWithTools(memory)
    const result = await call(ctx, 'memory_remember', {
      text: 'the file package.json exists',
      kind: 'fact',
      scope: 'project',
    })
    assert.equal(result.isError, false)
    assert.equal(result.value.updated, false)
    assert.match(result.value.check, /path "package\.json" exists/)

    const stored = memory.get(result.value.id)
    assert.equal(stored.source, 'agent', 'a model-written memory is distinguishable from a user statement')
    assert.equal(stored.text, 'the file package.json exists')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('tools: memory_remember reports a repeat as updated rather than as a new record', async () => {
  const dir = tempProject()
  try {
    const memory = new ContextMemory(dir)
    const ctx = await hostWithTools(memory)
    const first = await call(ctx, 'memory_remember', { text: 'the build uses pnpm' })
    const second = await call(ctx, 'memory_remember', { text: 'the build uses pnpm' })
    assert.equal(first.value.updated, false)
    assert.equal(second.value.updated, true)
    // Same id, and the original creation time survived: restating is not the memory being
    // new, and a reply that implied otherwise would claim work it did not do.
    assert.equal(second.value.id, first.value.id)
    assert.equal(memory.all().length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('tools: memory_remember without a compilable check says so instead of implying verification', async () => {
  const dir = tempProject()
  try {
    const memory = new ContextMemory(dir)
    const ctx = await hostWithTools(memory)
    const result = await call(ctx, 'memory_remember', { text: 'we settled on pnpm because hoisting broke' })
    assert.equal(result.isError, false)
    assert.equal(result.value.check, undefined)
    const text = result.content.map((block) => block.text).join('\n')
    assert.match(text, /No check could be compiled/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
