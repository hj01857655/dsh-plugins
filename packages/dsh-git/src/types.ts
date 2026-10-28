/** Shared panel types, imported by both halves. @module git/types */

/** One row of `git status --porcelain=v1`. */
export interface StatusEntry {
  index: string
  worktree: string
  path: string
}

/** What the panel route returns. */
export interface GitPanelPayload {
  /** Repository the panel is showing. */
  cwd: string
  branch: string
  clean: boolean
  entries: StatusEntry[]
  commits: Array<{ hash: string; author: string; date: string; subject: string }>
  error?: string
}
