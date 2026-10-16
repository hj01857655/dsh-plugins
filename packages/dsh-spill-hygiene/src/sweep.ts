// dsh-spill-hygiene: reclaim orphaned subprocess spill files.
//
// 背景（见 docs/WIN32-TOOL-CALL-CHAIN-AUDIT.md §3 F-1）：
// `subprocess-local/src/output.ts` 把超出内存尾的命令输出 spill 到
// `mkdtempSync(join(tmpdir(), 'dsh-subprocess-'))`，注释承诺 "until an external
// cleanup"；而 `spill-local/src/cleanup.ts` 只认 `^dsh-spill-[A-Za-z0-9]{6}$`
// 根 + `^session-[0-9a-f]{12}$` 子目录，对前者是**根前缀与目录形态双重失配**，
// 于是崩溃/被杀进程遗留的 spill 文件长存。本包补上这个 external cleanup。

import { lstatSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { RootReport, SpillEntry, SweepOptions, SweepReport } from './types.js';

/**
 * 子进程 spill 根目录名：`mkdtempSync(join(tmpdir(), 'dsh-subprocess-'))` 的产物形态。
 * 精确到 6 位 base62 —— 与 dsh 自家 `DEFAULT_ROOT_RE` 同样的克制：
 * 名字不像的目录一律不动，因为 `sandbox-local/src/index.ts:426` 用**裸 `dsh-`**
 * 前缀创建**活跃的**每会话沙箱工作区，`dsh-shell-` / `dsh-subprocess-launch-`
 * 又是另外的生命周期。宽松匹配会删掉正在用的东西。
 */
const ROOT_RE = /^dsh-subprocess-[A-Za-z0-9]{6}$/;

/**
 * spill 文件名：`output.ts:206`
 * `dsh-subprocess-${process.pid}-${++spillCounter}-${randomBytes(6).toString('hex')}-${label}.log`
 * 其中 label 只有 stdout / stderr 两种取值，所以这里写死而不用 `[a-z]+`：
 * 认不出的名字 ⇒ 不删。
 */
const FILE_RE = /^dsh-subprocess-(\d+)-(\d+)-([0-9a-f]{12})-(stdout|stderr)\.log$/;

/** tmpdir 下用于自检计数的前缀：本包**看见但不动**的邻居目录。 */
const NEIGHBOR_PREFIX = 'dsh-';

const DAY_MS = 86_400_000;

/**
 * pid 是否仍存活。
 *
 * 保守方向：只有明确 ESRCH（进程不存在）才判死。ESRCH 之外的任何异常
 * （EPERM —— 进程存在但无权打开；以及 Windows 上的其它失败）都判活，
 * 因为"误判活"只是少删一个文件，"误判死"会删掉一条正在跑的命令的产物。
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return codeOf(error) !== 'ESRCH';
  }
}

function codeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null ? (error as { code?: string }).code : undefined;
}

/** 判定单个条目的去留；不含任何删除动作。 */
function classify(
  root: string,
  name: string,
  path: string,
  sizeBytes: number,
  mtimeMs: number,
  maxAgeDays: number,
  now: number,
): SpillEntry {
  const ageDays = (now - mtimeMs) / DAY_MS;
  const base: Omit<SpillEntry, 'verdict' | 'ownerAlive'> = {
    root,
    path,
    name,
    pid: undefined,
    label: undefined,
    sizeBytes,
    mtimeMs,
    ageDays,
  };
  const match = FILE_RE.exec(name);
  if (!match) return { ...base, ownerAlive: false, verdict: 'unrecognized-name' };

  const pid = Number(match[1]);
  const entry: SpillEntry = {
    ...base,
    pid,
    label: match[4],
    ownerAlive: isPidAlive(pid),
    verdict: 'active-pid',
  };
  // 顺序有讲究：先问"归属进程还在吗"，再问年龄。超期但宿主活着 ⇒ 不动。
  if (entry.ownerAlive) return { ...entry, verdict: 'active-pid' };
  // 用正向判定而不是 `ageDays <= maxAgeDays ⇒ too-young`：后者在 maxAgeDays 是 NaN 时
  // 两个分支都落空，直接掉进 expired —— 配置读成一个垃圾值就变成"全删"，
  // 这是本工具最不该有的失败方向。写成 ageDays > maxAgeDays 才删，NaN ⇒ 谁都不删。
  if (!(ageDays > maxAgeDays)) return { ...entry, verdict: 'too-young' };
  return { ...entry, verdict: 'expired' };
}

/**
 * 扫描一个 spill 根，返回其内每个条目的判定。
 * `rootMtimeMs` 由调用方传入 —— 它已经 lstat 过这个根，这里不再重复一次系统调用：
 * 重复 stat 会拿到一个可能与"判定 prune 时"不同的 mtime。
 */
function scanRoot(rootPath: string, rootMtimeMs: number, opts: SweepOptions, now: number): RootReport {
  const entries: SpillEntry[] = [];
  let hasUnrecognized = false;
  const meta = { root: rootPath, rootMtimeMs, rootAgeDays: (now - rootMtimeMs) / DAY_MS };
  let names: string[];
  try {
    names = readdirSync(rootPath);
  } catch (error: unknown) {
    return { ...meta, entries, hasUnrecognized: true, error: `readdir: ${String(error)}` };
  }

  for (const name of names) {
    const path = join(rootPath, name);
    let stat;
    try {
      // lstat（不是 stat）：只读取链接条目自身的元数据，绝不跟随到目标。
      // 若这里是 stat，一个指向 tmpdir 之外的 symlink 会把它目标的 size/mtime 读进来
      // —— 判定的依据就变成了别人的文件；而 unlink 一个跟随后的路径还会删错对象。
      stat = lstatSync(path);
    } catch (error: unknown) {
      // 竞态：条目在我们 readdir 之后消失。它已经不存在，不算错误。
      if (codeOf(error) === 'ENOENT') continue;
      // 单个条目读不动（EACCES 等）不该中止整根扫描：记为 unreadable、让本根失去
      // prune 资格，然后继续看剩下的条目。判不定的东西一律不删，但不确定的代价
      // 只该落在它自己那一条上。
      hasUnrecognized = true;
      entries.push({
        root: rootPath,
        path,
        name,
        pid: undefined,
        label: undefined,
        sizeBytes: 0,
        mtimeMs: 0,
        ageDays: 0,
        ownerAlive: false,
        verdict: 'unreadable',
        statError: `${name}: ${String(error)}`,
      });
      continue;
    }

    if (!stat.isFile() || stat.isSymbolicLink()) {
      // 目录、socket、symlink/junction 都走这里，都不删。
      // size 记 0：一个子目录的"大小"不是可回收字节数，报成几 KB 会让人以为
      // 清扫回收了它其实没有回收的空间。
      // isSymbolicLink() 这一半在实测的 Node v25.8.0 win32 上是**冗余**的（
      // %TEMP%\lstatsymlink.mjs：file/dir symlink 与 junction 一律 isFile=false、
      // isSymbolicLink=true），保留它是纵深防御：一旦某个平台的 lstat 把 reparse
      // point 报成普通文件，仅靠 isFile() 过滤就会让我们去 unlink 一个链接。
      // 另注：lstat 给 symlink 的 size 是 reparse point 自身的大小（实测 66/67），
      // 不是目标的大小 —— 用 stat 才会读到目标，而那正是我们不做的。
      hasUnrecognized = true;
      entries.push({
        ...classify(rootPath, name, path, 0, stat.mtimeMs, opts.maxAgeDays, now),
        sizeBytes: 0,
        pid: undefined,
        label: undefined,
        ownerAlive: false,
        verdict: 'not-regular-file',
      });
      continue;
    }
    const entry = classify(rootPath, name, path, stat.size, stat.mtimeMs, opts.maxAgeDays, now);
    if (entry.verdict === 'unrecognized-name') hasUnrecognized = true;
    entries.push(entry);
  }
  return { ...meta, entries, hasUnrecognized };
}

/** unlink 的三态结果：真删掉了、本来就不在了、失败。 */
type Removal = 'removed' | 'already-gone' | { error: string };

/**
 * 删除单个文件。
 *
 * ENOENT 单独成态而不是算成功：文件在我们 stat 之后被别人（外部清理器、
 * dsh 自己的 exit handler、上一轮清扫）删掉了，目的达成了，但**本包没有回收
 * 那批字节** —— 把它记进 removed/reclaimedBytes 就是虚报战果。
 */
function removeFile(path: string): Removal {
  try {
    unlinkSync(path);
    return 'removed';
  } catch (error: unknown) {
    if (codeOf(error) === 'ENOENT') return 'already-gone';
    return { error: `unlink ${path}: ${String(error)}` };
  }
}

/**
 * 清空后的根目录回收；返回失败原因，成功返回 undefined。
 *
 * 用 `rmdirSync` 而不是 `rmSync(..., { recursive: true })`：前者在内核层面
 * 保证"只有真的为空才会成功"。这就是本包唯一安全的 prune 语义 —— 一旦我们
 * recursive 删目录，判错一个正则的代价就从"少删一个文件"变成"删掉一棵树"。
 *
 * 失败要报出来（EBUSY/EPERM 在 Windows 上是常态：某进程把这个目录当 cwd），
 * 否则"本轮没有任何根够格 prune"和"够格的根都删失败了"在报告里长得一模一样。
 */
function removeEmptyDir(path: string): string | undefined {
  try {
    rmdirSync(path);
    return undefined;
  } catch (error: unknown) {
    // ENOENT：已被别人删掉，目的达成，不是失败。
    if (codeOf(error) === 'ENOENT') return undefined;
    return `rmdir ${path}: ${String(error)}`;
  }
}

/** 跑一轮清扫。 */
export function sweep(opts: SweepOptions): SweepReport {
  const now = opts.now ?? Date.now();
  const report: SweepReport = {
    tmpDir: opts.tmpDir,
    now,
    maxAgeDays: opts.maxAgeDays,
    dryRun: opts.dryRun,
    roots: [],
    removed: [],
    retained: [],
    prunedDirs: [],
    skippedRoots: 0,
    reclaimedBytes: 0,
    errors: [],
  };

  let top: string[];
  try {
    top = readdirSync(opts.tmpDir);
  } catch (error: unknown) {
    report.errors.push(`readdir ${opts.tmpDir}: ${String(error)}`);
    return report;
  }

  for (const name of top.sort()) {
    const path = join(opts.tmpDir, name);
    if (!ROOT_RE.test(name)) {
      // 只为自检计数：本包看见了多少"名字像但不是目标"的邻居。
      if (name.startsWith(NEIGHBOR_PREFIX)) report.skippedRoots += 1;
      continue;
    }

    let stat;
    try {
      stat = lstatSync(path);
    } catch (error: unknown) {
      if (codeOf(error) !== 'ENOENT') report.errors.push(`lstat ${path}: ${String(error)}`);
      continue;
    }
    // 符号链接的"根"不进入：它可能指向 tmpdir 之外的任何目录。
    // 实测（%TEMP%\lstatsymlink.mjs）win32 上指向目录的 symlink/junction 的
    // lstat 报 isDirectory=false，所以 !isDirectory() 已经拦下；isSymbolicLink()
    // 是纵深防御，防的是某平台把 reparse point 报成目录。
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      report.errors.push(`跳过 ${path}：名为 spill 根但不是真实目录`);
      continue;
    }

    // 复用上面那一次 lstat 的 mtime，不在 scanRoot 里再 stat 一遍：两次 stat 之间
    // 目录可能被写，prune 判定与报告显示就会各用一个 mtime。传进去保证同源。
    const rootReport = scanRoot(path, stat.mtimeMs, opts, now);
    report.roots.push(rootReport);
    if (rootReport.error) report.errors.push(`${path}: ${rootReport.error}`);

    let removedSomething = false;
    for (const entry of rootReport.entries) {
      if (entry.verdict !== 'expired') {
        report.retained.push(entry);
        continue;
      }
      if (opts.dryRun) {
        // 判定保持 expired：读报告的人要能看出"这条本来会被删"，
        // 而不是把它混进"因为某种原因留着"的那批。
        report.retained.push(entry);
        continue;
      }
      const result = removeFile(entry.path);
      if (result === 'removed') {
        report.removed.push(entry);
        report.reclaimedBytes += entry.sizeBytes;
        removedSomething = true;
      } else if (result === 'already-gone') {
        // 别人删的：目的达成但不计成本，也不足以支撑"这个根被我清空了"的结论。
        continue;
      } else {
        report.errors.push(result.error);
        // 保留失败原因本身：把它伪装成 active-pid 会让"为什么没删"这个诊断信息说谎。
        report.retained.push({ ...entry, verdict: 'removal-failed', removalError: result.error });
      }
    }

    // prune 的两条路径，都还要求"此刻确实为空"且"根内无认不出的条目"：
    //   (a) 本轮删掉过 expired 条目 ⇒ 这个根是我清空的，直接回收；
    //   (b) 根是空的、且**目录自身**也超期 ⇒ 回收崩溃遗留的空壳。
    // (b) 的门槛是目录 mtime，依据两条实测 + 一条源码承诺：
    //   · %TEMP%\emptyrootmtime.mjs：win32 下目录内新建/删除文件都会把目录 mtime 推到
    //     当下，而 stat/readdir 不会 ⇒ "空 + mtime 老"确实等于"很久没有文件在这里进出"，
    //     也等于本包自己的反复扫描不会把空壳的 mtime 续命成"活跃"；
    //   · output.ts:34-37 逐字写明 "when an external temporary-file cleaner removes it
    //     while empty, the next spill open fails and the collector degrades to its
    //     in-memory tail" —— 官方按"外部清理器会删空目录"设计，不是越权。
    //   但那条退化路径会经 logSpillFailure 打一条 **error** 级日志，所以一个刚建好、
    //   还没写过文件的活跃空根绝不能碰：它 mtime 必然是新的，(b) 天然放过它。
    // rootAgeDays 与判定同源（复用上面那一次 lstat 的 mtime），所以报告文案与实际
    // 去留不可能各说一套。
    const agedOutEmptyRoot = rootReport.entries.length === 0 && rootReport.rootAgeDays > opts.maxAgeDays;
    const emptiable = removedSomething || agedOutEmptyRoot;
    if (!opts.dryRun && emptiable && !rootReport.hasUnrecognized && readdirIsEmpty(path)) {
      const failure = removeEmptyDir(path);
      if (failure) report.errors.push(failure);
      else report.prunedDirs.push(path);
    }
  }

  return report;
}

function readdirIsEmpty(path: string): boolean {
  try {
    return readdirSync(path).length === 0;
  } catch {
    return false;
  }
}

/** 汇总报告为可读文本（CLI 与插件日志共用）。 */
export function formatReport(report: SweepReport): string {
  const lines: string[] = [];
  lines.push(
    `spill 清扫  root=${report.tmpDir}  maxAge=${report.maxAgeDays}d  ` +
      `mode=${report.dryRun ? 'dry-run（只报告，未删除）' : 'apply'}`,
  );
  if (report.roots.length === 0) {
    lines.push(`未发现 spill 根；看见但不动的 dsh-* 邻居 ${report.skippedRoots} 个。`);
  }
  for (const root of report.roots) {
    lines.push('');
    lines.push(root.root);
    if (root.entries.length === 0) {
      // 空根的可回收性取决于目录自身年龄（路径 b），文案必须跟着判定走：
      // apply 模式下够老的空壳会被 prune，说"本轮不动"就是谎。
      const shellAge = root.rootAgeDays.toFixed(1);
      if (report.dryRun) {
        lines.push(`  (空目录，自身 ${shellAge}d —— apply 且超过 ${report.maxAgeDays}d 时会被 rmdir)`);
      } else if (root.rootAgeDays > report.maxAgeDays) {
        lines.push(`  (空目录，自身 ${shellAge}d ⇒ 超期空壳，回收)`);
      } else {
        lines.push(`  (空目录，自身 ${shellAge}d ⇒ 未超期，保留)`);
      }
      continue;
    }
    for (const entry of root.entries) {
      // pid 未知时不写 (dead)：那是"没解析出 pid"，不是"进程已死"。
      const owner = entry.pid === undefined ? 'pid=-' : `pid=${entry.pid}${entry.ownerAlive ? '(alive)' : '(dead)'}`;
      lines.push(`  ${entry.name}  ${formatBytes(entry.sizeBytes)}  ${entry.ageDays.toFixed(1)}d  ${owner}  ⇒ ${entry.verdict}`);
    }
  }
  lines.push('');
  // dry-run 下 expired 条目落在 retained 里（确实没删），所以候选数从它取，
  // 而 removed 永远只表示"本包真的删掉的文件" —— JSON 消费方不会被语义分叉骗到。
  const candidates = report.dryRun ? report.retained.filter((entry) => entry.verdict === 'expired') : report.removed;
  const candidateBytes = candidates.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const keptBack = report.retained.filter((entry) => entry.verdict !== 'expired');
  lines.push(
    `${report.dryRun ? '候选' : '已删'} ${candidates.length} 个 / ${formatBytes(candidateBytes)}；` +
      `保留 ${keptBack.length} 个；prune 目录 ${report.prunedDirs.length} 个；` +
      `跳过邻居 ${report.skippedRoots} 个；错误 ${report.errors.length} 条。`,
  );
  for (const error of report.errors) lines.push(`  ! ${error}`);
  if (report.dryRun && candidates.length > 0) {
    lines.push('  → 存在超期候选但本轮未删除；确认后用 --apply（或设 DSH_SPILL_HYGIENE_APPLY=1）执行。');
  }
  return lines.join('\n');
}

/** 自适应单位：502B 显示成 "0.00 MB" 是谎，显示成 "502 B" 才是。 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(2)} ${units[unit]}`;
}
