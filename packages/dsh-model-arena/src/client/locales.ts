/**
 * Dictionaries for the Model Arena page.
 *
 * `zh` is the key-set source of truth, as in the official client plugins, and `en` is
 * typed against it: a key translated in one language but not the other fails the build
 * instead of silently rendering the raw key.
 *
 * @module client/locales
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'modelArena'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': '模型竞技场',
  'title': '模型竞技场',
  'run': '运行',
  'models': '模型数',
  'model': '模型',
  'date': '时间',
  'prompt': '提示词',
  'empty': '还没有运行记录。用同一个提示词跑多个模型后，结果会显示在这里。',
  'refresh': '刷新',
  'loading': '正在加载…',
  'failed': '加载失败',
  'retry': '重试',
  'leaderboard': 'Elo 排行榜',
  'wins': '胜',
  'avgRating': '平均评分',
  'runs': '次数',
  'totalRuns': '总运行数',
  'uniqueModels': '模型种类',
  'totalRatings': '总评分数',
  'recentRuns': '最近运行',
  'winner': '胜出',
  'reference': '参考答案',
  'error': '错误',
  'delete': '删除',
  'confirmDelete': '确定删除这条运行记录？',
  'notFound': '未找到运行记录',
}

/** English dictionary, checked complete against the zh key set. */
export const en: typeof zh = {
  'nav': 'Model Arena',
  'title': 'Model Arena',
  'run': 'Run',
  'models': 'Models',
  'model': 'Model',
  'date': 'Date',
  'prompt': 'Prompt',
  'empty': 'No runs yet. Run one prompt through several models and the comparison appears here.',
  'refresh': 'Refresh',
  'loading': 'Loading…',
  'failed': 'Failed to load',
  'retry': 'Retry',
  'leaderboard': 'Elo Leaderboard',
  'wins': 'Wins',
  'avgRating': 'Avg Rating',
  'runs': 'Runs',
  'totalRuns': 'Total Runs',
  'uniqueModels': 'Models',
  'totalRatings': 'Ratings',
  'recentRuns': 'Recent Runs',
  'winner': 'Winner',
  'reference': 'Reference',
  'error': 'Error',
  'delete': 'Delete',
  'confirmDelete': 'Delete this run?',
  'notFound': 'Run not found',
}
