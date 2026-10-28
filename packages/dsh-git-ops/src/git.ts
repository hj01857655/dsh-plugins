/**
 * The git runner: one place that knows how to talk to the git binary.
 *
 * Everything that makes this plugin worth having over plain `bash` git calls lives here:
 * the work happens in the host process (not inside a run_code sandbox whose environment
 * strips HOME and breaks `git commit`), arguments are passed as an argv array (no shell
 * interpolation, so repo paths with spaces and message content arrive intact), and both
 * output streams are capped so a pathological `git log` cannot flood the model's context.
 *
 * @module git/runner
 */

import { spawn } from 'node:child_process'
import { access, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/** Per-stream output cap. 512 KiB is far past what a model can use in one call. */
const MAX_STREAM = 512 * 1024

export const DEFAULT_TIMEOUT_MS = 15_000

export interface GitResult {
  ok: boolean
  code: number
  stdout: string
  stderr: string
  /** True when a stream hit the cap and tail bytes were dropped. */
  truncated: boolean
}

export interface RunOptions {
  timeoutMs?: number
  env?: Record<string, string>
}

function collect(stream: NodeJS.ReadableStream | null, sink: { text: string; truncated: boolean }): void {
  if (stream === null) return
  stream.on('data', (chunk: Buffer) => {
    const remaining = MAX_STREAM - Buffer.byteLength(sink.text)
    if (remaining <= 0) {
      sink.truncated = true
      return
    }
    if (chunk.length > remaining) {
      sink.text += chunk.subarray(0, remaining).toString('utf-8')
      sink.truncated = true
      return
    }
    sink.text += chunk.toString('utf-8')
  })
}

/**
 * Run one git invocation. Never throws for a non-zero exit — the caller decides what a
 * failure means. Throws only when the binary cannot start at all.
 */
export function runGit(args: readonly string[], cwd: string, options?: RunOptions): Promise<GitResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      windowsHide: true,
      ...(options?.env === undefined ? {} : { env: { ...process.env, ...options.env } }),
    })
    const out = { text: '', truncated: false }
    const err = { text: '', truncated: false }
    collect(child.stdout, out)
    collect(child.stderr, err)

    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`git ${args[0]} timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        ok: code === 0,
        code: code ?? -1,
        stdout: out.text,
        stderr: err.text,
        truncated: out.truncated || err.truncated,
      })
    })
  })
}

/** True when `cwd` is inside a git work tree. */
export async function isGitRepo(cwd: string): Promise<boolean> {
  const result = await runGit(['rev-parse', '--is-inside-work-tree'], cwd, { timeoutMs: 5000 })
  return result.ok && result.stdout.trim() === 'true'
}

/**
 * Git repositories directly under `cwd`, one level deep, sorted.
 *
 * Session working directories are often workspace roots that hold many sibling
 * checkouts (the repo itself is not a repository, so every tool would refuse
 * there). `.git` is a directory for a normal clone and a file for a worktree or
 * submodule, so existence is checked, not `isDirectory`.
 */
export async function findNestedRepos(cwd: string): Promise<string[]> {
  let entries: Array<{ isDirectory(): boolean; name: string }>
  try {
    entries = await readdir(cwd, { withFileTypes: true })
  } catch {
    return []
  }
  const found: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const candidate = join(cwd, entry.name)
    try {
      await access(join(candidate, '.git'))
    } catch {
      continue
    }
    found.push(candidate)
  }
  return found.sort()
}
