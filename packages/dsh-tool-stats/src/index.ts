import { resolve } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import type { ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools';
import { ToolStats } from './stats.js';
import { registerStatsRoutes } from './routes.js';
import { CallTimer } from './collect.js';

export const name = 'dsh-tool-stats';

export interface StatsService {
  record(call: Parameters<ToolStats['record']>[0]): void;
  summary(configuredTools?: string[]): ReturnType<ToolStats['summary']>;
  query(range?: { from?: number | undefined; to?: number | undefined }, configuredTools?: string[]): ReturnType<ToolStats['summary']>;
  detail(toolName: string): ReturnType<ToolStats['detail']>;
  exportCSV(): string;
  clearData(): void;
}

export function apply(ctx: Context): void {
  const root = resolve(process.cwd());
  const stats = new ToolStats(root);

  const service = {
    record: (call: Parameters<StatsService['record']>[0]) => stats.record(call),
    summary: (configuredTools?: string[]) => stats.summary(configuredTools ?? []),
    query: (range?: { from?: number; to?: number }, configuredTools?: string[]) => stats.query(range, configuredTools ?? []),
    detail: (toolName: string) => stats.detail(toolName),
    exportCSV: () => stats.exportCSV(),
    clearData: () => stats.clearData(),
  } satisfies StatsService;

  ctx.provide('toolStats', service);
  registerStatsRoutes(ctx, service);

  // 每个 apply() 一份计时表：装载实例之间不共享起点，卸载后随 exec 一起回收。
  const timer = new CallTimer();

  // pre-execute 是 monotonic waterfall：listener 必须把 next() 的结果原样返回，
  // 否则策略链拿到的决策被截断。{ prepend: true } 让起点尽量靠前，覆盖后续
  // 其它 pre-execute 插件与审批等待的时长。
  ctx.on('tools/pre-execute', (exec: ToolExecution, next) => {
    timer.start(exec);
    return next();
  }, { prepend: true });

  // tools/result 是所有调用的唯一终态（dispatch / post-result / final-result 三条
  // 派发路径都汇入 notifyResult），故 deny、cancel、执行前取消也都计得到。
  // listener 抛错被 registry 吞成一条 warn，不污染调用结果。
  ctx.on('tools/result', (exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>) => {
    stats.record(timer.settle(exec, result));
  });
}
