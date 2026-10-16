// 端到端回归：把编译产物 lib/index.js 装进真实 cordis Context，验证**接线本身**。
//
// 这条测试存在的理由：sweep 的单元测试全在直接调 sweep()，所以「apply() 到底有没有
// 去调 sweep」这件事测不出来。这里断言的是装载 → 计时器 → 落盘删除这条完整链路，
// 以及 dispose 之后不再有下一轮 —— 谁把 ctx.effect 那段删掉，本文件就红。
//
// 关键前提都来自实测，不靠猜：
//   · ctx.effect 是 cordis 核心（fiber.d.ts: `interface Context extends Pick<Fiber,'effect'>`），
//     所以本包不依赖 cordis-plugin-timer 的 ctx.interval。
//   · Windows 上进程退出后 pid 会被复用 ⇒ 单测里的"已死 pid"在真实装载里不可信，
//     故端到端只用**本进程自己的 pid**（必活）与**越界 pid**（必不存在）两种确定形态。
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { apply, name, readConfig } from '../lib/index.js';

const DAY = 86_400_000;
/** 越界 pid：Windows 的 pid 是 MAX_PID 以内的偶数，这个值必不存在 ⇒ 判死可信。 */
const DEAD_PID = 2_147_483_646;

const sandboxes = [];

after(() => {
  process.chdir(process.env.TEMP ?? tmpdir());
  for (const path of sandboxes) rmSync(path, { recursive: true, force: true });
});

function sandboxWithExpiredSpill() {
  const sandbox = mkdtempSync(join(tmpdir(), 'dsh-spill-hygiene-e2e-'));
  sandboxes.push(sandbox);
  const root = join(sandbox, 'dsh-subprocess-ab12CD');
  mkdirSync(root);
  const file = join(root, `dsh-subprocess-${DEAD_PID}-1-3a0a25abb22c-stderr.log`);
  writeFileSync(file, Buffer.alloc(2048, 0x62));
  const old = (Date.now() - 60 * DAY) / 1000;
  utimesSync(file, old, old);
  return { sandbox, root, file };
}

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('默认配置是 dry-run：不设 APPLY 就没有删除能力', () => {
  assert.equal(readConfig({}).dryRun, true);
  assert.equal(readConfig({ DSH_SPILL_HYGIENE_APPLY: '1' }).dryRun, false);
  assert.equal(readConfig({ DSH_SPILL_HYGIENE_APPLY: '0' }).dryRun, true);
  assert.equal(readConfig({ DSH_SPILL_HYGIENE_APPLY: 'yes' }).dryRun, false);
  // 一个会删文件的工具，删除能力必须是显式授予的。
  assert.equal(readConfig({}).maxAgeDays, 30, '默认保留天数应与 dsh 自家 cleanupPeriodDays 一致');
});

test('环境变量读成垃圾值时退回默认，而不是变成"全删"', () => {
  const config = readConfig({ DSH_SPILL_HYGIENE_MAX_AGE_DAYS: 'abc', DSH_SPILL_HYGIENE_INTERVAL_MS: '-5' });
  assert.equal(config.maxAgeDays, 30);
  assert.ok(config.intervalMs > 0);
  assert.equal(Number.isFinite(config.maxAgeDays), true);
});

test('装载后自动清扫：apply 模式下超期 spill 真的从盘上消失', async () => {
  const { sandbox, file } = sandboxWithExpiredSpill();
  const ctx = new Context();
  const previousEnv = { ...process.env };
  process.env.DSH_SPILL_HYGIENE_TMP_DIR = sandbox;
  process.env.DSH_SPILL_HYGIENE_APPLY = '1';
  process.env.DSH_SPILL_HYGIENE_FIRST_DELAY_MS = '5';
  process.env.DSH_SPILL_HYGIENE_INTERVAL_MS = String(24 * 60 * 60 * 1000); // 本测试内不重复

  const fiber = await ctx.plugin({ name, apply });
  try {
    assert.ok(statSync(file).isFile(), '起点：文件应在');
    await settle(120);
    assert.throws(() => statSync(file), { code: 'ENOENT' }, '装载后应被真实删除');
    // 根被清空后应被 rmdir —— 证明走的是 sweep 的 prune 分支而不是我的手工 unlink。
    assert.throws(() => statSync(join(sandbox, 'dsh-subprocess-ab12CD')), { code: 'ENOENT' });
  } finally {
    await fiber.dispose();
    Object.assign(process.env, previousEnv);
    for (const key of ['DSH_SPILL_HYGIENE_TMP_DIR', 'DSH_SPILL_HYGIENE_APPLY', 'DSH_SPILL_HYGIENE_FIRST_DELAY_MS', 'DSH_SPILL_HYGIENE_INTERVAL_MS']) {
      delete process.env[key];
    }
  }
});

test('默认 dry-run 装载：同样的文件一个字节都不动', async () => {
  const { sandbox, file } = sandboxWithExpiredSpill();
  const before = statSync(file).size;
  const ctx = new Context();
  process.env.DSH_SPILL_HYGIENE_TMP_DIR = sandbox;
  process.env.DSH_SPILL_HYGIENE_FIRST_DELAY_MS = '5';
  process.env.DSH_SPILL_HYGIENE_INTERVAL_MS = String(24 * 60 * 60 * 1000);
  delete process.env.DSH_SPILL_HYGIENE_APPLY;

  const fiber = await ctx.plugin({ name, apply });
  try {
    await settle(120);
    assert.equal(statSync(file).size, before, 'dry-run 装载不该删任何东西');
    assert.ok(statSync(join(sandbox, 'dsh-subprocess-ab12CD')).isDirectory(), 'dry-run 也不该 prune 目录');
  } finally {
    await fiber.dispose();
    delete process.env.DSH_SPILL_HYGIENE_TMP_DIR;
    delete process.env.DSH_SPILL_HYGIENE_FIRST_DELAY_MS;
    delete process.env.DSH_SPILL_HYGIENE_INTERVAL_MS;
  }
});

test('dispose 停掉计时器：卸载后不再有新一轮删除', async () => {
  const { sandbox, file } = sandboxWithExpiredSpill();
  const ctx = new Context();
  process.env.DSH_SPILL_HYGIENE_TMP_DIR = sandbox;
  process.env.DSH_SPILL_HYGIENE_APPLY = '1';
  // 首轮推后到 50ms，然后在 10ms 就卸载：若 ctx.effect 的 disposer 没清掉 setTimeout，
  // 这一轮会在插件已经不存在之后再去删文件。
  process.env.DSH_SPILL_HYGIENE_FIRST_DELAY_MS = '50';
  process.env.DSH_SPILL_HYGIENE_INTERVAL_MS = String(24 * 60 * 60 * 1000);

  const fiber = await ctx.plugin({ name, apply });
  await settle(10);
  await fiber.dispose();
  await settle(200);
  try {
    assert.ok(statSync(file).isFile(), '卸载后不该发生删除');
  } finally {
    delete process.env.DSH_SPILL_HYGIENE_TMP_DIR;
    delete process.env.DSH_SPILL_HYGIENE_APPLY;
    delete process.env.DSH_SPILL_HYGIENE_FIRST_DELAY_MS;
    delete process.env.DSH_SPILL_HYGIENE_INTERVAL_MS;
  }
});

test('扫描根不可读时不崩：插件纤维保持存活', async () => {
  const ctx = new Context();
  process.env.DSH_SPILL_HYGIENE_TMP_DIR = join(tmpdir(), 'dsh-spill-hygiene-no-such-dir');
  process.env.DSH_SPILL_HYGIENE_FIRST_DELAY_MS = '5';
  process.env.DSH_SPILL_HYGIENE_INTERVAL_MS = String(24 * 60 * 60 * 1000);

  const fiber = await ctx.plugin({ name, apply });
  try {
    await settle(120);
    // 纤维没被清扫失败拖崩：仍能正常 provide 服务、仍能 dispose。
    assert.equal(typeof fiber.dispose, 'function');
    assert.equal(readdirSync(tmpdir()).includes('dsh-spill-hygiene-no-such-dir'), false);
  } finally {
    await fiber.dispose();
    delete process.env.DSH_SPILL_HYGIENE_TMP_DIR;
    delete process.env.DSH_SPILL_HYGIENE_FIRST_DELAY_MS;
    delete process.env.DSH_SPILL_HYGIENE_INTERVAL_MS;
  }
});
