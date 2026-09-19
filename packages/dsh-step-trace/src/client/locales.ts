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
  'totalSessions': '总会话数',
  'totalSteps': '总步骤数',
  'avgSteps': '平均步骤',
  'totalLatency': '总耗时',
  'sessions': '会话列表',
  'model': '模型',
  'tool': '工具',
  'timeline': '时间线',
  'type': '类型',
  'latency': '延迟',
  'time': '时间',
  'actions': '操作',
  'input': '输入',
  'output': '输出',
  'branch': '分支',
  'delete': '删除',
  'confirmDelete': '确定删除此会话？',
  'noSteps': '此会话没有步骤记录。',
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
  'totalSessions': 'Total Sessions',
  'totalSteps': 'Total Steps',
  'avgSteps': 'Avg Steps',
  'totalLatency': 'Total Latency',
  'sessions': 'Sessions',
  'model': 'Model',
  'tool': 'Tool',
  'timeline': 'Timeline',
  'type': 'Type',
  'latency': 'Latency',
  'time': 'Time',
  'actions': 'Actions',
  'input': 'Input',
  'output': 'Output',
  'branch': 'Branch',
  'delete': 'Delete',
  'confirmDelete': 'Delete this session?',
  'noSteps': 'No steps recorded for this session.',
}
