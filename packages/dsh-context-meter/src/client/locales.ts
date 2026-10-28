/**
 * Dictionaries for the Context usage page.
 *
 * `zh` is the key-set source of truth, as in the official client plugins, and `en` is
 * typed against it: a key translated in one language but not the other fails the build
 * instead of silently rendering the raw key.
 *
 * The page deliberately does NOT re-render the composer meter's occupancy ring or
 * breakdown composition — the official input-bar surface already shows those. This page
 * covers what it does not: cross-session comparison, cumulative usage, and routes.
 *
 * @module client/locales
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'contextMeter'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': '会话用量对比',
  'title': '会话用量对比',
  'noSessions': '还没有会话。',
  'session': '会话',
  'route': '模型路由',
  'window': '窗口',
  'projected': '下一请求预估',
  'occupancy': '占用',
  'usage': '累计用量',
  'uncachedInput': '未缓存输入',
  'output': '输出',
  'cacheRead': '缓存读',
  'cacheWrite': '缓存写',
  'tokens': 'tokens',
  'untitled': '（未命名）',
  'noData': '无数据',
  'autoRefresh': '每 3 秒自动刷新；占用与组成的实时环形图见输入框下方官方指示器。',
  'danger': '接近压缩',
  'warn': '偏高',
  'safe': '充裕',
} as const

/** English dictionary, typed against `zh` so a missing key fails the build. */
export const en: typeof zh = {
  'nav': 'Session usage',
  'title': 'Session usage',
  'noSessions': 'No sessions yet.',
  'session': 'Session',
  'route': 'Route',
  'window': 'Window',
  'projected': 'Next request',
  'occupancy': 'Occupancy',
  'usage': 'Cumulative usage',
  'uncachedInput': 'Uncached input',
  'output': 'Output',
  'cacheRead': 'Cache read',
  'cacheWrite': 'Cache write',
  'tokens': 'tokens',
  'untitled': '(untitled)',
  'noData': 'No data',
  'autoRefresh': 'Refreshes every 3s; the live occupancy ring and composition live in the official composer indicator below the input bar.',
  'danger': 'Near compaction',
  'warn': 'Elevated',
  'safe': 'Healthy',
}
