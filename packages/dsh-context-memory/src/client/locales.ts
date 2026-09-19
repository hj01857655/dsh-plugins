/**
 * Dictionaries for the Context memory page.
 *
 * `zh` is the key-set source of truth, as in the official client plugins, and `en` is
 * typed against it: a key translated in one language but not the other fails the build
 * instead of silently rendering the raw key.
 *
 * @module client/locales
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'contextMemory'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': '跨会话记忆',
  'title': '跨会话记忆',
  'active': '生效中',
  'superseded': '已失效',
  'conflicts': '冲突',
  'noConflicts': '没有冲突。',
  'memory': '记忆',
  'kind': '类型',
  'status': '校验状态',
  'from': '来源',
  'checkNone': '无检查',
  'checkPassed': '已核对，成立',
  'checkViolated': '已核对，不成立',
  'checkBroken': '检查无法运行',
  'checkPending': '尚未核对',
  'unverified': '未验证成立',
  'empty': '还没有记住任何内容。',
  'checkLegend': '无检查＝无法编译检查；检查无法运行＝检查本身有问题，不代表记忆错误。',
  'refresh': '刷新',
  'loading': '正在加载…',
  'failed': '加载失败',
  'retry': '重试',
  'searchPlaceholder': '搜索记忆…',
  'search': '搜索',
  'searchResults': '搜索结果',
  'noResults': '没有匹配的记忆。',
  'addMemory': '添加记忆',
  'memoryText': '记忆内容',
  'subjectOptional': '主题（可选）',
  'kindFact': '事实',
  'kindDecision': '决策',
  'kindPreference': '偏好',
  'kindPitfall': '陷阱',
  'add': '添加',
  'forget': '废弃',
  'resolve': '解决',
  'integration': '集成',
  'autoCaptureLabel': '自动捕获:用户消息里的「记住…」「以后…」自动入库',
  'recallInjectLabel': '召回注入:每次请求前把相关记忆折进上下文',
}

/** English dictionary, checked complete against the zh key set. */
export const en: typeof zh = {
  'nav': 'Context memory',
  'title': 'Context memory',
  'active': 'active',
  'superseded': 'superseded',
  'conflicts': 'Conflicts',
  'noConflicts': 'No conflicts.',
  'memory': 'Memory',
  'kind': 'Kind',
  'status': 'Check',
  'from': 'From',
  'checkNone': 'no check',
  'checkPassed': 'checked, holds',
  'checkViolated': 'checked, does not hold',
  'checkBroken': 'check unusable',
  'checkPending': 'not yet checked',
  'unverified': 'not verified as holding',
  'empty': 'Nothing is remembered yet.',
  'checkLegend': 'no check = no check could be compiled; check unusable = the check is defective, not the memory.',
  'refresh': 'Refresh',
  'loading': 'Loading…',
  'failed': 'Failed to load',
  'retry': 'Retry',
  'searchPlaceholder': 'Search memories…',
  'search': 'Search',
  'searchResults': 'Search Results',
  'noResults': 'No matching memories.',
  'addMemory': 'Add Memory',
  'memoryText': 'Memory text',
  'subjectOptional': 'Subject (optional)',
  'kindFact': 'Fact',
  'kindDecision': 'Decision',
  'kindPreference': 'Preference',
  'kindPitfall': 'Pitfall',
  'add': 'Add',
  'forget': 'Forget',
  'resolve': 'Resolve',
  'integration': 'Integration',
  'autoCaptureLabel': 'Auto capture: "remember that…" statements land in the log',
  'recallInjectLabel': 'Recall injection: fold relevant memories into each request',
}
