import { writeFileSync, readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ToolCall } from './types.js';

/** 是否为「路径不存在」错误 —— 只有这种值得重建目录后重试一次。 */
function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT';
}

export class StatsStore {
  private readonly statsDir: string;
  private readonly callsPath: string;
  /**
   * 目录已就绪的标志。record() 走的是 tools/result 观察器 —— 那段代码运行在
   * registry 的同步派发循环里（core/tools notifyResult），每次调用都要付它的开销。
   * 实测 Windows 上单次 appendFileSync 约 0.6ms，其中 existsSync 约 0.1ms；
   * 目录一旦建好就不会凭空消失，所以这个 stat 只需付一次。
   */
  private dirReady = false;

  constructor(private readonly projectDir: string) {
    this.statsDir = join(projectDir, '.toolstats');
    this.callsPath = join(this.statsDir, 'calls.jsonl');
  }

  private ensureDir(): void {
    if (this.dirReady) return;
    if (!existsSync(this.statsDir)) {
      try {
        mkdirSync(this.statsDir, { recursive: true });
      } catch (error: unknown) {
        // 失败时保持 dirReady=false，下次调用会重试（例如临时目录被外部删除）。
        throw error;
      }
    }
    this.dirReady = true;
  }

  append(call: ToolCall): void {
    this.ensureDir();
    const line = JSON.stringify(call) + '\n';
    try {
      appendFileSync(this.callsPath, line, 'utf8');
    } catch (error: unknown) {
      // 目录被外部删除时重建一次再写；缓存标志必须作废，否则此后每条调用都会抛。
      if (!isNotFound(error)) throw error;
      this.dirReady = false;
      this.ensureDir();
      appendFileSync(this.callsPath, line, 'utf8');
    }
  }

  readAll(): ToolCall[] {
    if (!existsSync(this.callsPath)) return [];
    return readFileSync(this.callsPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ToolCall);
  }

  query(from?: number, to?: number): ToolCall[] {
    const all = this.readAll();
    return all.filter((c) => {
      if (from && c.timestamp < from) return false;
      if (to && c.timestamp > to) return false;
      return true;
    });
  }

  clear(): void {
    if (existsSync(this.callsPath)) writeFileSync(this.callsPath, '', 'utf8');
  }
}
