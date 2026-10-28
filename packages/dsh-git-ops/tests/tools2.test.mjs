/**
 * 2.0 tools: git_branch / git_stash / git_show as real registered tools, and the
 * git_push config gate.
 *
 * What is checked:
 *   1. git_branch lists branches with the current marker; create/switch work; safe
 *      delete (-d) refuses an unmerged branch instead of destroying work
 *   2. git_stash push/list/pop round-trips uncommitted work
 *   3. git_show returns a commit's patch by abbreviated hash
 *   4. git_push is NOT registered by default (config gate), and the tools that do
 *      register cover the not-a-repository case with an error row
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
  const dir = mkdtempSync(join(tmpdir(), 'dsh-git-ops2-'))
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf-8' })
  git(['init', '-q'])
  git(['config', 'user.name', 'Test User'])
  git(['config', 'user.email', 'test@example.com'])
  writeFileSync(join(dir, 'hello.txt'), 'hello world\n')
  git(['add', 'hello.txt'])
  git(['commit', '-q', '-m', 'init: hello'])
  return { dir, git }
}

class FakeSystemPrompt extends Service {
  constructor(ctx) { super(ctx, 'systemPrompt') }
  tools() {}
  section() { return () => {} }
  getSectionOrder() { return 0 }
}

/** A host whose tool registry has this plugin's tools, with the given options. */
async function hostWithTools(cwd, options = {}) {
  const ctx = new Context()
  await ctx.plugin(FakeSystemPrompt)
  await ctx.plugin(ToolRuntime)
  registerGitTools(ctx, { resolveCwd: () => Promise.resolve(cwd), ...options })
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

test('git_branch: list marks current, create+switch move HEAD', async () => {
  const { dir } = tempRepo()
  const ctx = await hostWithTools(dir)

  const list = await call(ctx, 'git_branch', { action: 'list' })
  assert.equal(list.isError, false, JSON.stringify(list.error))
  assert.equal(list.value.branches.length, 1)
  assert.equal(list.value.branches[0].current, true)

  const create = await call(ctx, 'git_branch', { action: 'create', name: 'feature/x' })
  assert.equal(create.isError, false, JSON.stringify(create.error))
  const switched = await call(ctx, 'git_branch', { action: 'switch', name: 'feature/x' })
  assert.equal(switched.isError, false, JSON.stringify(switched.error))
  const after = await call(ctx, 'git_branch', { action: 'list' })
  const current = after.value.branches.find((b) => b.current)
  assert.equal(current.name, 'feature/x')
})

test('git_branch: safe delete refuses an unmerged branch', async () => {
  const { dir, git } = tempRepo()
  const ctx = await hostWithTools(dir)
  git(['branch', 'precious'])

  const result = await call(ctx, 'git_branch', { action: 'delete', name: 'precious' })
  assert.equal(result.isError, false)
  assert.equal(result.value.done, true, 'precious is fully merged into the fresh repo, delete succeeds')

  writeFileSync(join(dir, 'unmerged.txt'), 'work\n')
  git(['add', 'unmerged.txt'])
  git(['commit', '-q', '-m', 'unmerged work'])
  const blocked = await call(ctx, 'git_branch', { action: 'delete', name: 'master' })
  assert.equal(blocked.value.done, false, 'deleting the branch with the unmerged commit is refused')
  assert.ok(blocked.value.error.length > 0)
})

test('git_stash: push hides changes, pop brings them back', async () => {
  const { dir } = tempRepo()
  const ctx = await hostWithTools(dir)

  writeFileSync(join(dir, 'hello.txt'), 'work in progress\n')   // 已跟踪文件的改动才会被无 -u 的 stash 收走
  const pushed = await call(ctx, 'git_stash', { action: 'push', message: 'wip before rebase' })
  assert.equal(pushed.isError, false, JSON.stringify(pushed.error))

  const listed = await call(ctx, 'git_stash', { action: 'list' })
  assert.equal(listed.value.stashes.length, 1)
  assert.ok(listed.value.stashes[0].subject.includes('wip before rebase'))

  const popped = await call(ctx, 'git_stash', { action: 'pop' })
  assert.equal(popped.isError, false, JSON.stringify(popped.error))
  const after = await call(ctx, 'git_stash', { action: 'list' })
  assert.equal(after.value.stashes.length, 0, 'pop consumes the stash')
})

test('git_show: abbreviated hash returns the commit patch', async () => {
  const { dir } = tempRepo()
  const ctx = await hostWithTools(dir)

  const log = await call(ctx, 'git_log', { limit: 1 })
  const hash = log.value.commits[0].hash
  const result = await call(ctx, 'git_show', { hash: hash.slice(0, 7) })
  assert.equal(result.isError, false, JSON.stringify(result.error))
  assert.ok(result.value.patch.includes('hello world'), 'patch shows the committed line')
  assert.ok(result.value.stat.includes('hello.txt'), 'stat names the file')
})

test('git_push: not registered unless the config gate is on', async () => {
  const { dir } = tempRepo()
  const closed = await hostWithTools(dir, {})
  assert.equal(closed.tools.get('git_push'), undefined, 'gate closed by default')

  const open = await hostWithTools(dir, { allowPush: true })
  assert.ok(open.tools.get('git_push'), 'gate open registers the tool')
})

test('2.0 tools: not-a-repository answers with an error row', async () => {
  const nowhere = mkdtempSync(join(tmpdir(), 'dsh-git-ops2-norepo-'))
  const ctx = await hostWithTools(nowhere, { allowPush: true })

  for (const [name, args] of [
    ['git_branch', { action: 'list' }],
    ['git_stash', { action: 'list' }],
    ['git_show', { hash: 'HEAD' }],
    ['git_push', {}],
  ]) {
    const result = await call(ctx, name, args)
    assert.equal(result.value.error ?? '', 'not a git repository (or any of the parent directories): run inside a repository or pass a path that is one.',
      `${name} explains itself`)
  }
  rmSync(nowhere, { recursive: true, force: true })
})
