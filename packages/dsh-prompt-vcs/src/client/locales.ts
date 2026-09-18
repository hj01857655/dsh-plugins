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
}
