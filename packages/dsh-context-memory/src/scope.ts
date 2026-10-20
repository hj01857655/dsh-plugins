/**
 * Where a memory lives.
 *
 * Two scopes, because "the build uses pnpm" and "answer me in Chinese" are stored in
 * different places for different reasons. A project convention is only true inside that
 * checkout and should travel with it; a working preference is true everywhere the user
 * works and should not be re-stated in every repository.
 *
 * The scope is a property of the memory, not of the installation: one log holds both,
 * and each entry is routed to the store its scope names. That keeps one fold and one
 * panel while still letting the two populations move independently.
 *
 * @module context-memory/scope
 */

import { statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

/**
 * Directory names that mark the top of a project, in probe order.
 *
 * `package.json` is deliberately absent. It is the marker everyone reaches for and it is
 * the wrong one: a stray `package.json` in a home directory makes every unrelated folder
 * beneath it one project, so a scratch directory on the Desktop would share a memory log
 * with everything else in the profile. `.git` marks a checkout, and a workspace file only
 * appears at the top of a workspace, which is what a project root means here.
 *
 * This matches `dsh-agent-instructions`, whose default `projectRootMarkers` is `['.git']`.
 */
export const PROJECT_ROOT_MARKERS = ['.git', 'pnpm-workspace.yaml'] as const

/** Where the user-global log lives, under the harness home. */
export function userStoreDir(): string {
  return dshHomePath('context-memory')
}

/**
 * Find the top of the project containing `start`.
 *
 * Mirrors `dsh-agent-instructions`'s discovery: climb while the marker is *absent*, and
 * stop at the first directory that carries one. The difference from `process.cwd()` is
 * the whole point — a session started three levels down inside a monorepo is still the
 * same project, and two directories that are not the same project must not share a log.
 *
 * When no marker is found anywhere on the way up, `start` is its own project — which is
 * honest: there is no evidence that anything above it belongs to the same work.
 *
 * @param start - absolute directory to begin from.
 * @returns the discovered project root, or `start` when nothing marks one.
 */
export function findProjectRoot(start: string): string {
  const origin = resolve(start)
  let current = origin
  for (;;) {
    for (const marker of PROJECT_ROOT_MARKERS) {
      if (exists(join(current, marker))) return current
    }
    const parent = dirname(current)
    if (parent === current) return origin
    current = parent
  }
}

/** `statSync` that answers a yes/no question without throwing on absence. */
function exists(path: string): boolean {
  try {
    statSync(path)
    return true
  } catch {
    return false
  }
}

/** Resolve the directory a project memory is stored under. */
export function resolveProjectStore(cwd?: string): string {
  return findProjectRoot(cwd !== undefined && isAbsolute(cwd) ? cwd : resolve('.'))
}
