// Types for dsh-spill-hygiene

/** 一个候选 spill 文件及其去留判定。 */
export interface SpillEntry {
  /** 所属根目录（绝对路径）。 */
  root: string;
  /** 文件绝对路径。 */
  path: string;
  /** 文件名（不含目录）。 */
  name: string;
  /** 写出该文件的宿主进程 pid，来自文件名；无法解析时为 undefined。 */
  pid: number | undefined;
  /** 流标签（stdout / stderr）。 */
  label: string | undefined;
  sizeBytes: number;
  /** 文件 mtime（epoch ms）。 */
  mtimeMs: number;
  /** 相对 `now` 的年龄，天。 */
  ageDays: number;
  /** 归属进程是否仍存活。 */
  ownerAlive: boolean;
  /** 判定结果；仅 `expired` 会被删。 */
  verdict: SpillVerdict;
  /** verdict 为 `removal-failed` 时的失败原因。 */
  removalError?: string;
  /** verdict 为 `unreadable` 时 lstat 的失败原因。 */
  statError?: string;
}

export type SpillVerdict =
  /** 超期且宿主进程已不存活 ⇒ 回收。 */
  | 'expired'
  /** 未超期。 */
  | 'too-young'
  /** 宿主 pid 仍存活 —— 即使超期也不动，正在写的文件删不得。 */
  | 'active-pid'
  /** 目录内出现不符合 spill 命名的文件：不认，绝不删。 */
  | 'unrecognized-name'
  /** 符号链接、目录、socket 等非普通文件：不跟随、不删。 */
  | 'not-regular-file'
  /** 连 lstat 都读不动（EACCES 等）：判不定 ⇒ 不删；该根失去 prune 资格，但其它条目照常判定。 */
  | 'unreadable'
  /** 判定该删但 unlink 失败（被占用、权限）：保留真实原因，不冒充 active-pid。 */
  | 'removal-failed';

/** 一个 spill 根的扫描结果。 */
export interface RootReport {
  root: string;
  entries: SpillEntry[];
  /** 根内是否存在无法识别的条目 —— 有则本轮不 prune 该目录。 */
  hasUnrecognized: boolean;
  /** 根目录自身的 mtime（epoch ms）；空壳回收（路径 b）按它判定，报告也用它说明去留。 */
  rootMtimeMs: number;
  /** 相对 `now` 的根目录年龄，天。 */
  rootAgeDays: number;
  /** 扫描该根时的错误（权限、竞态消失等）。 */
  error?: string;
}

export interface SweepOptions {
  /** 扫描根（OS tmpdir）。 */
  tmpDir: string;
  /** 保留天数；文件 mtime 距今超过它才成为候选。 */
  maxAgeDays: number;
  /** 只报告不删除。 */
  dryRun: boolean;
  /** 时间源，测试可注入。 */
  now?: number;
}

export interface SweepReport {
  tmpDir: string;
  now: number;
  maxAgeDays: number;
  dryRun: boolean;
  roots: RootReport[];
  removed: SpillEntry[];
  retained: SpillEntry[];
  /** 因清空而删除的 spill 根目录。 */
  prunedDirs: string[];
  /** 被保留的、名字不像 spill 根的目录数（供自检用）。 */
  skippedRoots: number;
  reclaimedBytes: number;
  errors: string[];
}
