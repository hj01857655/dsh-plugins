// 端到端回归：装载编译产物 lib/index.js，用真实 cordis Context 复刻 registry 的两处
// 派发，确认记录真的落盘、聚合真的算得对。
//
// 这条测试存在的理由：0.6.0 之前插件有完整的存储/聚合/面板管道，却一个 ctx.on 都没有，
// 没有任何东西喂 record()；而原有单元测试全在直接调 aggregate()，所以这个缺陷测不出来。
// 这里守的是**接线本身** —— 谁把 apply() 里的订阅删掉，这条就红。
//
// 派发形式照抄 core/tools/src/index.ts:1512-1516（waterfall）与 :1711-1713（dispatch）。
// carrier 手工构造：scopeTarget 的 filter 对 scopeOf(ctx) === undefined 直接放行
// （core/scope/src/index.ts:176），而插件的 ctx 正是 untagged。已在用户实际安装的
// 官方 cordis 4.0.4 + dsh-scope 0.2.0-rc.2 上实测过「agent-scoped 发射 ⇒ 插件 ctx 收到」，
// 这里复现的是该事实，不重新实现 dsh-scope 的过滤逻辑。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { apply, name } from '../lib/index.js';

const FILTER = Context.filter;

/** untagged 订阅者全放行的 carrier，对应 registry 发射时插件 ctx 可见的那一面。 */
function carrier() {
  return { [FILTER]: () => true };
}

/**
 * 复刻 registry 的一次调用：pre-execute waterfall → 冻结 → tools/result dispatch。
 * @param start - false 表示没有 pre-execute 起点（早于插件装载，或执行前就被取消）。
 */
async function dispatchCall(ctx, exec, result, { gapMs = 0, start = true } = {}) {
  if (start) {
    await ctx.waterfall(carrier(), 'tools/pre-execute', exec, () => Promise.resolve({ kind: 'allow' }));
    if (gapMs) await new Promise((resolve) => setTimeout(resolve, gapMs));
  }
  Object.freeze(exec); // notifyResult:1706 —— 冻结发生在发给观察者之前，引用不变
  const callbacks = ctx.events.dispatch('emit', [carrier(), 'tools/result', exec, result]);
  for (const callback of callbacks) callback(exec, result);
}

const textResult = (text) => ({ isError: false, content: text ? [{ type: 'text', text }] : [] });
const errorResult = (message) => ({ isError: true, error: { message }, content: [] });

/**
 * apply() 用 process.cwd() 作为数据根，所以必须在临时工作区内装载，否则 .toolstats/
 * 会写进包目录。node --test 为每个文件起独立进程，此处的 chdir 不外溢。
 */
async function inSandbox(run) {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-tool-stats-e2e-'));
  const previous = process.cwd();
  process.chdir(sandbox);
  try {
    return await run(sandbox);
  } finally {
    process.chdir(previous); // 目录仍是 cwd 时 Windows 拒绝删除（EPERM）
    rmSync(sandbox, { recursive: true, force: true });
  }
}

const readCalls = (sandbox) =>
  readFileSync(join(sandbox, '.toolstats', 'calls.jsonl'), 'utf8')
    .trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));

test('apply() 把调用记进落盘存储，并正确配对计时', async () => {
  await inSandbox(async (sandbox) => {
    const ctx = new Context();
    const fiber = await ctx.plugin({ name, apply });
    const service = ctx.get('toolStats');
    assert.equal(typeof service?.record, 'function', 'toolStats 服务应已 provide');

    const agent = { id: 'sess-1' };
    const other = { id: 'sess-2' };

    await dispatchCall(ctx, { name: 'read', agent, callId: 'c1' }, textResult('hello 世界'), { gapMs: 30 });
    await dispatchCall(ctx, { name: 'bash', agent, callId: 'c2' }, errorResult('exit 2'), { gapMs: 30 });
    await dispatchCall(ctx, { name: 'write', agent: other, callId: 'c3' }, textResult(''), { gapMs: 30 });
    await dispatchCall(ctx, { name: 'grep', agent, callId: 'c4' }, textResult(''), { start: false });

    const lines = readCalls(sandbox);
    assert.equal(lines.length, 4, '四条调用都应落盘');
    assert.deepEqual(lines.map((l) => l.tool), ['read', 'bash', 'write', 'grep']);

    // 会话键：Agent.id 与所属 session 共用身份。
    assert.deepEqual([...new Set(lines.map((l) => l.sessionId))].sort(), ['sess-1', 'sess-2']);

    // 失败率不漏计：deny / cancel / 执行失败都汇入同一个 tools/result。
    assert.equal(lines.filter((l) => !l.success).length, 1);
    assert.equal(lines.find((l) => l.tool === 'bash').errorMessage, 'exit 2');

    // 计时窗口真实覆盖 pre-execute → result。
    const read = lines.find((l) => l.tool === 'read');
    assert.equal(read.untimed, undefined, '有起点就不应标 untimed');
    assert.ok(read.latencyMs >= 20 && read.latencyMs < 1000, `latencyMs=${read.latencyMs} 应≈30`);

    // 没有起点 ⇒ 标 untimed、latency 占位 0，绝不伪造数字。
    const grep = lines.find((l) => l.tool === 'grep');
    assert.equal(grep.untimed, true);
    assert.equal(grep.latencyMs, 0);

    // 字节数按 UTF-8 精确计（中文 2×3 + 'hello ' 6 = 12）。
    assert.equal(read.contentBytes, new TextEncoder().encode('hello 世界').byteLength);

    // 聚合：untimed 不进百分位，timedInvocations 报告真实样本数。
    const summary = service.summary(['never_called_tool']);
    assert.equal(summary.tools.find((t) => t.tool === 'grep').timedInvocations, 0);
    assert.equal(summary.tools.find((t) => t.tool === 'grep').p50Latency, 0);
    assert.equal(summary.tools.find((t) => t.tool === 'read').timedInvocations, 1);
    assert.equal(summary.overview.totalCalls, 4);
    assert.equal(summary.overview.totalFailures, 1);
    assert.equal(summary.overview.activeSessions, 2);
    assert.ok(summary.deadTools.some((d) => d.tool === 'never_called_tool'), '配置但未调用的工具应进 deadTools');
    assert.equal(service.exportCSV().split('\n').length, 5, 'CSV = 表头 + 4 条');

    await fiber.dispose();
  });
});

test('起点表按 apply() 实例隔离，不跨装载实例泄漏', async () => {
  await inSandbox(async (sandbox) => {
    const first = await new Context().plugin({ name, apply });
    const exec = { name: 'read', agent: { id: 's' }, callId: 'c' };
    // 只在第一个实例的链路上记起点
    await first.ctx.waterfall(carrier(), 'tools/pre-execute', exec, () => Promise.resolve({ kind: 'allow' }));
    Object.freeze(exec);
    for (const cb of first.ctx.events.dispatch('emit', [carrier(), 'tools/result', exec, textResult('a')])) cb(exec, textResult('a'));
    await first.dispose();

    const second = await new Context().plugin({ name, apply });
    // 只发终态、不发 pre-execute：若起点表是模块级共享的，这里会命中上一个实例
    // 为同一个 exec 记下的起点，从而「计到了」——那正是本条要排除的泄漏。
    await dispatchCall(second.ctx, exec, textResult('b'), { start: false });
    const lines = readCalls(sandbox);
    assert.equal(lines.length, 2);
    assert.equal(lines.at(-1).untimed, true, '第二个实例不应看见第一个实例记下的起点');
    await second.dispose();
  });
});
