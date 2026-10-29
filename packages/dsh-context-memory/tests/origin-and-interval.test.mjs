/**
 * 1.2 additions: where a proposal came from, and how often checks re-run.
 *
 * Two things a reviewer needs and the plugin could not state: which seam proposed a
 * candidate (`user-text` versus a tool's output), and how stale a checkable memory is
 * allowed to get before the automatic re-check. The first decides how much weight the
 * sentence deserves; the second is a property of the project, not of the plugin, so it is
 * a pref with a floor rather than a constant.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Context } from '@deepseek-ai/cordis'

import * as plugin from '../lib/index.js'
import { ContextMemory } from '../lib/memory.js'
import { harvestTurn, toProposeInput } from '../lib/harvest.js'
import { run as runCli } from '../lib/cli.js'

function tempProject() {
  return mkdtempSync(join(tmpdir(), 'context-memory-origin-'))
}

const DAY = 24 * 60 * 60 * 1000

test('origin: a capture-seam proposal keeps the pre-1.2 shape', () => {
  const memory = new ContextMemory(tempProject())
  const candidate = memory.propose({ text: 'the build uses pnpm for every package here' })
  // Absent rather than `'user-text'`: the record stays the smallest one that reads right,
  // and every reader treats absent as the capture seam.
  assert.equal(candidate.origin, undefined)
  assert.equal(memory.candidates()[0].origin, undefined)
})

test('origin: a harvested proposal records its seam and the reason it was picked', () => {
  const memory = new ContextMemory(tempProject())
  const harvested = harvestTurn(
    [{ turn: 1, step: 0, isError: true, text: 'error: cannot resolve better-sqlite3 from the plugin root' }],
    'session-1',
    1,
  )
  assert.equal(harvested.length, 1)
  const candidate = memory.propose(toProposeInput(harvested[0]))
  assert.ok(candidate !== undefined)
  assert.equal(candidate.origin, 'turn-harvest')
  assert.equal(candidate.reason, 'error')
})

test('origin: the reason travels through the fold, not just the in-memory return', () => {
  const project = tempProject()
  const memory = new ContextMemory(project)
  const harvested = harvestTurn(
    [{ turn: 2, step: 0, isError: false, text: 'the runtime is node v22 and engines requires it' }],
    'session-2',
    2,
  )
  memory.propose(toProposeInput(harvested[0]))
  // A fresh instance re-reads the queue file: the field must be persisted, not carried.
  const reread = new ContextMemory(project)
  const stored = reread.candidates()[0]
  assert.equal(stored.origin, 'turn-harvest')
  assert.equal(stored.reason, 'discovery')
})

test('prefs: the re-check interval defaults to a day and is reported', async () => {
  const project = tempProject()
  const ctx = new Context()
  const cwd = process.cwd()
  process.chdir(project)
  try {
    await ctx.plugin({ name: 'dsh-context-memory', apply: plugin.apply })
  } finally {
    process.chdir(cwd)
  }
  const memory = ctx.get('contextMemory')
  assert.equal(memory.prefs().reverifyIntervalMs, DAY)
})

test('prefs: the interval is clamped to the floor the pre-step can honour', async () => {
  const project = tempProject()
  const ctx = new Context()
  const cwd = process.cwd()
  process.chdir(project)
  try {
    await ctx.plugin({ name: 'dsh-context-memory', apply: plugin.apply })
  } finally {
    process.chdir(cwd)
  }
  const memory = ctx.get('contextMemory')
  // A minute is the floor: below it the pre-step's own throttle is the real answer, and
  // honouring a smaller number would re-run every guard on every step.
  assert.equal(memory.setPrefs({ reverifyIntervalMs: 1000 }).reverifyIntervalMs, 60 * 1000)
  // A value above the floor is kept verbatim, and travels back to the caller.
  assert.equal(memory.setPrefs({ reverifyIntervalMs: 3 * DAY }).reverifyIntervalMs, 3 * DAY)
  // A non-finite value is ignored rather than poisoning the comparison.
  assert.equal(memory.setPrefs({ reverifyIntervalMs: Number.NaN }).reverifyIntervalMs, 3 * DAY)
})

test('cli: export and import round-trip the project log', () => {
  const project = tempProject()
  const backup = join(project, 'backup.jsonl')
  const memory = new ContextMemory(project)
  memory.remember({ text: 'the build uses pnpm instead of npm' })
  assert.equal(memory.active().length, 1)

  const lines = []
  const cwd = process.cwd()
  process.chdir(project)
  try {
    assert.equal(runCli(['export', backup]), 0)
    assert.ok(readFileSync(backup, 'utf8').includes('pnpm'))
    // Importing the same file again must not duplicate: the id is already known.
    const before = readFileSync(memory.locations.project, 'utf8')
    assert.equal(runCli(['import', backup]), 0)
    assert.equal(readFileSync(memory.locations.project, 'utf8'), before)
  } finally {
    process.chdir(cwd)
    rmSync(project, { recursive: true, force: true })
  }
})

test('cli: import merges a foreign log without disturbing the local one', () => {
  const project = tempProject()
  const foreign = join(project, 'foreign.jsonl')
  const other = new ContextMemory(join(project, 'other'))
  other.remember({ text: 'the deploy script lives in scripts/deploy.mjs here' })
  const cwd = process.cwd()
  process.chdir(join(project, 'other'))
  try {
    assert.equal(runCli(['export', foreign]), 0)
  } finally {
    process.chdir(cwd)
  }
  const memory = new ContextMemory(project)
  memory.remember({ text: 'the build uses pnpm instead of npm' })
  process.chdir(project)
  try {
    assert.equal(runCli(['import', foreign]), 0)
  } finally {
    process.chdir(cwd)
  }
  const reread = new ContextMemory(project)
  assert.equal(reread.active().length, 2, 'the imported statement joined the local one')
  rmSync(project, { recursive: true, force: true })
})

test('cli: export refuses a log that does not exist instead of writing an empty file', () => {
  const project = tempProject()
  const empty = new ContextMemory(project)
  const backup = join(project, 'missing.jsonl')
  const lines = []
  const original = console.log
  console.log = (line) => lines.push(String(line))
  const cwd = process.cwd()
  process.chdir(project)
  try {
    assert.equal(runCli(['export', backup]), 1)
    assert.match(lines.join('\n'), /No project log to export/)
    assert.equal(empty.active().length, 0)
  } finally {
    console.log = original
    process.chdir(cwd)
    rmSync(project, { recursive: true, force: true })
  }
})


