// CLI：不装插件也能手动跑一轮清扫。
//
// 对一个会删文件的工具，把「看」和「删」分开是默认值而不是选项：
// 不带 --apply 时永远只报告。

import { parseArgs } from 'node:util';
import { tmpdir } from 'node:os';
import { formatReport, sweep } from './sweep.js';
import type { SweepReport } from './types.js';

const HELP = `dsh-spill-hygiene — 回收 dsh 子进程 spill 残留（审计发现 F-1）

用法：
  dsh-spill-hygiene                 只报告，不删除（默认）
  dsh-spill-hygiene --apply         真的删除判定为 expired 的文件
  dsh-spill-hygiene --json          机器可读输出（仍受 --apply 约束）

选项：
  --max-age-days <n>   保留天数，默认 30（与 dsh 自家 spill 清理对齐）
  --tmp-dir <path>     扫描根，默认操作系统 tmpdir
  --help               显示本帮助

安全边界（写死在代码里，无开关）：
  · 只进入名字精确匹配 dsh-subprocess-XXXXXX（6 位 base62）的目录
  · 只删名字精确匹配 dsh-subprocess-<pid>-<n>-<12hex>-(stdout|stderr).log 的普通文件
  · 文件名里的 pid 仍存活 ⇒ 不删，无论多老
  · 符号链接不跟随；裸 dsh-* / dsh-shell-* / dsh-subprocess-launch-* 一律不动
    （sandbox-local 用裸 dsh- 前缀创建活跃沙箱工作区）
`;

export function run(argv: string[]): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        apply: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        'max-age-days': { type: 'string' },
        'tmp-dir': { type: 'string' },
        help: { type: 'boolean', default: false },
      },
      allowPositionals: true,
    });
  } catch (error: unknown) {
    process.stderr.write(`${String(error)}\n\n${HELP}`);
    return 2;
  }

  const { values } = parsed;
  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const maxAgeDays = Number(values['max-age-days'] ?? 30);
  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0) {
    process.stderr.write(`--max-age-days 需要一个非负数字，收到：${values['max-age-days']}\n`);
    return 2;
  }

  const report: SweepReport = sweep({
    tmpDir: values['tmp-dir'] ?? tmpdir(),
    maxAgeDays,
    dryRun: !values.apply,
  });

  if (values.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else process.stdout.write(formatReport(report) + '\n');

  // 有错误就非零退出：脚本化的清理调度需要知道这一轮没干净跑完。
  return report.errors.length > 0 ? 1 : 0;
}
