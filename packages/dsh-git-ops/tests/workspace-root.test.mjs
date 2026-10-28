/**
 * Workspace-root degrade: a session cwd that is itself not a repository must not be
 * a dead end.
 *
 * What is checked:
 *   1. the root's only nested repository is adopted outright — git_status reports
 *      that repository's branch
 *   2. several candidates come back as an error listing them, pointing the model at
 *      the `path` parameter; node_modules and dot-directories are not candidates
 *   3. zero candidates keeps the plain not-a-repository refusal
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

import { Context, Service } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'

import { registerGitTools } from '../lib/tools.js'

class FakeSystemPrompt extends Service {
  constructor(ctx) { super(ctx, 'systemPrompt') }
  tools() {}
  section() { return () => {} }
  getSectionOrder() { return 0 }
}

async function hostWithTools(cwd) {
  const ctx = new Context()
  await ctx.plugin(FakeSystemPrompt)
  await ctx.plugin(ToolRuntime)
  registerGitTools(ctx, { resolveCwd: () => Promise.resolve(cwd) })
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

/** A minimal repo, no commits needed for branch naming. */
function tempRepo(name) {
  const dir = join(mkdtempSync(join(tmpdir(), 'dsh-git-ops-ws-')), name)
  mkdirSync(dir, { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: dir })
  return dir
}

test('workspace root: sole nested repository is adopted', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-git-ops-ws-'))
  const repo = join(root, 'alpha')
  mkdirSync(repo)
  execFileSync('git', ['init', '-q'], { cwd: repo })
  try {
    const ctx = await hostWithTools(root)
    const result = await call(ctx, 'git_status', {})
    assert.equal(result.value.error, undefined, JSON.stringify(result.value))
    // The adopted repository's branch, not a refusal.
    assert.ok(typeof result.value.branch === 'string')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('workspace root: several candidates are listed, dependencies skipped', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-git-ops-ws-'))
  const alpha = join(root, 'alpha')
  const beta = join(root, 'beta')
  for (const dir of [alpha, beta, join(root, 'node_modules', 'pkg'), join(root, '.hidden')]) {
    mkdirSync(dir, { recursive: true })
    execFileSync('git', ['init', '-q'], { cwd: dir })
  }
  try {
    const ctx = await hostWithTools(root)
    const result = await call(ctx, 'git_status', {})
    const message = result.value.error ?? ''
    assert.ok(message.includes('alpha'), `alpha missing: ${message}`)
    assert.ok(message.includes('beta'), `beta missing: ${message}`)
    assert.ok(!message.includes('node_modules'), 'node_modules leaked into candidates')
    assert.ok(!message.includes('.hidden'), 'dot-directory leaked into candidates')
    assert.ok(message.toLowerCase().includes('path'), 'no hint at the path parameter')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('workspace root: no nested repository keeps the plain refusal', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-git-ops-ws-'))
  try {
    const ctx = await hostWithTools(root)
    const result = await call(ctx, 'git_status', {})
    assert.match(result.value.error, /not a git repository/)
    assert.equal(result.value.entries.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
