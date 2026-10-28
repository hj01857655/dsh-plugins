/** Shared panel types, imported by both halves. @module git/types */

/** One row of `git status --porcelain=v1`. */
export interface StatusEntry {
  index: string
  worktree: string
  path: string
}

/** One branch row for the panel. */
export interface BranchEntry {
  name: string
  current: boolean
}

/** What the panel route returns. */
export interface GitPanelPayload {
  /** Repository the panel is showing. */
  cwd: string
  branch: string
  clean: boolean
  entries: StatusEntry[]
  commits: Array<{ hash: string; author: string; date: string; subject: string }>
  branches?: BranchEntry[]
  error?: string
  /** Repositories directly under `cwd` when `cwd` itself is not one (workspace root). */
  repos?: string[]
}
