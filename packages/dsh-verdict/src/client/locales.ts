/**
 * Dictionaries for the Verdict page.
 *
 * `zh` is the key-set source of truth, as in the official client plugins, and `en` is
 * typed against it: a key translated in one language but not the other fails the build
 * instead of silently rendering the raw key.
 *
 * @module client/locales
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'verdict'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': 'Verdict',
  'title': '规则',
  'refresh': '刷新',
  'empty': '还没有捕获任何规则。用 verdict learn "…" 或 ctx.verdict.learn(…) 记录一条。',
  'guardPassed': '守卫已通过',
  'guardCannotRun': '守卫无法运行',
  'unhomed': '未写入 agent 文件',
  'violationEpisodes': '{count} 次违规',
  'skills': '技能',
  'skillsNone': '暂无——同一套步骤连续成功三次后，流程会出现在这里',
  'skillsCount': '{count} 个流程重复次数已够成为技能',
  'successfulRuns': '{runs} 次成功运行 · {steps} 步',
  'writeSkill': '写入技能',
  'writing': '写入中…',
  'sessionsTitle': '会话与对比',
  'sessionsCount': '已记录 {total} 个会话 · {candidates} 个技能候选',
  'improved': '改善：',
  'regressed': '回归：',
  'none': '无',
  'guardChanges': '守卫变更（不构成结论）：',
  'comparisonUnavailable': '无法对比——',
  'failed': 'Verdict 面板加载失败',
  'loading': '正在加载 Verdict 面板…',
  'retry': '重试',
}

/** English dictionary, checked complete against the zh key set. */
export const en: typeof zh = {
  'nav': 'Verdict',
  'title': 'Rules',
  'refresh': 'Refresh',
  'empty': 'No rules captured yet. Record one with verdict learn "…" or ctx.verdict.learn(…).',
  'guardPassed': 'guard passed',
  'guardCannotRun': 'guard cannot run',
  'unhomed': 'missing from the agent file',
  'violationEpisodes': '{count} violation episode(s)',
  'skills': 'Skills',
  'skillsNone': 'none yet — a procedure appears here after the same steps succeed three times',
  'skillsCount': '{count} procedure(s) repeated enough to become skills',
  'successfulRuns': '{runs} successful run(s) · {steps} step(s)',
  'writeSkill': 'Write skill',
  'writing': 'writing…',
  'sessionsTitle': 'Sessions & comparison',
  'sessionsCount': '{total} session(s) recorded · {candidates} skill candidate(s)',
  'improved': 'improved:',
  'regressed': 'regressed:',
  'none': 'none',
  'guardChanges': 'guard changes (not verdicts):',
  'comparisonUnavailable': 'comparison unavailable —',
  'failed': 'Verdict panel failed to load',
  'loading': 'Loading the verdict panel…',
  'retry': 'Retry',
}
