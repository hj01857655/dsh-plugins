/**
 * Dictionaries for the Context meter page.
 *
 * `zh` is the key-set source of truth, as in the official client plugins, and `en` is
 * typed against it: a key translated in one language but not the other fails the build
 * instead of silently rendering the raw key.
 *
 * @module client/locales
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'contextMeter'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': '上下文占用',
  'title': '上下文占用',
  'noData': '暂无数据：还没有任何请求或 token-meter 未挂载。',
  'noSessions': '还没有会话。',
  'window': '上下文窗口',
  'pressure': '最近请求',
  'projected': '下一请求预估',
  'occupancy': '占用率',
  'breakdown': '组成（近似）',
  'system': '系统提示',
  'tools': '工具 Schema',
  'messages': '消息正文',
  'usage': '累计用量',
  'uncachedInput': '未缓存输入',
  'output': '输出',
  'cacheRead': '缓存读',
  'cacheWrite': '缓存写',
  'tokens': 'tokens',
  'model': '模型',
  'autoRefresh': '自动刷新',
  'safe': '充裕',
  'warn': '偏高',
  'danger': '接近压缩',
} as const

/** English dictionary, typed against `zh` so a missing key fails the build. */
export const en: typeof zh = {
  'nav': 'Context meter',
  'title': 'Context meter',
  'noData': 'No data yet: no request has been made, or token-meter is not mounted.',
  'noSessions': 'No sessions yet.',
  'window': 'Context window',
  'pressure': 'Last request',
  'projected': 'Next request (projected)',
  'occupancy': 'Occupancy',
  'breakdown': 'Composition (approximate)',
  'system': 'System prompt',
  'tools': 'Tool schemas',
  'messages': 'Messages',
  'usage': 'Cumulative usage',
  'uncachedInput': 'Uncached input',
  'output': 'Output',
  'cacheRead': 'Cache read',
  'cacheWrite': 'Cache write',
  'tokens': 'tokens',
  'model': 'Model',
  'autoRefresh': 'Auto refresh',
  'safe': 'Healthy',
  'warn': 'Elevated',
  'danger': 'Near compaction',
}
