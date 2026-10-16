// 采集层测试：计时配对、untimed 标记、字节计数、会话键。
// 这些断言对应两条对运行时的前提（在官方 cordis 4.0.4 / dsh-scope 0.2.0-rc.2 上实测过）：
//   1. tools/result 的 exec 与 pre-execute 的 exec 是同一对象引用（freeze 不改引用），
//      所以 WeakMap 计时命中；引用一变（浅拷贝）就必须失配并标 untimed。
//   2. 找不到起点时 latencyMs=0 只是占位，靠 untimed 标记从百分位里剔除。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CallTimer, sessionIdOf } from '../lib/collect.js';
import { aggregate } from '../lib/analyzer.js';

const result = (over = {}) => ({ isError: false, content: [], ...over });

test('sessionIdOf: 取 agent.id，缺失时回落 unknown', () => {
  assert.equal(sessionIdOf({ agent: { id: 'sess-1' } }), 'sess-1');
  assert.equal(sessionIdOf({}), 'unknown');
  assert.equal(sessionIdOf({ agent: undefined }), 'unknown');
});

test('settle: 有起点时计时成功且不标 untimed', () => {
  const timer = new CallTimer();
  const exec = { name: 'bash', agent: { id: 's1' } };
  timer.start(exec);
  const call = timer.settle(exec, result());
  assert.equal(call.tool, 'bash');
  assert.equal(call.sessionId, 's1');
  assert.equal(call.success, true);
  assert.equal(call.untimed, undefined);
  assert.ok(Number.isInteger(call.latencyMs) && call.latencyMs >= 0);
});

test('settle: 无起点标 untimed 且不伪造延迟', () => {
  const timer = new CallTimer();
  const call = timer.settle({ name: 'read', agent: { id: 's1' } }, result());
  assert.equal(call.untimed, true);
  assert.equal(call.latencyMs, 0);
});

test('settle: 键是对象引用 —— 浅拷贝后读不到起点', () => {
  // 若哪天 registry 在 pre-execute 与 result 之间换了对象引用，这里会失败，
  // 提醒计时前提已不成立（而不是悄悄记下一条 0ms 的假数据）。
  const timer = new CallTimer();
  const exec = { name: 'write', agent: { id: 's1' } };
  timer.start(exec);
  assert.equal(timer.settle({ ...exec }, result()).untimed, true);
  assert.equal(timer.settle(exec, result()).untimed, undefined);
});

test('settle: freeze 后的同一对象仍命中起点', () => {
  const timer = new CallTimer();
  const exec = { name: 'grep', agent: { id: 's1' } };
  timer.start(exec);
  assert.equal(timer.settle(Object.freeze(exec), result()).untimed, undefined);
});

test('settle: 失败结果带 errorMessage', () => {
  const timer = new CallTimer();
  const call = timer.settle({ name: 'bash', agent: { id: 's1' } }, result({ isError: true, error: { message: 'exit 2' } }));
  assert.equal(call.success, false);
  assert.equal(call.errorMessage, 'exit 2');
});

test('contentBytes: text/reasoning 按 UTF-8 计，image 取 attachment.bytes', () => {
  const timer = new CallTimer();
  const exec = { name: 'read', agent: { id: 's1' } };
  const bytes = timer.settle(exec, result({
    content: [
      { type: 'text', text: '中文a' },   // 中文×2=6 + 'a'=1 => 7
      { type: 'reasoning', text: 'ab' },  // 2
      { type: 'image', attachment: { bytes: 100 } },
    ],
  })).contentBytes;
  assert.equal(bytes, 109);
});

test('contentBytes: 未知 ContentBlock 变体不计（宁少计不猜字段）', () => {
  const timer = new CallTimer();
  const call = timer.settle({ name: 'read', agent: { id: 's1' } }, result({
    content: [{ type: 'file', data: 'x'.repeat(500) }],
  }));
  assert.equal(call.contentBytes, undefined); // 0 字节时不写字段
});

test('空结果不写 contentBytes 字段', () => {
  const timer = new CallTimer();
  assert.equal(timer.settle({ name: 'x', agent: { id: 's1' } }, result()).contentBytes, undefined);
});

test('aggregate: untimed 样本不进百分位，且只由 timedInvocations 计数', () => {
  const timed = (tool, latencyMs) => ({ tool, timestamp: 1, success: true, latencyMs, sessionId: 's1' });
  const untimed = (tool) => ({ tool, timestamp: 1, success: true, latencyMs: 0, sessionId: 's1', untimed: true });
  const m = aggregate([timed('bash', 100), timed('bash', 200), untimed('bash'), untimed('bash')]);
  const bash = m.get('bash');
  assert.equal(bash.invocations, 4);
  assert.equal(bash.timedInvocations, 2);
  // 若 untimed 的占位 0 混进样本，p50 会被拉到 0 —— 这正是这条断言守的坑。
  assert.equal(bash.p50Latency, 100);
  assert.equal(bash.p95Latency, 200);
});

test('aggregate: 全部 untimed 时百分位为 0 而不是假的速度', () => {
  const m = aggregate([
    { tool: 't', timestamp: 1, success: true, latencyMs: 0, sessionId: 's1', untimed: true },
  ]);
  assert.equal(m.get('t').timedInvocations, 0);
  assert.equal(m.get('t').p50Latency, 0);
  assert.equal(m.get('t').p95Latency, 0);
});
