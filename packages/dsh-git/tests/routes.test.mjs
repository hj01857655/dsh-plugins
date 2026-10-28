/**
 * The panel route: registered on the web connection, data recomputed per request.
 *
 * The connection is faked with the same shape the host provides — a registrar that
 * captures the route — so the test runs without a web host. What is checked: the route
 * registers under `/api/dsh-git.panel`, returns JSON with the panel fields, and reports
 * a non-repository directory as `error` instead of failing.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

import { Context, Service } from '@deepseek-ai/cordis'

import { GIT_PANEL_PATH, registerGitRoutes } from '../lib/routes.js'

/** Captures the registered route so the test can call its fetch directly. */
async function hostWithRoutes(getLastCwd) {
  // 类定义在函数内：每次调用都是新的服务类，杜绝跨测试的实例/缓存污染。
  let registered = null
  class FakeConnection extends Service {
    constructor(ctx) {
      super(ctx, 'connection')
      this.fetch = {
        register: (route) => { registered = route },
      }
    }
  }
  const ctx = new Context()
  await ctx.plugin(FakeConnection)
  registerGitRoutes(ctx, getLastCwd)
  // `ctx.inject(['connection'])` defers until the service exists; give it a turn.
  await new Promise((resolve) => setImmediate(resolve))
  return registered
}

test('panel route: reports a repository', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-git-panel-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 't@e.x'], { cwd: dir })
  writeFileSync(join(dir, 'a.txt'), 'x\n')
  execFileSync('git', ['add', 'a.txt'], { cwd: dir })
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir })

  const route = await hostWithRoutes(() => dir)
  assert.equal(route.path, GIT_PANEL_PATH)
  const response = await route.fetch(new Request('http://host' + GIT_PANEL_PATH))
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.branch.length > 0, true, 'branch reported')
  assert.equal(payload.clean, true)
  assert.equal(payload.commits.length, 1)
  assert.equal(payload.commits[0].subject, 'init')
})

test('panel route: non-repository answers with an error field', async () => {
  const nowhere = mkdtempSync(join(tmpdir(), 'dsh-git-panel-norepo-'))
  const route = await hostWithRoutes(() => nowhere)
  const response = await route.fetch(new Request('http://host' + GIT_PANEL_PATH))
  const payload = await response.json()
  assert.equal(payload.error, 'not a git repository')
  rmSync(nowhere, { recursive: true, force: true })
})
