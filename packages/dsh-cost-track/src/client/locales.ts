/**
 * Dictionaries for the Cost page.
 *
 * `zh` is the key-set source of truth, as in the official client plugins, and `en` is
 * typed against it: a key translated in one language but not the other fails the build
 * instead of silently rendering the raw key.
 *
 * @module client/locales
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'costTrack'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': '成本',
  'title': '成本',
  'today': '今日',
  'month': '本月',
  'budget': '预算',
  'budgetExceeded': '已超出预算',
  'model': '模型',
  'calls': '调用次数',
  'spend': '花费',
  'recentSessions': '最近会话',
  'session': '会话',
  'date': '日期',
  'empty': '暂无花费记录。',
  'refresh': '刷新',
  'loading': '正在加载…',
  'failed': '加载失败',
  'retry': '重试',
}

/** English dictionary, checked complete against the zh key set. */
export const en: typeof zh = {
  'nav': 'Cost',
  'title': 'Cost',
  'today': 'Today',
  'month': 'This month',
  'budget': 'Budget',
  'budgetExceeded': 'over budget',
  'model': 'Model',
  'calls': 'Calls',
  'spend': 'Spend',
  'recentSessions': 'Recent sessions',
  'session': 'Session',
  'date': 'Date',
  'empty': 'No spend recorded yet.',
  'refresh': 'Refresh',
  'loading': 'Loading…',
  'failed': 'Failed to load',
  'retry': 'Retry',
}
