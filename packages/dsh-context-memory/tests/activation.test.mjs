/**
 * Activation contract: what the host must (and must not) provide for this plugin to run.
 *
 * These are the checks that the workspace's other tests cannot make. Everything else in
 * `tests/` calls `ContextMemory` directly, so all of it passes on a plugin that would
 * never load in a real dsh profile.
 *
 * Both cases below come from a measured failure on 0.2.1-rc.2: the plugin declared
 * `inject = ['workingDirectory']`, the installed `dsh-base` bundle predated the row that
 * mounts that service, and dsh reported
 *
 *     dsh-context-memory (dsh-context-memory): pending (waiting for service: workingDirectory)
 *
 * Nothing ran. Not the pre-step, not the service, not the CLI. A plugin that is waiting
 * is indistinguishable from one that is absent.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Context } from '@deepseek-ai/cordis'

import * as plugin from '../lib/index.js'

/** A temp project, cleaned up by the caller. */
function tempProject() {
  return mkdtempSync(join(tmpdir(), 'context-memory-activation-'))
}

/** A step request shaped the way the host's pre-step event delivers one. */
function stepRequest(cwd) {
  const message = {
    id: 'm-user-1',
    role: 'user',
    content: [{ type: 'text', text: 'the file package.json exists?' }],
    source: { kind: 'user' },
  }
  return {
    message,
    payload: { agent: { id: 'agent-test', session: { header: { cwd } }, inbox: { remove() {} } }, messages: [message], signal: new AbortController().signal },
  }
}

test('activation: the plugin declares no required service', () => {
  // An empty list is the point, not an oversight. Every name here is a service the
  // plugin cannot run without, and a host that does not mount one leaves the fiber
  // pending forever — silently. `workingDirectory` is read through `ctx.get` instead.
  assert.deepEqual(plugin.inject, [])
})

test('activation: the plugin loads on a host with no workingDirectory service', async () => {
  const project = tempProject()
  try {
    const ctx = new Context()
    const cwd = process.cwd()
    process.chdir(project)
    try {
      await ctx.plugin({ name: 'dsh-context-memory', apply: plugin.apply })
    } finally {
      process.chdir(cwd)
    }
    assert.equal(typeof ctx.get('contextMemory'), 'object')
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})

test('activation: a step without workingDirectory still resolves the project from the header cwd', async () => {
  const project = tempProject()
  try {
    const ctx = new Context()
    const cwd = process.cwd()
    process.chdir(project)
    try {
      await ctx.plugin({ name: 'dsh-context-memory', apply: plugin.apply })
    } finally {
      process.chdir(cwd)
    }

    const memory = ctx.get('contextMemory')
    memory.remember({ text: 'the file package.json exists', kind: 'fact' })

    const { message, payload } = stepRequest(project)
    // The fallback under test: no `ctx.get('workingDirectory')`, so the session header is
    // the only source of the directory — which is exactly the host this machine runs.
    const decision = await ctx.events.waterfall(
      ctx,
      'agent/pre-step',
      payload,
      () => Promise.resolve({ kind: 'enter', messages: [message] }),
    )

    assert.equal(decision.kind, 'enter')
    assert.equal(decision.messages.length, 2)

    const injected = decision.messages.find((entry) => entry.source.kind === 'dsh-context-memory')
    assert.ok(injected, 'the recall block is injected')
    const text = injected.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n')
    assert.match(text, /the file package\.json exists/)

    // The memory went to the header's project, not to the launch directory.
    assert.equal(memory.locations().project, join(project, '.memory', 'events.jsonl'))
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})

test('activation: a declarative statement becomes a candidate, never a memory', async () => {
  // The P5 boundary, checked through the real pre-step rather than by calling the queue:
  // widening capture must not widen what recall can see. Everything the heuristics notice
  // lands in the queue; only an explicit decision moves it into the log.
  const project = tempProject()
  try {
    const ctx = new Context()
    const cwd = process.cwd()
    process.chdir(project)
    try {
      await ctx.plugin({ name: 'dsh-context-memory', apply: plugin.apply })
    } finally {
      process.chdir(cwd)
    }

    const memory = ctx.get('contextMemory')
    const message = {
      id: 'm-user-2',
      role: 'user',
      content: [{ type: 'text', text: '我们用 sqlite 存会话数据' }],
      source: { kind: 'user' },
    }
    const decision = await ctx.events.waterfall(
      ctx,
      'agent/pre-step',
      { agent: { id: 'agent-test', session: { header: { cwd: project } }, inbox: { remove() {} } }, messages: [message], signal: new AbortController().signal },
      () => Promise.resolve({ kind: 'enter', messages: [message] }),
    )
    assert.equal(decision.kind, 'enter')

    const pending = memory.candidates()
    assert.equal(pending.length, 1, 'the statement was noticed')
    assert.equal(memory.active().length, 0, 'and not remembered')
    // No injection either: there is nothing in guidance to offer, and a candidate is not
    // context. A step that only produced a candidate must still carry exactly what it had.
    assert.equal(decision.messages.length, 1)

    const stored = memory.accept(pending[0].id)
    assert.ok(stored)
    assert.equal(memory.active().length, 1);
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})

test('activation: the model tools are absent, not fatal, on a host with no tool registry', async () => {
  const project = tempProject()
  try {
    const ctx = new Context()
    const cwd = process.cwd()
    process.chdir(project)
    try {
      await ctx.plugin({ name: 'dsh-context-memory', apply: plugin.apply })
    } finally {
      process.chdir(cwd)
    }

    // `ctx.inject(['tools'])` fires the callback only once a registry exists. Registering
    // the tools through a static `inject` instead would have left this whole plugin
    // pending on a headless profile that mounts no tools — including the pre-step and the
    // CLI-visible memory, which have nothing to do with tools. The registry is an
    // addition; its absence must cost exactly the two tools.
    assert.equal(ctx.get('tools'), undefined)
    assert.equal(typeof ctx.get('contextMemory'), 'object')
    assert.equal(typeof ctx.get('contextMemory').recall, 'function')
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})

test('activation: the workingDirectory fallback is logged once, not silently taken', async () => {
  // The fallback is what keeps the plugin loading on a host whose `dsh-base` predates the
  // row that mounts `workingDirectory`. That same quietness is the risk: if the service
  // disappears for another reason — a renamed row, a bundle that drops it — every session
  // would resolve to its initial cwd and memories written after a `workingDirectory.set`
  // would be filed in the wrong project, with nothing to show it happened. So the degraded
  // path reports itself through the host's logger, once per process.
  const project = tempProject()
  try {
    const ctx = new Context()
    const seen = []
    // The host's own shape (`app-boot` does exactly this): a plain exporter, `levels`
    // raising the threshold so warn is delivered.
    ctx.logger.exporter({ levels: { default: 2 }, export: (message) => { seen.push(message) } })
    const cwd = process.cwd()
    process.chdir(project)
    try {
      await ctx.plugin({ name: 'dsh-context-memory', apply: plugin.apply })
    } finally {
      process.chdir(cwd)
    }

    const agent = { id: 'agent-test', session: { header: { cwd: project } }, inbox: { remove() {} } }
    const message = {
      id: 'm-user-1',
      role: 'user',
      content: [{ type: 'text', text: 'the file package.json exists?' }],
      source: { kind: 'user' },
    }
    const step = () => ctx.events.waterfall(
      ctx,
      'agent/pre-step',
      { agent, messages: [message], signal: new AbortController().signal },
      () => Promise.resolve({ kind: 'enter', messages: [message] }),
    )

    await step()
    await step()
    await step()

    const warnings = seen.filter((entry) => entry.type === 'warn' && entry.name === 'dsh-context-memory')
    assert.equal(warnings.length, 1, 'reported once, not on every step')
    assert.match(String(warnings[0].args[0]), /workingDirectory/, 'and the warning names the missing service')
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})

test('activation: the recall injection honors the char budget', async () => {
  const project = tempProject()
  try {
    const ctx = new Context()
    const cwd = process.cwd()
    process.chdir(project)
    try {
      await ctx.plugin({ name: 'dsh-context-memory', apply: plugin.apply })
    } finally {
      process.chdir(cwd)
    }

    const memory = ctx.get('contextMemory')
    // Two long memories: either alone would exceed the tiny budget below.
    memory.remember({ text: 'alpha memory '.repeat(60).trim(), kind: 'fact' })
    memory.remember({ text: 'beta memory '.repeat(60).trim(), kind: 'fact' })
    // Set the budget through the same surface the panel uses.
    memory.setPrefs({ recallCharBudget: 200 })

    // A query whose tokens hit both long memories, so the budget is what limits the rows.
    const message = {
      id: 'm-user-budget',
      role: 'user',
      content: [{ type: 'text', text: 'alpha beta' }],
      source: { kind: 'user' },
    }
    const payload = {
      agent: { id: 'agent-budget', session: { header: { cwd: project } }, inbox: { remove() {} } },
      messages: [message],
      turn: 1,
      step: 1,
      signal: new AbortController().signal,
    }
    const decision = await ctx.events.waterfall(
      ctx,
      'agent/pre-step',
      payload,
      () => Promise.resolve({ kind: 'enter', messages: [message] }),
    )

    assert.equal(decision.kind, 'enter')
    const injected = decision.messages.find((entry) => entry.source.kind === 'dsh-context-memory')
    assert.ok(injected, 'the recall block is still injected')
    const text = injected.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n')
    // Exactly one guidance row fits; the other is dropped and the omission is visible.
    const guidanceRows = text.split('\n').filter((l) => l.startsWith('- [fact]'))
    assert.equal(guidanceRows.length, 1, 'only the first row fits a 200-char budget')
    assert.match(text, /more matches omitted/, 'the omission is stated, not silent')
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})

test('activation: contradicted memories ignore the char budget', async () => {
  const project = tempProject()
  try {
    const ctx = new Context()
    const cwd = process.cwd()
    process.chdir(project)
    try {
      await ctx.plugin({ name: 'dsh-context-memory', apply: plugin.apply })
    } finally {
      process.chdir(cwd)
    }

    const memory = ctx.get('contextMemory')
    memory.remember({ text: 'the file package.json contains pnpm', kind: 'fact' })
    // Break the claim: the guard will run and report violated.
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'x' }, null, 2))
    memory.verify()
    memory.setPrefs({ recallCharBudget: 200 })

    const { message, payload } = stepRequest(project)
    const decision = await ctx.events.waterfall(
      ctx,
      'agent/pre-step',
      payload,
      () => Promise.resolve({ kind: 'enter', messages: [message] }),
    )

    const injected = decision.messages.find((entry) => entry.source.kind === 'dsh-context-memory')
    assert.ok(injected, 'injected')
    const text = injected.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n')
    assert.match(text, /contradicted/i, 'a contradicted memory is shown regardless of budget')
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
})
