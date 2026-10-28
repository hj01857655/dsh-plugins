/**
 * Dictionaries for the Git page.
 *
 * `zh` is the key-set source of truth; `en` is typed against it, so a key translated in
 * one language but not the other fails the build instead of rendering the raw key.
 *
 * @module client/locales
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'dshGit'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': 'Git',
  'title': 'Git 仓库状态',
  'repo': '仓库',
  'branch': '分支',
  'clean': '工作区干净',
  'changes': '个改动',
  'staged': '已暂存',
  'unstaged': '未暂存',
  'untracked': '未跟踪',
  'noChanges': '没有改动。',
  'branches': '分支',
  'commits': '最近提交',
  'noCommits': '还没有提交。',
  'notRepo': '当前目录不是 git 仓库。',
  'refresh': '刷新',
  'loading': '正在加载…',
  'failed': '加载失败',
  'file': '文件',
  'state': '状态',
  'subject': '提交说明',
  'author': '作者',
  'date': '日期',
}

/** English dictionary, checked complete against the zh key set. */
export const en: typeof zh = {
  'nav': 'Git',
  'title': 'Git repository status',
  'repo': 'Repository',
  'branch': 'Branch',
  'clean': 'working tree clean',
  'changes': 'change(s)',
  'staged': 'staged',
  'unstaged': 'unstaged',
  'untracked': 'untracked',
  'noChanges': 'No changes.',
  'branches': 'Branches',
  'commits': 'Recent commits',
  'noCommits': 'No commits yet.',
  'notRepo': 'The current directory is not a git repository.',
  'refresh': 'Refresh',
  'loading': 'Loading…',
  'failed': 'Failed to load',
  'file': 'File',
  'state': 'State',
  'subject': 'Subject',
  'author': 'Author',
  'date': 'Date',
}
