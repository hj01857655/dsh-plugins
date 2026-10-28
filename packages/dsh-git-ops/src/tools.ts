/**
 * Model-facing git tools.
 *
 * Four tools, deliberately narrow. The read half (status / diff / log) answers the
 * questions a model asks before acting; the write half is one tool, `git_commit`,
 * because "commit" is the single operation the model most often gets wrong through a
 * shell: interactive editors, missing identity, forgotten staging. Everything here runs
 * in the host process, which is why the identity problem documented in
 * `docs/DSH-SESSION-AUDIT-FINDINGS.md` (D-3: sandboxed subprocesses lose HOME and
 * `git commit` fatals) does not apply.
 *
 * @module git/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'

import { identityArgs } from './config.js'
import type { GitIdentity } from './config.js'
import { isGitRepo, runGit } from './git.js'

const MIN_LIMIT = 1
const MAX_LIMIT = 50
const DEFAULT_LOG_LIMIT = 10
/** Patch byte budget for one git_diff call. Beyond this the model gets a marker. */
const MAX_PATCH_CHARS = 64 * 1024

/** Resolves the directory a tool call belongs to. */
export type CwdResolver = (agent: Agent | undefined, signal: AbortSignal) => Promise<string | undefined>

export interface GitToolOptions {
  resolveCwd: CwdResolver
  /** Wins over global git config for git_commit, via `-c user.name/email`. */
  identity?: GitIdentity
  /** git_push registers only when true; the host process can reach remotes the sandbox cannot. */
  allowPush?: boolean
}

const NOT_A_REPO: string =
  'not a git repository (or any of the parent directories): run inside a repository or pass a path that is one.'

/** Clamp a log count. */
function clampLimit(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_LOG_LIMIT
  return Math.min(Math.max(Math.trunc(requested), MIN_LIMIT), MAX_LIMIT)
}

/** Clamp a diff context line count. */
function clampContext(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return 3
  return Math.min(Math.max(Math.trunc(requested), 0), 20)
}

/** Cap a patch so one call cannot eat the model's whole context. */
function capPatch(patch: string): { patch: string; truncated: boolean } {
  if (patch.length <= MAX_PATCH_CHARS) return { patch, truncated: false }
  return { patch: patch.slice(0, MAX_PATCH_CHARS) + '\n... [truncated]', truncated: true }
}

/** Parse `git status --porcelain=v1 -b` into structured rows. */
function parseStatus(stdout: string): { branch: string; clean: boolean; entries: Array<{ index: string; worktree: string; path: string }> } {
  const lines = stdout.split('\n').filter((l) => l.length > 0)
  let branch = ''
  const entries: Array<{ index: string; worktree: string; path: string }> = []
  for (const line of lines) {
    if (line.startsWith('## ')) {
      branch = line.slice(3).split('...')[0].replace(/\[.*/, '').trim()
      continue
    }
    const index = line.slice(0, 1)
    const worktree = line.slice(1, 2)
    const path = line.slice(3)
    entries.push({ index, worktree, path })
  }
  return { branch, clean: entries.length === 0, entries }
}

/** One commit row out of a `--pretty` log line. */
function parseLogLine(line: string): { hash: string; author: string; email: string; date: string; subject: string } | undefined {
  const parts = line.split('\x1f')
  if (parts.length < 5) return undefined
  return { hash: parts[0], author: parts[1], email: parts[2], date: parts[3], subject: parts[4] }
}

/**
 * Register the four tools once the host's tool registry exists.
 *
 * Attached through `ctx.inject(['tools'])` rather than a static `inject` entry: a host
 * without a tool registry (CLI, headless profile) keeps the plugin alive and simply has
 * no git tools — the same degrade-one-thing shape the contract documents.
 */
export function registerGitTools(ctx: Context, options: GitToolOptions): void {
  ctx.inject(['tools'], (toolCtx) => {
    /** Resolve this call's working directory, falling back to the host cwd. */
    const cwdFor = async (agent: Agent | undefined, signal: AbortSignal, fallback?: string): Promise<string> => {
      if (fallback !== undefined && fallback.length > 0) return fallback
      const fromSession = await options.resolveCwd(agent, signal)
      if (fromSession !== undefined) return fromSession
      const host = ctx.get('workingDirectory') as unknown
      if (typeof (host as { cwd?: string })?.cwd === 'string') return (host as { cwd: string }).cwd
      return process.cwd()
    }

    toolCtx.tools.register(defineTool({
      name: 'git_status',
      description: 'Show the working tree state of a git repository: current branch, and one row per changed file with its staging state (index column) and working-tree state. Read-only.',
      parameters: {
        path: {
          type: 'string',
          description: 'Repository directory. Defaults to the session working directory.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            branch: { type: 'string', required: true, description: 'Current branch, or a detached-HEAD marker.' },
            clean: { type: 'boolean', required: true, description: 'True when there are no changes.' },
            entries: {
              type: 'array',
              required: true,
              description: 'Changed files. Rename rows keep the "old -> new" form git prints.',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  index: { type: 'string', required: true, description: 'Staging-area column (space when untracked/unstaged).' },
                  worktree: { type: 'string', required: true, description: 'Working-tree column.' },
                  path: { type: 'string', required: true, description: 'File path, relative to the repository root.' },
                },
              },
            },
            error: { type: 'string', description: 'Set instead of entries when git failed.' },
          },
        },
        render: (_args, value) => {
          let text: string
          if (value.error !== undefined) text = `git_status failed: ${value.error}`
          else if (value.clean) text = `${value.branch}: clean`
          else {
            const lines = [`${value.branch}: ${value.entries.length} change(s)`]
            for (const entry of value.entries) {
              lines.push(`  ${entry.index}${entry.worktree} ${entry.path}`)
            }
            text = lines.join('\n')
          }
          return [{ type: 'text', text }]
        },
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const cwd = await cwdFor(exec.agent, exec.signal, args.path)
        if (!(await isGitRepo(cwd))) return { branch: '', clean: true, entries: [], error: NOT_A_REPO }
        const result = await runGit(['status', '--porcelain=v1', '-b'], cwd)
        if (!result.ok) return { branch: '', clean: true, entries: [], error: result.stderr.trim() }
        const parsed = parseStatus(result.stdout)
        return {
          branch: parsed.branch || 'HEAD (detached)',
          clean: parsed.clean,
          entries: parsed.entries,
        }
      },
    }))

    toolCtx.tools.register(defineTool({
      name: 'git_diff',
      description: 'Show the patch of unstaged or staged changes in a git repository, optionally limited to one path. Use staged=true for what a commit would include right now. Read-only.',
      parameters: {
        path: {
          type: 'string',
          description: 'Repository directory. Defaults to the session working directory.',
        },
        staged: {
          type: 'boolean',
          description: 'True to diff the index against HEAD (what is staged) instead of the working tree.',
        },
        context: {
          type: 'integer',
          description: 'Context lines around each hunk. 0-20, default 3.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            patch: { type: 'string', required: true, description: 'Unified diff. Empty when there is nothing to show.' },
            stat: { type: 'string', required: true, description: 'The --stat summary line(s).' },
            truncated: { type: 'boolean', required: true, description: 'True when the patch was cut at the size cap.' },
            error: { type: 'string', description: 'Set instead of a patch when git failed.' },
          },
        },
        render: (_args, value) => {
          let text: string
          if (value.error !== undefined) text = `git_diff failed: ${value.error}`
          else if (value.patch === '') text = 'No changes to show.'
          else {
            text = [value.stat, '', value.patch].filter((s) => s.length > 0).join('\n')
              + (value.truncated ? '\n... [output truncated]' : '')
          }
          return [{ type: 'text', text }]
        },
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const cwd = await cwdFor(exec.agent, exec.signal, args.path)
        if (!(await isGitRepo(cwd))) return { patch: '', stat: '', truncated: false, error: NOT_A_REPO }
        const diffArgs = ['diff', `-U${clampContext(args.context)}`, ...(args.staged === true ? ['--cached'] : []), '--']
        const result = await runGit(diffArgs, cwd)
        if (!result.ok) return { patch: '', stat: '', truncated: result.truncated, error: result.stderr.trim() }
        const statResult = await runGit(['diff', '--stat', ...(args.staged === true ? ['--cached'] : []), '--'], cwd)
        const capped = capPatch(result.stdout)
        return {
          patch: capped.patch,
          stat: statResult.stdout.trim(),
          truncated: capped.truncated || result.truncated,
        }
      },
    }))

    toolCtx.tools.register(defineTool({
      name: 'git_log',
      description: 'List recent commits of a git repository, newest first: hash, author, date, subject. Read-only.',
      parameters: {
        path: {
          type: 'string',
          description: 'Repository directory. Defaults to the session working directory.',
        },
        limit: {
          type: 'integer',
          description: `How many commits. ${MIN_LIMIT}-${MAX_LIMIT}, default ${DEFAULT_LOG_LIMIT}.`,
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            commits: {
              type: 'array',
              required: true,
              description: 'Commits, newest first.',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  hash: { type: 'string', required: true, description: 'Full commit hash.' },
                  author: { type: 'string', required: true, description: 'Author name.' },
                  email: { type: 'string', required: true, description: 'Author email.' },
                  date: { type: 'string', required: true, description: 'Author date, ISO 8601.' },
                  subject: { type: 'string', required: true, description: 'First line of the message.' },
                },
              },
            },
            error: { type: 'string', description: 'Set instead of commits when git failed.' },
          },
        },
        render: (_args, value) => {
          let text: string
          if (value.error !== undefined) text = `git_log failed: ${value.error}`
          else if (value.commits.length === 0) text = 'No commits yet.'
          else {
            const lines = [`${value.commits.length} commit(s), newest first:`]
            for (const commit of value.commits) {
              lines.push(`  ${commit.hash.slice(0, 8)} ${commit.date.slice(0, 10)} ${commit.author}: ${commit.subject}`)
            }
            text = lines.join('\n')
          }
          return [{ type: 'text', text }]
        },
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const cwd = await cwdFor(exec.agent, exec.signal, args.path)
        if (!(await isGitRepo(cwd))) return { commits: [], error: NOT_A_REPO }
        const limit = clampLimit(args.limit)
        const result = await runGit(
          ['log', `-n${limit}`, '--pretty=format:%H%x1f%an%x1f%ae%x1f%aI%x1f%s'], cwd)
        if (!result.ok) return { commits: [], error: result.stderr.trim() }
        const commits = result.stdout.split('\n')
          .filter((l) => l.length > 0)
          .map(parseLogLine)
          .filter((c) => c !== undefined)
        return { commits }
      },
    }))

    toolCtx.tools.register(defineTool({
      name: 'git_commit',
      description: 'Stage files and create one commit in a git repository. Pass add with explicit paths (relative to the repository root) to stage them; without add, commits what is already staged. Runs in the host process, so git identity from the user\'s global config applies even on hosts whose sandbox strips HOME.',
      parameters: {
        message: {
          type: 'string',
          required: true,
          description: 'Commit message. First line is the subject; keep it under 72 characters.',
        },
        add: {
          type: 'array',
          description: 'Paths to stage before committing. Use ["."] for everything, or exact paths for a surgical commit.',
          items: { type: 'string' },
        },
        allowEmpty: {
          type: 'boolean',
          description: 'True to allow a commit with no changes. Rarely what you want.',
        },
        path: {
          type: 'string',
          description: 'Repository directory. Defaults to the session working directory.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            committed: { type: 'boolean', required: true, description: 'False when nothing was committed.' },
            hash: { type: 'string', description: 'The new commit hash, when committed.' },
            branch: { type: 'string', description: 'Branch the commit landed on, when committed.' },
            files: { type: 'string', description: 'Newline-separated staged files, when known.' },
            error: { type: 'string', description: 'Why nothing was committed.' },
          },
        },
        render: (_args, value) => {
          let text: string
          if (!value.committed) text = `Not committed: ${value.error ?? 'unknown reason'}`
          else {
            const lines = [`Committed ${value.hash?.slice(0, 8) ?? ''} on ${value.branch ?? 'HEAD'}:`]
            if (value.files !== undefined) {
              for (const file of value.files.split('\n')) lines.push(`  ${file}`)
            }
            text = lines.join('\n')
          }
          return [{ type: 'text', text }]
        },
      },
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        const cwd = await cwdFor(exec.agent, exec.signal, args.path)
        if (!(await isGitRepo(cwd))) return { committed: false, error: NOT_A_REPO }
        const message = args.message?.trim() ?? ''
        if (message.length === 0) {
          return { committed: false, error: 'message is empty; a commit needs at least a subject line.' }
        }

        if (args.add !== undefined && args.add.length > 0) {
          const add = await runGit(['add', '--', ...args.add], cwd)
          if (!add.ok) return { committed: false, error: `git add failed: ${add.stderr.trim()}` }
        }

        const staged = await runGit(['diff', '--cached', '--name-only'], cwd)
        if (!staged.ok) return { committed: false, error: staged.stderr.trim() }
        const files = staged.stdout.split('\n').filter((l) => l.length > 0)
        if (files.length === 0 && args.allowEmpty !== true) {
          return {
            committed: false,
            error: 'nothing staged: pass add with the paths to stage, or check git_status first.',
          }
        }

        const commit = await runGit(['commit', ...identityArgs(options.identity), '-m', message], cwd)
        if (!commit.ok) {
          // Missing identity is the most common host-side failure and is fixable by the
          // user in one command; surface git's own message so the model can quote it.
          return { committed: false, error: commit.stderr.trim() || commit.stdout.trim() }
        }
        const hashResult = await runGit(['rev-parse', 'HEAD'], cwd)
        const branchResult = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
        const hash = hashResult.ok ? hashResult.stdout.trim() : undefined
        const branch = branchResult.ok ? branchResult.stdout.trim() : undefined
        return {
          committed: true,
          ...(hash === undefined ? {} : { hash }),
          ...(branch === undefined ? {} : { branch }),
          ...(files.length > 0 ? { files: files.join('\n') } : {}),
        }
      },
    }))

    // ── 2.0：分支 / 暂存 / 单提交检视 / 推送 ──────────────────────────

    toolCtx.tools.register(defineTool({
      name: 'git_branch',
      description: 'List, create, switch, or delete branches in a git repository. delete uses the safe -d form: git refuses branches with unmerged work. Read actions are safe; create/switch change HEAD.',
      parameters: {
        action: {
          type: 'string',
          required: true,
          enum: ['list', 'create', 'switch', 'delete'],
          description: 'What to do with branches.',
        },
        name: {
          type: 'string',
          description: 'Branch name. Required for create/switch/delete.',
        },
        path: {
          type: 'string',
          description: 'Repository directory. Defaults to the session working directory.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            branches: {
              type: 'array',
              required: true,
              description: 'Branch list (for action=list).',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string', required: true, description: 'Branch name.' },
                  current: { type: 'boolean', required: true, description: 'True for the checked-out branch.' },
                },
              },
            },
            done: { type: 'boolean', required: true, description: 'Whether the requested action succeeded.' },
            error: { type: 'string', description: 'Why the action failed.' },
          },
        },
        render: (_args, value) => {
          let text: string
          if (value.error !== undefined) text = `git_branch failed: ${value.error}`
          else if (value.branches.length > 0) {
            text = value.branches.map((b) => `${b.current ? '* ' : '  '}${b.name}`).join('\n')
          } else text = value.done ? 'done' : 'no change'
          return [{ type: 'text', text }]
        },
      },
      isConcurrencySafe: (args) => (args as { action?: string })?.action === 'list',
      async execute(args, exec) {
        const cwd = await cwdFor(exec.agent, exec.signal, args.path)
        if (!(await isGitRepo(cwd))) return { branches: [], done: false, error: NOT_A_REPO }
        if (args.action === 'list') {
          const result = await runGit(['branch', '--format=%(refname:short)%00%(HEAD)'], cwd)
          if (!result.ok) return { branches: [], done: false, error: result.stderr.trim() }
          const branches = result.stdout.split('\n').filter((l) => l.length > 0).map((line) => {
            const [name, head] = line.split('\x00')
            return { name: name ?? '', current: head === '*' }
          })
          return { branches, done: true }
        }
        const name = args.name?.trim() ?? ''
        if (name.length === 0) return { branches: [], done: false, error: `action ${args.action} requires a branch name.` }
        const gitArgs = args.action === 'create' ? ['branch', name]
          : args.action === 'switch' ? ['switch', name]
          : ['branch', '-d', name]              // 安全删除：未合并的分支 git 会拒绝
        const result = await runGit(gitArgs, cwd)
        if (!result.ok) return { branches: [], done: false, error: result.stderr.trim() }
        return { branches: [], done: true }
      },
    }))

    toolCtx.tools.register(defineTool({
      name: 'git_stash',
      description: 'List, create, or pop stashes in a git repository. push saves uncommitted changes away so the worktree is clean; pop restores the newest stash back. Stash entries stay recoverable after pop until dropped.',
      parameters: {
        action: {
          type: 'string',
          required: true,
          enum: ['list', 'push', 'pop'],
          description: 'What to do with the stash.',
        },
        message: {
          type: 'string',
          description: 'Description for a new stash (action=push).',
        },
        path: {
          type: 'string',
          description: 'Repository directory. Defaults to the session working directory.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            stashes: {
              type: 'array',
              required: true,
              description: 'Stash list (for action=list), newest first.',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  ref: { type: 'string', required: true, description: 'Stash ref, like stash@{0}.' },
                  subject: { type: 'string', required: true, description: 'The stash description.' },
                },
              },
            },
            done: { type: 'boolean', required: true, description: 'Whether the requested action succeeded.' },
            error: { type: 'string', description: 'Why the action failed.' },
          },
        },
        render: (_args, value) => {
          let text: string
          if (value.error !== undefined) text = `git_stash failed: ${value.error}`
          else if (value.stashes.length > 0) {
            text = value.stashes.map((s) => `${s.ref}: ${s.subject}`).join('\n')
          } else text = value.done ? 'done' : 'nothing'
          return [{ type: 'text', text }]
        },
      },
      isConcurrencySafe: (args) => (args as { action?: string })?.action === 'list',
      async execute(args, exec) {
        const cwd = await cwdFor(exec.agent, exec.signal, args.path)
        if (!(await isGitRepo(cwd))) return { stashes: [], done: false, error: NOT_A_REPO }
        if (args.action === 'list') {
          const result = await runGit(['stash', 'list', '--pretty=format:%gd%x1f%gs'], cwd)
          if (!result.ok) return { stashes: [], done: false, error: result.stderr.trim() }
          const stashes = result.stdout.split('\n').filter((l) => l.length > 0).map((line) => {
            const [ref, subject] = line.split('\x1f')
            return { ref: ref ?? '', subject: subject ?? '' }
          })
          return { stashes, done: true }
        }
        if (args.action === 'push') {
          const stashArgs = args.message !== undefined && args.message.trim().length > 0
            ? ['stash', 'push', '-m', args.message.trim()]
            : ['stash', 'push']
          const result = await runGit(stashArgs, cwd)
          if (!result.ok) return { stashes: [], done: false, error: result.stderr.trim() }
          return { stashes: [], done: true }
        }
        const result = await runGit(['stash', 'pop'], cwd)
        if (!result.ok) return { stashes: [], done: false, error: result.stderr.trim() }
        return { stashes: [], done: true }
      },
    }))

    toolCtx.tools.register(defineTool({
      name: 'git_show',
      description: 'Show one commit: its stat summary and full patch. Read-only; use git_log first to find the hash.',
      parameters: {
        hash: {
          type: 'string',
          required: true,
          description: 'Commit hash (abbreviated is fine) or a ref like HEAD~1.',
        },
        path: {
          type: 'string',
          description: 'Repository directory. Defaults to the session working directory.',
        },
        context: {
          type: 'integer',
          description: 'Context lines around each hunk. 0-20, default 3.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            stat: { type: 'string', required: true, description: 'The --stat summary.' },
            patch: { type: 'string', required: true, description: 'The commit diff.' },
            truncated: { type: 'boolean', required: true, description: 'True when the patch was cut at the size cap.' },
            error: { type: 'string', description: 'Set instead of a patch when git failed.' },
          },
        },
        render: (_args, value) => {
          let text: string
          if (value.error !== undefined) text = `git_show failed: ${value.error}`
          else text = [value.stat, '', value.patch].filter((s) => s.length > 0).join('\n')
            + (value.truncated ? '\n... [output truncated]' : '')
          return [{ type: 'text', text }]
        },
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const cwd = await cwdFor(exec.agent, exec.signal, args.path)
        if (!(await isGitRepo(cwd))) return { stat: '', patch: '', truncated: false, error: NOT_A_REPO }
        const hash = args.hash?.trim() ?? ''
        if (hash.length === 0) return { stat: '', patch: '', truncated: false, error: 'hash is empty.' }
        const show = await runGit(['show', `-U${clampContext(args.context)}`, '--format=', hash, '--'], cwd)
        if (!show.ok) return { stat: '', patch: '', truncated: show.truncated, error: show.stderr.trim() }
        const stat = await runGit(['show', '--stat', '--format=', hash], cwd)
        const capped = capPatch(show.stdout)
        return {
          stat: stat.ok ? stat.stdout.trim() : '',
          patch: capped.patch,
          truncated: capped.truncated || show.truncated,
        }
      },
    }))

    // git_push 只在配置显式打开时注册：宿主进程可达网络与凭据，绕过沙箱审批层，
    // 所以这道门必须在插件侧补上（见 src/config.ts 的注释）。
    if (options.allowPush === true) {
      toolCtx.tools.register(defineTool({
        name: 'git_push',
        description: 'Push commits to the remote of a git repository. Runs in the host process with the user\'s credentials. Only available because the host operator enabled it in this plugin\'s config.',
        parameters: {
          path: {
            type: 'string',
            description: 'Repository directory. Defaults to the session working directory.',
          },
          remote: {
            type: 'string',
            description: 'Remote name. Defaults to the branch\'s upstream, then origin.',
          },
          branch: {
            type: 'string',
            description: 'Branch to push. Defaults to the current branch.',
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              pushed: { type: 'boolean', required: true, description: 'Whether the push succeeded.' },
              error: { type: 'string', description: 'Why the push failed.' },
            },
          },
          render: (_args, value) => ([{
            type: 'text',
            text: value.pushed ? 'Pushed.' : `Push failed: ${value.error ?? 'unknown reason'}`,
          }]),
        },
        isConcurrencySafe: () => false,
        async execute(args, exec) {
          const cwd = await cwdFor(exec.agent, exec.signal, args.path)
          if (!(await isGitRepo(cwd))) return { pushed: false, error: NOT_A_REPO }
          const pushArgs = ['push']
          if (args.remote !== undefined && args.remote.trim().length > 0) {
            pushArgs.push(args.remote.trim())
            if (args.branch !== undefined && args.branch.trim().length > 0) pushArgs.push(args.branch.trim())
          }
          const result = await runGit(pushArgs, cwd, { timeoutMs: 120_000 })
          if (!result.ok) return { pushed: false, error: result.stderr.trim() || result.stdout.trim() }
          return { pushed: true }
        },
      }))
    }
  })
}
