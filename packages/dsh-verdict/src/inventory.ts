/**
 * Plugin inventory and audit.
 *
 * Covers the capability neighbours already ship (a catalogue of what is installed), but
 * pointed at the question this plugin cares about: **which installed plugins claim
 * something and which of those claims are checked.** A plugin that writes rules, skills
 * or configuration into the project is making claims; whether anyone verifies them is
 * the gap the rest of this package exists to close.
 *
 * Read-only. Auditing must never modify what it inspects, or the audit becomes part of
 * the system it is reporting on.
 *
 * @module verdict/inventory
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** One entry in the plugin inventory. */
export interface PluginEntry {
  /** Package name, or directory name when the manifest is unreadable. */
  name: string
  /** Declared version when available. */
  version?: string
  /** Whether the plugin ships a bundle patch that registers it. */
  registered: boolean
  /** Whether the plugin declares a build output that exists. */
  built: boolean
  /** Host-reserved packages wrongly pinned in `dependencies`. */
  misplacedPeers: string[]
  /** Install-time lifecycle scripts, which dsh Desktop rejects unless allow-listed. */
  lifecycleScripts: string[]
}

/** Where installed plugins are looked for, relative to a root. */
export const PLUGIN_DIRS = ['plugins', '.dsh/plugins', 'node_modules/@deepseek-ai'] as const

/** Lifecycle scripts that break install when present. */
const LIFECYCLE = ['preinstall', 'install', 'postinstall', 'prepare'] as const

/** Packages reserved for the host. */
const HOST_PACKAGES = /^(@deepseek-ai\/(cordis|dsh-.*)|cordis)$/

interface Manifest {
  name?: string
  version?: string
  main?: string
  dependencies?: Record<string, string>
  scripts?: Record<string, string>
}

function readManifest(dir: string): Manifest | null {
  const path = join(dir, 'package.json')
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Manifest
  } catch {
    return null
  }
}

/**
 * Inventory the plugins found under a root.
 *
 * Directories without a readable manifest are skipped rather than reported as failures:
 * a scratch folder next to the plugins is not a plugin that failed an audit.
 */
export function inventory(root: string): PluginEntry[] {
  const entries: PluginEntry[] = []

  for (const relative of PLUGIN_DIRS) {
    const dir = join(root, relative)
    if (!existsSync(dir)) continue

    for (const child of readdirSync(dir, { withFileTypes: true })) {
      if (!child.isDirectory()) continue
      const pluginDir = join(dir, child.name)
      const manifest = readManifest(pluginDir)
      if (!manifest) continue

      const main = manifest.main ?? 'lib/index.js'
      entries.push({
        name: manifest.name ?? child.name,
        ...(manifest.version ? { version: manifest.version } : {}),
        registered: existsSync(join(pluginDir, 'cordis.patch.yml')),
        built: existsSync(join(pluginDir, main)),
        misplacedPeers: Object.keys(manifest.dependencies ?? {}).filter((dep) => HOST_PACKAGES.test(dep)),
        lifecycleScripts: LIFECYCLE.filter((script) => Boolean(manifest.scripts?.[script])),
      })
    }
  }

  return entries
}

/**
 * Findings worth acting on.
 *
 * Plugins are only flagged for what would actually stop them loading — an unregistered
 * plugin with no patch, a plugin whose build output is missing, a misplaced peer, or an
 * install-time script. Everything else is left alone: an audit that complains about
 * style trains its readers to ignore it.
 */
export interface AuditFinding {
  plugin: string
  problem: string
}

export function audit(root: string): AuditFinding[] {
  const findings: AuditFinding[] = []
  for (const entry of inventory(root)) {
    if (!entry.registered) findings.push({ plugin: entry.name, problem: 'no cordis.patch.yml — will not be registered' })
    if (!entry.built) findings.push({ plugin: entry.name, problem: 'build output missing — install will not load it' })
    for (const dep of entry.misplacedPeers) {
      findings.push({ plugin: entry.name, problem: `${dep} must be a peerDependency` })
    }
    for (const script of entry.lifecycleScripts) {
      findings.push({ plugin: entry.name, problem: `lifecycle script "${script}" is rejected unless allow-listed` })
    }
  }
  return findings
}
