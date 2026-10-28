/**
 * The four git tools as real registered tools.
 *
 * Same discipline as the memory suite: everything runs against the host's actual
 * `ToolRuntime`, so a schema the registry would reject cannot pass here, and every call
 * goes through `ctx.tools.execute` — the model's path. The git operations run against a
 * real temporary repository with real commits, because mocking the runner would only
 * prove the mocks work.
 *
 * What is checked here, in the order the registry applies it:
 *   1. registration succeeds on a real runtime (schema compiles)
 *   2. git_status reports a fresh repo clean, and reports a modification after one
 *   3. git_diff returns the actual patch text and flags staging
 *   4. git_log lists commits newest first with subject intact
 *   5. git_commit stages, commits, and reports the hash; refuses when nothing is staged
 *   6. every tool answers the not-a-repository case with an error row, not a throw
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

import { Context, Service } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'

import { registerGitTools } from '../lib/tools.js'

/** A temp repo with one committed file, cleaned up by the caller. */
function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-git-'))
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf-8' })
  git(['init', '-q'])
  git(['config', 'user.name', 'Test User'])
  git(['config', 'user.email', 'test@example.com'])
  writeFileSync(join(dir, 'hello.txt'), 'hello world\n')
  git(['add', 'hello.txt'])
  git(['commit', '-q', '-m', 'init: hello'])
  return { dir, git }
}

/**
 * The one service `ToolRuntime` declares, faked down to what registration touches.
 * See the memory suite: without a systemPrompt provider the registry never loads and
 * every registration in this file silently vanishes.
 */
class FakeSystemPrompt extends Service {
  constructor(ctx) { super(ctx, 'systemPrompt') }
  tools() {}
  section() { return () => {} }
  getSectionOrder() { return 0 }
}

/** A host with a real tool registry and this plugin's four tools registered. */
async function hostWithTools(cwd) {
  const ctx = new Context()
  await ctx.plugin(FakeSystemPrompt)
  await ctx.plugin(ToolRuntime)
  registerGitTools(ctx, { resolveCwd: () => Promise.resolve(cwd) })
  // `ctx.inject` defers until `tools` exists; give the microtask queue its turn.
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

test('tools: all four register on a real tool runtime', async () => {
  const { dir } = tempRepo()
  const ctx = await hostWithTools(dir)
  for (const name of ['git_status', 'git_diff', 'git_log', 'git_commit']) {
    assert.ok(ctx.tools.get(name), `${name} should be registered`)
  }
})

test('git_status: fresh repo is clean, then reports the modification', async () => {
  const { dir, git } = tempRepo()
  const ctx = await hostWithTools(dir)

  const clean = await call(ctx, 'git_status', {})
  assert.equal(clean.isError, false, JSON.stringify(clean.error))
  assert.equal(clean.value.clean, true)
  assert.equal(clean.value.entries.length, 0)
  assert.ok(clean.value.branch.length > 0, 'a fresh repo still has a branch name')

  writeFileSync(join(dir, 'hello.txt'), 'hello changed\n')
  writeFileSync(join(dir, 'new.txt'), 'new file\n')
  const dirty = await call(ctx, 'git_status', {})
  assert.equal(dirty.value.clean, false)
  const paths = dirty.value.entries.map((e) => e.path)
  assert.ok(paths.includes('hello.txt'), 'modification listed')
  assert.ok(paths.includes('new.txt'), 'untracked file listed')
})

test('git_diff: patch text reflects the edit, staged flag switches the base', async () => {
  const { dir, git } = tempRepo()
  const ctx = await hostWithTools(dir)

  writeFileSync(join(dir, 'hello.txt'), 'hello changed\n')
  const worktree = await call(ctx, 'git_diff', {})
  assert.equal(worktree.isError, false, JSON.stringify(worktree.error))
  assert.ok(worktree.value.patch.includes('hello changed'), 'working-tree diff shows the new line')
  assert.equal(worktree.value.truncated, false)

  git(['add', 'hello.txt'])
  const staged = await call(ctx, 'git_diff', { staged: true })
  assert.ok(staged.value.patch.includes('hello changed'), 'staged diff shows the edit')
  const unstaged = await call(ctx, 'git_diff', {})
  assert.equal(unstaged.value.patch, '', 'after staging, the worktree diff is empty')
})

test('git_log: newest first, subject intact, limit respected', async () => {
  const { dir, git } = tempRepo()
  const ctx = await hostWithTools(dir)
  writeFileSync(join(dir, 'second.txt'), 'second\n')
  git(['add', 'second.txt'])
  git(['commit', '-q', '-m', 'feat: second commit'])

  const result = await call(ctx, 'git_log', { limit: 1 })
  assert.equal(result.isError, false, JSON.stringify(result.error))
  assert.equal(result.value.commits.length, 1)
  assert.equal(result.value.commits[0].subject, 'feat: second commit', 'newest commit first')
  assert.equal(result.value.commits[0].author, 'Test User')

  const two = await call(ctx, 'git_log', {})
  assert.equal(two.value.commits.length, 2, 'default limit keeps both commits')
})

test('git_commit: stages, commits, and reports the hash', async () => {
  const { dir } = tempRepo()
  const ctx = await hostWithTools(dir)

  writeFileSync(join(dir, 'feature.txt'), 'feature work\n')
  const result = await call(ctx, 'git_commit', { message: 'feat: add feature', add: ['feature.txt'] })
  assert.equal(result.isError, false, JSON.stringify(result.error))
  assert.equal(result.value.committed, true)
  assert.ok(result.value.hash, 'commit hash reported')
  assert.ok(result.value.files.includes('feature.txt'), 'staged files reported')

  const log = await call(ctx, 'git_log', { limit: 1 })
  assert.equal(log.value.commits[0].subject, 'feat: add feature')
  assert.equal(log.value.commits[0].hash, result.value.hash, 'reported hash is the new HEAD')
})

test('git_commit: refuses when nothing is staged', async () => {
  const { dir } = tempRepo()
  const ctx = await hostWithTools(dir)

  const result = await call(ctx, 'git_commit', { message: 'empty' })
  assert.equal(result.isError, false, JSON.stringify(result.error))
  assert.equal(result.value.committed, false)
  assert.ok(result.value.error.includes('nothing staged'), 'the refusal says why')
})

test('every tool: not-a-repository answers with an error row, not a throw', async () => {
  const nowhere = mkdtempSync(join(tmpdir(), 'dsh-git-norepo-'))
  const ctx = await hostWithTools(nowhere)

  const status = await call(ctx, 'git_status', {})
  assert.equal(status.value.committed === undefined, true)
  assert.ok(status.value.error.includes('not a git repository'), 'status explains itself')

  const diff = await call(ctx, 'git_diff', {})
  assert.ok(diff.value.error.includes('not a git repository'))

  const log = await call(ctx, 'git_log', {})
  assert.ok(log.value.error.includes('not a git repository'))

  const commit = await call(ctx, 'git_commit', { message: 'x', add: ['.'] })
  assert.equal(commit.value.committed, false)
  assert.ok(commit.value.error.includes('not a git repository'))

  rmSync(nowhere, { recursive: true, force: true })
})
