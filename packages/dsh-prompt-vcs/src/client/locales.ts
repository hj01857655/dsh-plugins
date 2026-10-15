/**
 * Dictionaries for the Prompt VCS page.
 *
 * `zh` is the key-set source of truth, as in the official client plugins, and `en` is
 * typed against it: a key translated in one language but not the other fails the build
 * instead of silently rendering the raw key.
 *
 * @module client/locales
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'promptVcs'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': '提示词版本',
  'title': '提示词版本',
  'hash': '版本号',
  'date': '时间',
  'by': '修改方',
  'file': '文件',
  'added': '新增',
  'removed': '删除',
  'empty': '还没有记录到指令改动。',
  'refresh': '刷新',
  'loading': '正在加载…',
  'failed': '加载失败',
  'retry': '重试',
  'totalChanges': '总变更数',
  'filesTracked': '跟踪文件数',
  'watched': '监控文件',
  'files': '文件',
  'changes': '变更次数',
  'lastChanged': '最后变更',
  'size': '大小',
  'timeline': '时间线',
  'diff': '差异',
  'before': '变更前',
  'after': '变更后',
  'rollback': '回滚',
  'confirmRollback': '确定回滚到此变更之前的状态？',
  'notFound': '未找到变更记录',
}

/** English dictionary, checked complete against the zh key set. */
export const en: typeof zh = {
  'nav': 'Prompt VCS',
  'title': 'Prompt VCS',
  'hash': 'Hash',
  'date': 'Date',
  'by': 'Changed by',
  'file': 'File',
  'added': 'Added',
  'removed': 'Removed',
  'empty': 'No instruction changes recorded yet.',
  'refresh': 'Refresh',
  'loading': 'Loading…',
  'failed': 'Failed to load',
  'retry': 'Retry',
  'totalChanges': 'Total Changes',
  'filesTracked': 'Files Tracked',
  'watched': 'Watched',
  'files': 'Files',
  'changes': 'Changes',
  'lastChanged': 'Last Changed',
  'size': 'Size',
  'timeline': 'Timeline',
  'diff': 'Diff',
  'before': 'Before',
  'after': 'After',
  'rollback': 'Rollback',
  'confirmRollback': 'Rollback to before this change?',
  'notFound': 'Change not found',
}
