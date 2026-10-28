/**
 * Plugin configuration, read from `<dsh-home>/plugin-data/dsh-git-ops/config.json`.
 *
 * dsh's tool layer has no per-tool approval hook (approvals live in the sandbox policy
 * layer, which host-process git bypasses by design), so the one genuinely dangerous
 * operation — pushing to a remote — is gated behind explicit config instead of being
 * always-on. Config is read once at plugin apply; a restart applies changes.
 *
 * @module git/config
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface GitIdentity {
  name?: string
  email?: string
}

export interface GitOpsConfig {
  /** Passed to git_commit as `-c user.name/-c user.email`; wins over global git config. */
  identity?: GitIdentity
  /** git_push stays unregistered unless this is true. Default false. */
  allowPush?: boolean
}

const DEFAULTS: Required<Pick<GitOpsConfig, 'allowPush'>> = { allowPush: false }

/** The directory this plugin's config and data live in. */
export function pluginDataDir(): string {
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(dshHome, 'plugin-data', 'dsh-git-ops')
}

export function loadConfig(): GitOpsConfig {
  try {
    const raw = readFileSync(join(pluginDataDir(), 'config.json'), 'utf-8')
    const parsed = JSON.parse(raw) as GitOpsConfig
    return {
      ...(parsed.identity !== undefined && parsed.identity !== null ? { identity: parsed.identity } : {}),
      allowPush: parsed.allowPush === true,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

/** git_commit's identity, as `-c` arguments. Empty when nothing is configured. */
export function identityArgs(identity: GitIdentity | undefined): string[] {
  const args: string[] = []
  if (identity?.name !== undefined && identity.name.length > 0) {
    args.push('-c', `user.name=${identity.name}`)
  }
  if (identity?.email !== undefined && identity.email.length > 0) {
    args.push('-c', `user.email=${identity.email}`)
  }
  return args
}
