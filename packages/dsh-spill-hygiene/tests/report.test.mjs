// 报告文本与 JSON 形状的一致性测试。
//
// formatReport 是用户唯一看得见的产物，而它有一处**刻意的语义分叉**：dry-run 下
// expired 条目落在 retained 里（因为确实没删），apply 下才落在 removed 里。
// 这个分叉如果处理错，报告就会谎报战果或谎报保留数，所以逐条测。
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { formatReport, sweep } from '../lib/sweep.js';

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;
const DEAD_PID = 2_147_483_646;

const dirs = [];
after(() => {
  process.chdir(process.env.TEMP ?? tmpdir());
  for (const path of dirs) rmSync(path, { recursive: true, force: true });
});

function sandbox() {
  const path = mkdtempSync(join(tmpdir(), 'dsh-spill-hygiene-report-'));
  dirs.push(path);
  return path;
}

function put(dir, rootName, fileName, bytes, ageDays, rootAgeDays = null) {
  const root = join(dir, rootName);
  mkdirSync(root, { recursive: true });
  if (rootAgeDays !== null) {
    const rt = (NOW - rootAgeDays * DAY) / 1000;
    utimesSync(root, rt, rt);
  }
  if (fileName === null) return; // 只要空根
  const file = join(root, fileName);
  writeFileSync(file, Buffer.alloc(bytes, 0x63));
  const t = (NOW - ageDays * DAY) / 1000;
  utimesSync(file, t, t);
}

function run(dir, { maxAgeDays = 30, dryRun = true } = {}) {
  return sweep({ tmpDir: dir, maxAgeDays, dryRun, now: NOW });
}

const spill = (pid, label = 'stderr', n = 1, hex = '3a0a25abb22c') =>
  `dsh-subprocess-${pid}-${n}-${hex}-${label}.log`;

describe('候选与已删：不许双计或漏计', () => {
  it('dry-run：候选数来自 retained 里的 expired，removed 恒空', () => {
    const dir = sandbox();
    put(dir, 'dsh-subprocess-a11a11', spill(DEAD_PID), 502, 40);
    const report = run(dir, { dryRun: true });
    assert.equal(report.removed.length, 0, 'removed 只能表示"真的删掉了"');
    assert.equal(report.reclaimedBytes, 0, 'dry-run 不该有回收字节数');
    const text = formatReport(report);
    assert.match(text, /候选 1 个/, text);
    assert.match(text, /保留 0 个/, 'expired 是候选，不该同时算进"保留"');
  });

  it('apply：已删数来自 removed，保留数不含它', () => {
    const dir = sandbox();
    put(dir, 'dsh-subprocess-a22a22', spill(DEAD_PID), 502, 40);
    put(dir, 'dsh-subprocess-a22a22', spill(DEAD_PID, 'stdout', 2), 10, 5);
    const report = run(dir, { dryRun: false });
    assert.equal(report.removed.length, 1);
    const text = formatReport(report);
    assert.match(text, /已删 1 个/);
    assert.match(text, /保留 1 个/, '只有 too-young 那条算保留');
  });

  it('removed 里的条目 verdict 必是 expired（JSON 消费方的唯一契约）', () => {
    const dir = sandbox();
    put(dir, 'dsh-subprocess-a33a33', spill(DEAD_PID), 502, 40);
    put(dir, 'dsh-subprocess-a33a33', spill(process.pid), 502, 40); // 活的：不该进 removed
    const report = run(dir, { dryRun: false });
    assert.equal(report.removed.length, 1);
    for (const entry of report.removed) assert.equal(entry.verdict, 'expired');
    // 活的留在 retained 里，且带真实原因
    assert.equal(report.retained[0].verdict, 'active-pid');
    // apply 模式下 retained 只含"真留着"的，不含 expired
    assert.ok(report.retained.every((entry) => entry.verdict !== 'expired'));
  });
});

describe('字节单位', () => {
  it('小于 1 KiB 用 B，不显示 0.00 MB', () => {
    const dir = sandbox();
    put(dir, 'dsh-subprocess-a44a44', spill(DEAD_PID), 502, 40);
    const text = formatReport(run(dir, { dryRun: false }));
    assert.match(text, /502 B/);
    assert.doesNotMatch(text, /0\.00 MB/);
  });

  it('跨单位：KiB / MiB 各按其位', () => {
    const dir = sandbox();
    put(dir, 'dsh-subprocess-a55a55', spill(DEAD_PID, 'stdout', 1, 'a1a1a1a1a1a1'), 2048, 40);
    put(dir, 'dsh-subprocess-a55a55', spill(DEAD_PID, 'stderr', 2, 'b2b2b2b2b2b2'), 3 * 1048576, 40);
    const text = formatReport(run(dir, { dryRun: false }));
    assert.match(text, /2\.00 KiB/);
    assert.match(text, /3\.00 MiB/);
    assert.match(text, /3\.00 MiB/, '汇总行同样用 MiB');
  });
});

describe('pid 显示：区分"死了"与"没解析出来"', () => {
  it('无 pid 的陌生条目显示 pid=-，不冒充 (dead)', () => {
    const dir = sandbox();
    put(dir, 'dsh-subprocess-a66a66', 'stdout-27000.log', 31, 40);
    const text = formatReport(run(dir));
    assert.match(text, /pid=-/, text);
    assert.doesNotMatch(text, /pid=\?/, '问号那版会让人以为解析失败但进程已知');
    assert.match(text, /⇒ unrecognized-name/);
  });

  it('有 pid 且已死 ⇒ (dead)；有 pid 且活着 ⇒ (alive)', () => {
    const dir = sandbox();
    put(dir, 'dsh-subprocess-a77a77', spill(DEAD_PID, 'stdout', 1, 'c3c3c3c3c3c3'), 10, 5);
    put(dir, 'dsh-subprocess-a77a77', spill(process.pid, 'stderr', 2, 'd4d4d4d4d4d4'), 10, 5);
    const text = formatReport(run(dir));
    assert.match(text, /pid=2147483646\(dead\)/);
    assert.match(text, new RegExp(`pid=${process.pid}\\(alive\\)`));
  });
});

describe('空目录文案必须与实际去留一致', () => {
  it('dry-run：说"apply 且超过阈值时会被 rmdir"，不说会删', () => {
    const dir = sandbox();
    put(dir, 'dsh-subprocess-a88a88', null, 0, 0, 40);
    const text = formatReport(run(dir, { dryRun: true }));
    assert.match(text, /空目录，自身 40\.0d —— apply 且超过 30d 时会被 rmdir/);
    assert.equal(run(dir, { dryRun: true }).prunedDirs.length, 0);
  });

  it('apply + 够老：文案说"回收"，且 prunedDirs 真的收了它', () => {
    const dir = sandbox();
    put(dir, 'dsh-subprocess-a99a99', null, 0, 0, 40);
    const report = run(dir, { dryRun: false });
    assert.match(formatReport(report), /空目录，自身 40\.0d ⇒ 超期空壳，回收/);
    assert.equal(report.prunedDirs.length, 1);
  });

  it('apply + 不够老：文案说"保留"，且目录还在', () => {
    const dir = sandbox();
    put(dir, 'dsh-subprocess-b00b00', null, 0, 0, 17);
    const report = run(dir, { dryRun: false });
    assert.match(formatReport(report), /空目录，自身 17\.0d ⇒ 未超期，保留/);
    assert.equal(report.prunedDirs.length, 0);
    assert.ok(report.roots[0].rootAgeDays > 16 && report.roots[0].rootAgeDays < 18);
  });

  it('文案分支与实际 prune 决定不会各说一套（变异守点）', () => {
    // 同一个沙箱里放一个够老空壳 + 一个不够老空壳：文案必须一条"回收"一条"保留"，
    // 而 prunedDirs 恰好在"回收"那条上。二者错位就说明 formatter 与 sweep 用了
    // 两套判定 —— 那正是报告最容易骗人的地方。
    const dir = sandbox();
    put(dir, 'dsh-subprocess-b11b11', null, 0, 0, 40);
    put(dir, 'dsh-subprocess-b22b22', null, 0, 0, 10);
    const report = run(dir, { dryRun: false });
    const text = formatReport(report);
    const pruned = report.prunedDirs.map((p) => p.split(/[\\/]/).pop()).sort();
    assert.deepEqual(pruned, ['dsh-subprocess-b11b11']);
    assert.match(text, /dsh-subprocess-b11b11\n  \(空目录，自身 40\.0d ⇒ 超期空壳，回收\)/);
    assert.match(text, /dsh-subprocess-b22b22\n  \(空目录，自身 10\.0d ⇒ 未超期，保留\)/);
    assert.equal(report.prunedDirs.length, 1);
  });
});

describe('提示行与无根情况', () => {
  it('dry-run 有候选才提示 --apply；apply 模式永不提示', () => {
    const withCandidate = sandbox();
    put(withCandidate, 'dsh-subprocess-b33b33', spill(DEAD_PID), 10, 40);
    assert.match(formatReport(run(withCandidate, { dryRun: true })), /确认后用 --apply/);
    assert.doesNotMatch(formatReport(run(withCandidate, { dryRun: false })), /确认后用 --apply/);

    const noCandidate = sandbox();
    put(noCandidate, 'dsh-subprocess-b44b44', spill(DEAD_PID), 10, 5);
    assert.doesNotMatch(formatReport(run(noCandidate, { dryRun: true })), /确认后用 --apply/, '没有候选就不该催着删');
  });

  it('一个 spill 根都没有时，报告说明看见了但不动多少邻居', () => {
    const dir = sandbox();
    mkdirSync(join(dir, 'dsh-some-scratch'), { recursive: true });
    mkdirSync(join(dir, 'not-dsh-at-all'), { recursive: true });
    const text = formatReport(run(dir));
    assert.match(text, /未发现 spill 根；看见但不动的 dsh-\* 邻居 1 个/);
  });

  it('有错误时逐条列出，且计数与 errors 长度一致', () => {
    const dir = sandbox();
    const report = run(join(dir, 'missing'));
    assert.equal(report.errors.length, 1);
    const text = formatReport(report);
    assert.match(text, /错误 1 条/);
    assert.match(text, /! readdir/);
  });
});
