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
  'nav': '成本统计',
  'title': '成本统计',
  'today': '今日',
  'month': '本月',
  'total': '累计',
  'totalCalls': '总调用',
  'tokens': 'Token',
  'budget': '预算',
  'budgetExceeded': '已超出预算',
  'noBudget': '未设置预算',
  'setBudget': '设置预算',
  'editBudget': '修改预算',
  'monthlyLimit': '月限额',
  'enforceBlock': '超额时阻断',
  'saveBudget': '保存',
  'model': '模型',
  'calls': '调用次数',
  'spend': '花费',
  'avgPerCall': '均价/次',
  'modelBreakdown': '模型明细',
  'dailyTrend': '每日趋势（近 30 天）',
  'recentSessions': '最近会话',
  'session': '会话',
  'date': '日期',
  'empty': '暂无花费记录。',
  'refresh': '刷新',
  'exportCSV': '导出 CSV',
  'loading': '正在加载…',
  'failed': '加载失败',
  'retry': '重试',
  'supportedModels': '支持的模型',
  'budgetSaved': '预算已保存',
  'monthlyHint': '按月统计的额度上限，留空表示不限制',
  'enforceHint': '勾选后超出额度会直接拒绝请求',
  'notFound': '未找到',
}

/** English dictionary, checked complete against the zh key set. */
export const en: typeof zh = {
  'nav': 'Cost',
  'title': 'Cost',
  'today': 'Today',
  'month': 'This month',
  'total': 'Total',
  'totalCalls': 'Total calls',
  'tokens': 'Tokens',
  'budget': 'Budget',
  'budgetExceeded': 'over budget',
  'noBudget': 'No budget set',
  'setBudget': 'Set budget',
  'editBudget': 'Edit budget',
  'monthlyLimit': 'Monthly limit',
  'enforceBlock': 'Block on exceed',
  'saveBudget': 'Save',
  'model': 'Model',
  'calls': 'Calls',
  'spend': 'Spend',
  'avgPerCall': 'Avg/call',
  'modelBreakdown': 'Model breakdown',
  'dailyTrend': 'Daily trend (last 30 days)',
  'recentSessions': 'Recent sessions',
  'session': 'Session',
  'date': 'Date',
  'empty': 'No spend recorded yet.',
  'refresh': 'Refresh',
  'exportCSV': 'Export CSV',
  'loading': 'Loading…',
  'failed': 'Failed to load',
  'retry': 'Retry',
  'supportedModels': 'Supported models',
  'budgetSaved': 'Budget saved',
  'monthlyHint': 'Monthly spend cap; leave empty for no limit',
  'enforceHint': 'When checked, requests over the cap are rejected',
  'notFound': 'Not found',
}
