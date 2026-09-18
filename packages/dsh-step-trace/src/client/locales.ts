/**
 * Dictionaries for the Step trace page.
 *
 * `zh` is the key-set source of truth, as in the official client plugins, and `en` is
 * typed against it: a key translated in one language but not the other fails the build
 * instead of silently rendering the raw key.
 *
 * @module client/locales
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'stepTrace'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': '步骤追踪',
  'title': '步骤追踪',
  'session': '会话',
  'steps': '步骤数',
  'date': '时间',
  'empty': '还没有记录到会话。',
  'refresh': '刷新',
  'loading': '正在加载…',
  'failed': '加载失败',
  'retry': '重试',
}

/** English dictionary, checked complete against the zh key set. */
export const en: typeof zh = {
  'nav': 'Step trace',
  'title': 'Step trace',
  'session': 'Session',
  'steps': 'Steps',
  'date': 'Date',
  'empty': 'No sessions recorded yet.',
  'refresh': 'Refresh',
  'loading': 'Loading…',
  'failed': 'Failed to load',
  'retry': 'Retry',
}
