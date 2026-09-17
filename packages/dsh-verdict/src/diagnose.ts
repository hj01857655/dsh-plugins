/**
 * Load-contract diagnostics.
 *
 * M1 is "verify the plugin loads in a running dsh", which needs a machine with dsh
 * installed. Most ways a plugin fails to load, however, are static: a manifest that
 * violates the host's rules, a patch file naming a package that does not match, a build
 * that was never run. Those can be checked here, so that when M1 is finally run it is
 * debugging dsh's loader rather than this package's metadata.
 *
 * Diagnostics are advisory and never throw: a tool whose job is verification should not
 * be the thing that breaks a build.
 *
 * @module verdict/diagnose
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** One check result. */
export interface Diagnostic {
  /** Whether the check passed. */
  ok: boolean
  /** What was checked. */
  name: string
  /** Detail: why it failed, or what was found. */
  detail: string
}

/** Packages dsh reserves for the host; they must stay peers, never dependencies. */
const HOST_PACKAGES = /^(@deepseek-ai\/(cordis|dsh-.*)|cordis)$/

/** Lifecycle scripts dsh Desktop rejects unless the package is in its allowBuilds policy. */
const LIFECYCLE_SCRIPTS = ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepack']

interface Manifest {
  name?: string
  version?: string
  main?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  scripts?: Record<string, string>
}

/** Read and parse the manifest, tolerating absence. */
function readManifest(pkgDir: string): Manifest | null {
  const path = join(pkgDir, 'package.json')
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Manifest
  } catch {
    return null
  }
}

/**
 * Check the package against the host's stated plugin rules.
 *
 * @param pkgDir - the plugin package root.
 */
export function diagnose(pkgDir: string): Diagnostic[] {
  const out: Diagnostic[] = []
  const manifest = readManifest(pkgDir)

  if (!manifest) {
    return [{ ok: false, name: 'manifest', detail: 'package.json is missing or not valid JSON' }]
  }

  out.push({
    ok: typeof manifest.name === 'string' && manifest.name.length > 0,
    name: 'name',
    detail: `name=${manifest.name ?? '(missing)'}`,
  })

  // The build must exist: `main` points into lib/, and dsh loads the built output, not
  // the TypeScript sources. Shipping without building is the most common way a plugin
  // "installs fine" and then fails to load.
  const main = manifest.main ?? 'lib/index.js'
  const mainPath = join(pkgDir, main)
  out.push({
    ok: existsSync(mainPath),
    name: 'build output',
    detail: existsSync(mainPath) ? `found ${main}` : `${main} is missing — run the build before installing`,
  })

  for (const script of LIFECYCLE_SCRIPTS) {
    if (manifest.scripts?.[script]) {
      out.push({
        ok: false,
        name: 'lifecycle scripts',
        detail: `"${script}" is defined; dsh Desktop rejects install-time scripts unless allow-listed`,
      })
    }
  }

  for (const [dep, range] of Object.entries(manifest.dependencies ?? {})) {
    if (HOST_PACKAGES.test(dep)) {
      out.push({
        ok: false,
        name: 'peer dependencies',
        detail: `${dep}@${range} is in "dependencies"; host-reserved packages must be peerDependencies`,
      })
    }
  }

  // The patch id and the package name must agree: the loader keys the bundle entry by
  // the id in cordis.patch.yml, so a mismatch registers a plugin that cannot be resolved.
  const patchPath = join(pkgDir, 'cordis.patch.yml')
  if (!existsSync(patchPath)) {
    out.push({ ok: false, name: 'cordis.patch.yml', detail: 'missing — the profile will not register the plugin' })
  } else {
    const raw = readFileSync(patchPath, 'utf8')
    const id = /id:\s*([^\s]+)/.exec(raw)?.[1]
    out.push({
      ok: typeof id === 'string' && id === manifest.name,
      name: 'patch id',
      detail: `patch id=${id ?? '(none)'} package name=${manifest.name ?? '(none)'}`,
    })
    if (!/-\s*insert:/.test(raw)) {
      out.push({ ok: false, name: 'patch action', detail: 'no "insert:" action found; the bundle will not be extended' })
    }
  }

  return out
}

/** Render diagnostics as text for the CLI. */
export function renderDiagnostics(results: Diagnostic[]): string {
  return results.map((result) => `${result.ok ? 'ok  ' : 'FAIL'} ${result.name}: ${result.detail}`).join('\n')
}

/** True when every diagnostic passed. */
export function allOk(results: Diagnostic[]): boolean {
  return results.every((result) => result.ok)
}
