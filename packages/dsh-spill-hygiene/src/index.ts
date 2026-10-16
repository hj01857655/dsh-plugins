// dsh-spill-hygiene 宿主入口。
//
// 只做一件事：按周期清扫 %TEMP% 里 dsh 自己看不见的那些子进程 spill 残留
// （审计发现 F-1，见 docs/WIN32-TOOL-CALL-CHAIN-AUDIT.md §3）。
// 删除策略全部在 sweep.ts，本文件只负责配置、调度与日志。

import type { Context } from '@deepseek-ai/cordis';
import { tmpdir } from 'node:os';
import { formatReport, sweep } from './sweep.js';
import type { SweepOptions } from './types.js';

export const name = 'dsh-spill-hygiene';

export { formatReport, sweep } from './sweep.js';
export type { RootReport, SpillEntry, SpillVerdict, SweepOptions, SweepReport } from './types.js';

/** 默认保留天数，与 dsh 自家 spill 清理的 `cleanupPeriodDays` 对齐。 */
const DEFAULT_MAX_AGE_DAYS = 30;

/** 默认清扫周期：一天一次足够 —— 这些文件的增长上界是单个 maxSpillBytes（默认 64 MiB）。 */
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** 装载后多久跑第一轮：避开启动期，别和 dsh 自己的启动清扫抢 tmpdir。 */
const DEFAULT_FIRST_DELAY_MS = 60_000;

export interface SweeperConfig extends SweepOptions {
  /** 首轮延时（ms）。 */
  firstDelayMs: number;
  /** 周期（ms）。 */
  intervalMs: number;
}

/**
 * 从环境变量读出配置。
 *
 * 用环境变量而不是 `ctx.config`：本包不假设宿主给它开了配置命名空间
 * （现有 8 个插件没有一个用过 ctx.config，契约文档里也没有这一项）。
 *
 * - `DSH_SPILL_HYGIENE_APPLY=1`        才会真的删文件（默认只报告）
 * - `DSH_SPILL_HYGIENE_MAX_AGE_DAYS=n` 保留天数
 * - `DSH_SPILL_HYGIENE_INTERVAL_MS=n`  清扫周期
 * - `DSH_SPILL_HYGIENE_FIRST_DELAY_MS` 首轮延时
 * - `DSH_SPILL_HYGIENE_TMP_DIR=path`   扫描根（默认操作系统 tmpdir）
 */
export function readConfig(env: NodeJS.ProcessEnv = process.env): SweeperConfig {
  return {
    // 默认 dry-run：一个会自动删文件的插件不该在装载那一刻就获得删除能力。
    dryRun: !isTruthy(env.DSH_SPILL_HYGIENE_APPLY),
    maxAgeDays: positiveNumber(env.DSH_SPILL_HYGIENE_MAX_AGE_DAYS, DEFAULT_MAX_AGE_DAYS),
    intervalMs: positiveNumber(env.DSH_SPILL_HYGIENE_INTERVAL_MS, DEFAULT_INTERVAL_MS),
    firstDelayMs: positiveNumber(env.DSH_SPILL_HYGIENE_FIRST_DELAY_MS, DEFAULT_FIRST_DELAY_MS),
    tmpDir: env.DSH_SPILL_HYGIENE_TMP_DIR || tmpdir(),
  };
}

export function apply(ctx: Context): void {
  const config = readConfig();
  const logger = ctx.logger(name);

  const run = (reason: string) => {
    try {
      const report = sweep(config);
      // 没东西可报就沉默：一个每次冒"无事发生"的插件会被立刻静音掉，
      // 而真正该看见的错误也会一起被忽略。
      if (report.roots.length === 0 && report.errors.length === 0) return;
      logger.info(`${reason}: ${formatReport(report)}`);
    } catch (error: unknown) {
      // sweep 内部已逐条收纳失败；走到这里说明是它自己的意外。
      // 清扫失败不该变成插件纤维的崩溃 —— 它删的是可选的恢复产物，不是执行前提。
      logger.warn(`spill 清扫（${reason}）抛出：${String(error)}`);
    }
  };

  // ctx.effect 是 cordis 核心能力（Fiber 混入，见 cordis/lib/types/fiber.d.ts 的
  // `interface Context extends Pick<Fiber,'effect'>`）。刻意**不用** ctx.interval：
  // 那个方法来自 cordis-plugin-timer 的 declaration merging，而本包的
  // peerDependencies 里没有它 —— 虽然 base bundle 装了，但依赖一个未声明的
  // 运行时提供的方法会让本包在少了它的宿主上直接抛 TypeError。
  // 返回的 disposer 由 fiber 在卸载时执行，两个计时器都跟着上下文走。
  ctx.effect(() => {
    const first = setTimeout(() => run('首轮'), config.firstDelayMs);
    const repeat = setInterval(() => run('周期'), config.intervalMs);
    logger.info(
      `已装载：root=${config.tmpDir} 保留=${config.maxAgeDays}天 周期=${config.intervalMs}ms ` +
        `首轮延时=${config.firstDelayMs}ms 模式=${config.dryRun ? 'dry-run' : 'apply'}`,
    );
    return () => {
      clearTimeout(first);
      clearInterval(repeat);
    };
  }, `${name}: sweep schedule`);
}

function positiveNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isTruthy(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const value = raw.trim().toLowerCase();
  return value !== '' && value !== '0' && value !== 'false' && value !== 'no';
}
