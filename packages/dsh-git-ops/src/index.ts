/**
 * Host half of dsh-git.
 *
 * @module git/index
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'

import { loadConfig } from './config.js'
import { registerGitRoutes } from './routes.js'
import { registerGitTools } from './tools.js'
// Type-only import: the host package declares `ctx.workingDirectory` on cordis's Context,
// so this types the optional `ctx.get('workingDirectory')` used in tools.ts.
import type {} from '@deepseek-ai/dsh-working-directory'

export const name = 'dsh-git-ops'

/**
 * No required host services. The tools attach through `ctx.inject(['tools'])`, and the
 * working directory is read opportunistically — a host without either keeps this plugin
 * alive, it just has no git tools. Same reasoning as dsh-context-memory, whose contract
 * documents why a declared dependency would leave the whole plugin pending on hosts
 * that do not mount a service.
 */
export const inject: string[] = []

/** Warn once per process, not once per call. */
let warnedNoService = false

export function apply(ctx: Context): void {
  /** The directory the calling agent works in. Mirrors dsh-context-memory's resolver. */
  let lastCwd: string | undefined
  const cwdFor = async (agent: Agent | undefined, signal: AbortSignal): Promise<string | undefined> => {
    if (agent === undefined) return undefined
    try {
      const service = ctx.get('workingDirectory')
      let resolved: string | undefined
      if (service === undefined) {
        if (!warnedNoService) {
          warnedNoService = true
          console.warn('[dsh-git] no workingDirectory service on this host; '
            + 'falling back to the session header cwd')
        }
        resolved = agent.session.header.cwd
      } else {
        resolved = (await service.ensure(agent, signal)) ?? agent.session.header.cwd
      }
      // The panel has no agent to resolve from; it shows the most recent session's repo.
      lastCwd = resolved
      return resolved
    } catch (error) {
      console.warn(`[dsh-git] workingDirectory.ensure failed; using the session header cwd: ${(error as Error).message}`)
      return agent.session.header.cwd
    }
  }

  registerGitTools(ctx, { resolveCwd: cwdFor, ...loadConfig() })
  // A headless host has no web connection; registration is skipped inside and nothing
  // else is affected.
  registerGitRoutes(ctx, () => lastCwd)
}
