import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, linkSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import { isPidAlive, sweep } from '../lib/sweep.js';

/** 一个绝对不会存在的 pid：Windows 的 pid 上限远低于它，process.kill(pid,0) 必返 ESRCH。 */
const DEAD_PID = 2_147_483_646;
/** 本进程自己的 pid —— 一定存活。 */
const ALIVE_PID = process.pid;

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

function spillName(pid, label = 'stderr', n = 1, hex = '3a0a25abb22c') {
  return `dsh-subprocess-${pid}-${n}-${hex}-${label}.log`;
}

/**
 * 隔离沙箱：在真实 tmpdir 下建一个**不匹配** spill 根形态的容器，容器里再放形态
 * 正确的 spill 根。于是 sweep 的 tmpDir 指到容器才看得见它们，而收尾删掉的也
 * 永远是容器本身 —— 不碰 %TEMP% 里真实的 dsh-subprocess-* 目录。
 */
const sandboxes = [];
let sandbox = '';

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'dsh-spill-hygiene-test-'));
  sandboxes.push(sandbox);
});

after(() => {
  // Windows：目录作为 cwd 时 rmSync 抛 EPERM，先离开。
  // 只删自己 mkdtempSync 出来的路径。
  process.chdir(process.env.TEMP ?? tmpdir());
  for (const path of sandboxes) rmSync(path, { recursive: true, force: true });
});

function makeRoot(name) {
  const root = join(sandbox, name);
  mkdirSync(root, { recursive: true });
  return root;
}

/**
 * 建一个 mtime 为 ageDays 之前的 spill 根。
 * 基准必须是注入的 `NOW` 而不是 `Date.now()`：`NOW` 早于真实当前时刻，
 * 用真实时钟设 mtime 会算出**负年龄**，"(b) 空壳回收"那组测试就会因为
 * 一个与产品逻辑无关的原因失败。
 */
function makeRootAged(name, ageDays) {
  const root = makeRoot(name);
  const t = (NOW - ageDays * DAY) / 1000;
  utimesSync(root, t, t);
  return root;
}

function makeFile(dir, name, bytes, ageDays) {
  const path = join(dir, name);
  writeFileSync(path, Buffer.alloc(bytes, 0x61));
  const t = (NOW - ageDays * DAY) / 1000;
  utimesSync(path, t, t);
  return path;
}

function sweepSandbox(maxAgeDays = 30, dryRun = true) {
  return sweep({ tmpDir: sandbox, maxAgeDays, dryRun, now: NOW });
}

describe('根识别：精确形态', () => {
  it('进入 dsh-subprocess-<6 位 base62> 形态的根', () => {
    const root = makeRoot('dsh-subprocess-abc123');
    const file = makeFile(root, spillName(DEAD_PID), 100, 40);
    const report = sweepSandbox(30, false);
    assert.equal(report.roots.length, 1);
    assert.equal(report.removed.length, 1);
    assert.throws(() => statSync(file), { code: 'ENOENT' });
  });

  it('相似前缀一律不动 —— 裸 dsh- 是活跃沙箱工作区', () => {
    // sandbox-local/src/index.ts:426 用 mkdtempSync(join(tmpdir(),'dsh-')) 建**活跃**工作区；
    // dsh-subprocess-launch-*（runner-protocol.ts:104）与 dsh-shell-*（shell-activity.ts:66）
    // 是另外的生命周期。这几个前缀高度相似，所以放进容器让 sweep 真看得见：
    // 匹配规则一旦写宽松，本测试必须变红。
    const neighbors = [
      'dsh-Zzzzzz', // 裸 dsh-：活跃沙箱工作区
      'dsh-subprocess-launch-Ab3dEf', // runner 启动目录（runner-protocol.ts:104 的真实形态）
      'dsh-subprocess-abcdefg', // 7 位，不精确
      'dsh-subprocess-abc-123', // 含连字符，不精确
      'dsh-spill-abc123', // 官方自己的 spill 根：归 30 天自家清理管
      'dsh-shell-abcdef',
    ];
    for (const name of neighbors) {
      const dir = makeRoot(name);
      // 故意在邻居里放"本包在自己根内会删"的形态：证明它们确实没被下钻。
      makeFile(dir, spillName(DEAD_PID), 10, 999);
      makeFile(dir, 'payload.txt', 10, 999);
    }
    const report = sweepSandbox(30, false);
    assert.equal(report.removed.length, 0);
    assert.equal(report.roots.length, 0);
    assert.equal(report.skippedRoots, neighbors.length);
    for (const name of neighbors) {
      assert.equal(readdirSync(join(sandbox, name)).length, 2, `${name} 内容被动过`);
    }
  });

  it('名字像 spill 根但不是目录时不进入，且报错', () => {
    writeFileSync(join(sandbox, 'dsh-subprocess-xyz789'), 'not a dir');
    const report = sweepSandbox(30, false);
    assert.equal(report.roots.length, 0);
    assert.equal(report.removed.length, 0);
    assert.equal(report.errors.length, 1);
    assert.match(report.errors[0], /不是真实目录/);
  });

  it('spill 根是指向别处的符号链接时不跟随', () => {
    // 攻击面：在 tmpdir 放一个名为 dsh-subprocess-lnk123 的链接指向 tmpdir 之外。
    // 跟随它 = 把清扫范围扩出 tmpdir。
    const target = makeRoot('real-target');
    const file = makeFile(target, spillName(DEAD_PID), 100, 999);
    const linkPath = join(sandbox, 'dsh-subprocess-lnk123');
    try {
      linkSync(target, linkPath);
    } catch {
      return; // 未开开发者模式的 Windows 建目录链接会 EPERM：环境限制，不算失败
    }
    const report = sweepSandbox(30, false);
    assert.equal(report.removed.length, 0);
    assert.ok(statSync(file), '链接目标内的文件被动过');
  });
});

describe('文件识别：只有真的 spill 文件才是候选', () => {
  it('删掉 pid 已死且超期的 spill', () => {
    const root = makeRoot('dsh-subprocess-aaa111');
    const file = makeFile(root, spillName(DEAD_PID), 4096, 31);
    const report = sweepSandbox(30, false);
    assert.equal(report.removed.length, 1);
    assert.equal(report.removed[0].verdict, 'expired');
    assert.equal(report.reclaimedBytes, 4096);
    assert.throws(() => statSync(file), { code: 'ENOENT' });
  });

  it('stdout / stderr 两种 label 都认', () => {
    const root = makeRoot('dsh-subprocess-aaa222');
    makeFile(root, spillName(DEAD_PID, 'stdout'), 10, 31);
    makeFile(root, spillName(DEAD_PID, 'stderr'), 10, 31);
    assert.equal(sweepSandbox(30, false).removed.length, 2);
  });

  it('认不出的文件名不删；但同根内合法的 expired 仍然回收', () => {
    // 策略：陌生条目让本根失去 prune 资格，但不吊销对已识别 spill 的回收。
    // 理由（本机实测）：%TEMP%\dsh-subprocess-gwKKWN 里就有我探针留下的陌生文件
    // stdout-27000.log —— 若陌生条目吊销整根，一个残留文件就永久废掉这个根。
    const root = makeRoot('dsh-subprocess-aaa333');
    const keep = makeFile(root, 'notes.txt', 10, 31);
    const badLabel = makeFile(root, spillName(DEAD_PID, 'trace'), 10, 31);
    const expired = makeFile(root, spillName(DEAD_PID), 10, 31);
    const report = sweepSandbox(30, false);
    assert.equal(report.removed.length, 1);
    assert.throws(() => statSync(expired), { code: 'ENOENT' });
    assert.ok(statSync(keep));
    assert.ok(statSync(badLabel));
    assert.equal(report.roots[0].hasUnrecognized, true);
    assert.equal(report.prunedDirs.length, 0);
  });

  it('子目录不算 spill，也不下钻', () => {
    const root = makeRoot('dsh-subprocess-aaa444');
    const sub = join(root, 'sub');
    mkdirSync(sub);
    const inside = makeFile(sub, spillName(DEAD_PID), 10, 999);
    const report = sweepSandbox(30, false);
    assert.equal(report.removed.length, 0);
    assert.equal(report.roots[0].entries[0].verdict, 'not-regular-file');
    assert.equal(report.roots[0].entries[0].sizeBytes, 0, '目录不该被计成可回收字节');
    assert.ok(statSync(inside));
  });
});

describe('存活判定：正在写的文件删不得', () => {
  it('pid 是本进程时，即使超期也不动', () => {
    const root = makeRoot('dsh-subprocess-aaa555');
    const file = makeFile(root, spillName(ALIVE_PID), 2048, 999);
    const report = sweepSandbox(30, false);
    assert.equal(report.removed.length, 0);
    assert.equal(report.retained[0].verdict, 'active-pid');
    assert.equal(report.retained[0].ownerAlive, true);
    assert.ok(statSync(file));
  });

  it('isPidAlive：自己的 pid 活，越界 pid 死', () => {
    assert.equal(isPidAlive(ALIVE_PID), true);
    assert.equal(isPidAlive(DEAD_PID), false);
  });

  it('先问存活再问年龄：同样超期，死的删、活的留', () => {
    const root = makeRoot('dsh-subprocess-aaa666');
    const alive = makeFile(root, spillName(ALIVE_PID), 10, 999);
    const dead = makeFile(root, spillName(DEAD_PID), 10, 999);
    const report = sweepSandbox(30, false);
    assert.equal(report.removed.length, 1);
    assert.ok(statSync(alive));
    assert.throws(() => statSync(dead), { code: 'ENOENT' });
  });

  it('同根内多个 pid 各自判定，互不牵连', () => {
    const root = makeRoot('dsh-subprocess-aaa999');
    // 同一宿主 pid 的多个 spill（spillCounter 递增）：pid 死了就该一起回收。
    makeFile(root, spillName(DEAD_PID, 'stdout', 1), 10, 31);
    makeFile(root, spillName(DEAD_PID, 'stderr', 2), 10, 31);
    makeFile(root, spillName(ALIVE_PID, 'stdout', 3), 10, 31);
    const report = sweepSandbox(30, false);
    assert.equal(report.removed.length, 2);
    assert.equal(report.retained.length, 1);
  });
});

describe('年龄阈值', () => {
  it('恰好等于 maxAge 的不动，超过才动', () => {
    const root = makeRoot('dsh-subprocess-aaa777');
    const edge = makeFile(root, spillName(DEAD_PID, 'stdout', 1, 'aaaaaaaaaaaa'), 10, 30);
    const over = makeFile(root, spillName(DEAD_PID, 'stdout', 2, 'bbbbbbbbbbbb'), 10, 30.5);
    const report = sweepSandbox(30, false);
    assert.equal(report.removed.length, 1);
    assert.ok(statSync(edge));
    assert.throws(() => statSync(over), { code: 'ENOENT' });
  });

  it('maxAgeDays=0 也不碰未来时间戳（时钟漂移 / NTP 回拨）', () => {
    const root = makeRoot('dsh-subprocess-aaa888');
    const future = makeFile(root, spillName(DEAD_PID, 'stdout', 1, 'cccccccccccc'), 10, -5);
    const report = sweep({ tmpDir: sandbox, maxAgeDays: 0, dryRun: false, now: NOW });
    assert.equal(report.removed.length, 0);
    assert.equal(report.retained[0].verdict, 'too-young');
    assert.ok(statSync(future));
  });

  it('dry-run 一个字节都不动', () => {
    const root = makeRoot('dsh-subprocess-bbb000');
    const file = makeFile(root, spillName(DEAD_PID), 10, 999);
    const report = sweepSandbox(30, true);
    assert.equal(report.removed.length, 0);
    assert.equal(report.reclaimedBytes, 0);
    assert.equal(report.prunedDirs.length, 0);
    assert.equal(report.retained.length, 1);
    assert.ok(statSync(file));
    assert.ok(statSync(root));
  });
});

describe('空目录回收', () => {
  it('路径 (a)：本轮清空了自己的 spill 根 ⇒ rmdir', () => {
    const root = makeRoot('dsh-subprocess-bbb111');
    makeFile(root, spillName(DEAD_PID), 10, 31);
    const report = sweepSandbox(30, false);
    assert.deepEqual(report.prunedDirs, [root]);
    assert.throws(() => statSync(root), { code: 'ENOENT' });
  });

  it('路径 (b)：目录自身超期的空壳被回收', () => {
    // 依据 %TEMP%\emptyrootmtime.mjs 实测的三条 Windows 目录 mtime 语义：
    //   ① 目录内新建/删除文件都会把目录 mtime 推到当下 ⇒ "空 + mtime 老" = 很久
    //      没有任何文件在这里进出过（活跃宿主的每次 spill 都会刷新它）；
    //   ② 只 stat/readdir 不刷新 mtime ⇒ 本包反复扫描不会把老空壳的 mtime 续命；
    //   ③ output.ts:31-40 逐字写明"外部清理器在目录为空时删掉它"是设计预期情况，
    //      spill open 失败会退化到内存尾。本机实测有 7 个这种空壳在积累。
    const root = makeRootAged('dsh-subprocess-bbb222', 40);
    const report = sweepSandbox(30, false);
    assert.deepEqual(report.prunedDirs, [root]);
    assert.throws(() => statSync(root), { code: 'ENOENT' });
  });

  it('目录 mtime 年轻的空根不 prune —— 那可能正是一条长命宿主的落点', () => {
    // 这条守的是 (b) 的闸门：mkdtempSync 刚建好、还没写过文件的活跃根，mtime 必然是新的。
    const root = makeRootAged('dsh-subprocess-bbb223', 0);
    const report = sweepSandbox(30, false);
    assert.equal(report.prunedDirs.length, 0);
    assert.ok(statSync(root).isDirectory());
  });

  it('空壳回收也受 maxAgeDays 约束：17 天的壳在 30 天阈值下留着', () => {
    const root = makeRootAged('dsh-subprocess-bbb224', 17);
    const report = sweepSandbox(30, false);
    assert.equal(report.prunedDirs.length, 0);
    assert.ok(statSync(root).isDirectory());
  });

  it('dry-run 两条路径都不 prune', () => {
    const selfCleaned = makeRoot('dsh-subprocess-bbb225');
    makeFile(selfCleaned, spillName(DEAD_PID), 10, 31);
    const shell = makeRootAged('dsh-subprocess-bbb226', 40);
    const report = sweepSandbox(30, true);
    assert.equal(report.prunedDirs.length, 0);
    assert.ok(statSync(join(selfCleaned, spillName(DEAD_PID))).isFile());
    assert.ok(statSync(shell).isDirectory());
  });

  it('prune 用 rmdir 语义：非空必失败，不递归', () => {
    const root = makeRoot('dsh-subprocess-bbb333');
    makeFile(root, spillName(DEAD_PID, 'stdout', 1, 'dddddddddddd'), 10, 31);
    makeFile(root, 'stranger.bin', 10, 31); // 让 hasUnrecognized 为真 → 不 prune
    const report = sweepSandbox(30, false);
    assert.equal(report.removed.length, 1);
    assert.equal(report.prunedDirs.length, 0);
    assert.ok(statSync(join(root, 'stranger.bin')), '陌生文件不该被递归删掉');
  });

  it('空壳根里有陌生条目时不 prune', () => {
    // hasUnrecognized 对两条 prune 路径都有效：不能因为"看起来是空壳"就绕过它。
    const root = makeRootAged('dsh-subprocess-bbb334', 40);
    // 用一个"名字合法但进程还活着"的文件制造 entries 非空 + 不删；
    // 再叠一个陌生名字。
    makeFile(root, spillName(ALIVE_PID), 10, 40);
    const stranger = makeFile(root, 'stranger.bin', 10, 40);
    const report = sweepSandbox(30, false);
    assert.equal(report.prunedDirs.length, 0);
    assert.ok(statSync(stranger));
    assert.ok(statSync(root).isDirectory());
  });
});

describe('错误收纳', () => {
  it('tmpdir 不可读：返回带错误的空报告，不抛出', () => {
    const report = sweep({ tmpDir: join(sandbox, 'no-such-dir'), maxAgeDays: 30, dryRun: false, now: NOW });
    assert.equal(report.roots.length, 0);
    assert.equal(report.errors.length, 1);
    assert.match(report.errors[0], /readdir/);
  });

  it('扫过的根在轮次之间消失：不抛出', () => {
    const root = makeRoot('dsh-subprocess-bbb444');
    makeFile(root, spillName(DEAD_PID), 10, 31);
    rmSync(root, { recursive: true, force: true });
    const report = sweepSandbox(30, false);
    assert.equal(report.roots.length, 0);
    // 顶层 readdir 已不含它，所以连错误都不该有 —— 消失就是消失。
    assert.equal(report.errors.length, 0);
  });

  it('同一 tmpdir 连跑两轮是幂等的', () => {
    const root = makeRoot('dsh-subprocess-bbb555');
    makeFile(root, spillName(DEAD_PID), 10, 31);
    const first = sweepSandbox(30, false);
    const second = sweepSandbox(30, false);
    assert.equal(first.removed.length, 1);
    assert.equal(second.removed.length, 0);
    assert.equal(second.errors.length, 0);
  });
});

describe('本机 %TEMP% 实测取到的真实形态', () => {
  it('legacy 形态 dsh-subprocess-6388-1-3a0a25abb22c-stderr.log 被识别', () => {
    // 样本取自本机 dsh-subprocess-MqzTTi：75854 字节、17.5 天。
    const root = makeRoot('dsh-subprocess-MqzTTi');
    const file = makeFile(root, 'dsh-subprocess-6388-1-3a0a25abb22c-stderr.log', 75854, 17.5);
    const dry = sweepSandbox(30, true);
    assert.equal(dry.retained.length, 1);
    assert.equal(dry.retained[0].pid, 6388);
    assert.equal(dry.retained[0].label, 'stderr');
    assert.equal(dry.retained[0].verdict, 'too-young');

    const real = sweep({ tmpDir: sandbox, maxAgeDays: 17, dryRun: false, now: NOW });
    assert.equal(real.removed.length, 1);
    assert.equal(real.reclaimedBytes, 75854);
    assert.throws(() => statSync(file), { code: 'ENOENT' });
  });

  it('stdout-27000.log 不是 dsh 产物，认不出就不删', () => {
    // 本机 dsh-subprocess-gwKKWN 里的这个文件是我自己的探针（%TEMP%\spilldacl.mjs:13）
    // 造的假形态；安装运行时只产生 output.ts:206 那一种名字。
    const root = makeRoot('dsh-subprocess-gwKKWN');
    const file = makeFile(root, 'stdout-27000.log', 31, 999);
    const report = sweepSandbox(30, false);
    assert.equal(report.removed.length, 0);
    assert.equal(report.roots[0].entries[0].verdict, 'unrecognized-name');
    assert.ok(statSync(file));
  });
});
