/**
 * Host routes for the panel.
 *
 * Registered on the host's web connection when one exists; headless hosts skip this
 * entirely and the tools keep working. The panel shows the repository of the most
 * recent session the plugin resolved — a module-level memory of `cwdFor`, because a
 * settings panel has no agent of its own to resolve a directory from.
 *
 * @module git/routes
 */

import type { Context } from '@deepseek-ai/cordis'

import { isGitRepo, runGit } from './git.js'
import type { GitPanelPayload } from './types.js'

/** The panel path, shared with the browser half so the two cannot drift apart. */
export const GIT_PANEL_PATH = '/api/dsh-git-ops.panel'

interface FetchRegistrar {
  fetch: {
    register(route: {
      path: string
      methods: readonly string[]
      requestBody: string
      fetch: (request: Request) => Promise<Response>
    }): void
  }
}

export function registerGitRoutes(ctx: Context, getLastCwd: () => string | undefined): void {
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = (connectionCtx as unknown as { connection: FetchRegistrar }).connection

    connection.fetch.register({
      path: GIT_PANEL_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      // Recomputed from disk on every request: the panel must show the repository's
      // state now, not the state when the plugin loaded.
      fetch: async () => {
        const cwd = getLastCwd() ?? process.cwd()
        let payload: GitPanelPayload
        if (!(await isGitRepo(cwd))) {
          payload = { cwd, branch: '', clean: true, entries: [], commits: [],
            error: 'not a git repository' }
        } else {
          const status = await runGit(['status', '--porcelain=v1', '-b'], cwd)
          const log = await runGit(
            ['log', '-n5', '--pretty=format:%H%x1f%an%x1f%aI%x1f%s'], cwd)
          const entries = status.ok
            ? status.stdout.split('\n')
              .filter((l) => l.length > 0 && !l.startsWith('## '))
              .map((line) => ({
                index: line.slice(0, 1),
                worktree: line.slice(1, 2),
                path: line.slice(3),
              }))
            : []
          const commits = log.ok
            ? log.stdout.split('\n').filter((l) => l.length > 0).map((line) => {
                const p = line.split('\x1f')
                return { hash: p[0] ?? '', author: p[1] ?? '', date: p[2] ?? '', subject: p[3] ?? '' }
              })
            : []
          const branchResult = await runGit(['branch', '--format=%(refname:short)%00%(HEAD)'], cwd)
          const branches = branchResult.ok
            ? branchResult.stdout.split('\n').filter((l) => l.length > 0).map((line) => {
                const [name, head] = line.split('\x00')
                return { name: name ?? '', current: head === '*' }
              })
            : []
          payload = {
            cwd,
            branch: status.ok ? (status.stdout.split('\n')[0]?.slice(3).split('...')[0]?.replace(/\[.*/, '').trim() ?? '') : '',
            clean: entries.length === 0,
            entries,
            commits,
            branches,
            ...(status.ok ? {} : { error: status.stderr.trim() }),
          }
        }
        return Response.json(payload, { headers: { 'cache-control': 'no-store' } })
      },
    })
  })
}
