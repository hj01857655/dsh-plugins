// 工具调用采集：把 tools/pre-execute / tools/result 两个事件配成一条 ToolCall。
//
// 为什么是这两个事件（对官方运行时 0.2.x 的源码核对）：
//   - tools/result 是唯一的终态汇聚点。dispatch、post-result、final-result 三条
//     派发路径都汇入 finishScheduledExecution → notifyResult，所以被 deny、被
//     cancel、甚至执行前就取消的调用同样发一条 result —— 失败率不会漏计。
//   - notifyResult 发给观察者前 Object.freeze(exec)，pre-execute 与 result 收到的是
//     同一个 exec 对象引用，因此 WeakMap 以 exec 为键计时可靠，且 exec 释放后条目
//     自动回收，不会在长会话里累积。
//   - 起点选 pre-execute 而非 execute：覆盖策略链（含审批等待）到终态的完整时长。
import { performance } from 'node:perf_hooks';
import type { ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools';
import type { ToolCall } from './types.js';

const encoder = new TextEncoder();

/**
 * 一次调用输出侧的字节量。text/reasoning 按 UTF-8 精确计；image 取其已核实的
 * 编码字节数（ImageAttachmentRef.bytes）。ContentBlock 是 merge-extensible 的
 * 映射类型，未知变体不计 —— 宁可少计也不要按猜测的字段名读出 undefined。
 */
function contentBytes(result: ToolExecutionResult): number {
  let bytes = 0;
  for (const block of result.content) {
    switch (block.type) {
      case 'text':
      case 'reasoning':
        bytes += encoder.encode(block.text).byteLength;
        break;
      case 'image':
        bytes += block.attachment.bytes;
        break;
      default:
        break;
    }
  }
  return bytes;
}

/** Agent.id 与所属 session 共用同一身份（dsh-agent runtime-types 注释），直接作为会话键。 */
export function sessionIdOf(exec: ToolExecution): string {
  return exec.agent?.id ?? 'unknown';
}

/** 调用起点表；与采集器实例绑定，避免多个装载实例互相看见起点。 */
export class CallTimer {
  private readonly starts = new WeakMap<ToolExecution, number>();

  /** 记录一次调用开始（tools/pre-execute 里调用）。 */
  start(exec: ToolExecution): void {
    this.starts.set(exec, performance.now());
  }

  /**
   * 结算一次调用为一条记录（tools/result 里调用）。
   * @returns 可直接入库的一条调用；找不到起点时标 untimed，latencyMs 置 0 占位，
   *   由聚合层排除出百分位 —— 绝不为没计时到的调用伪造一个延迟。
   */
  settle(exec: ToolExecution, result: ToolExecutionResult): ToolCall {
    const started = this.starts.get(exec);
    // 没有起点只剩两种可能：调用在本次装载之前已开始，或在 pre-execute 之前就
    // 被取消（callerCancelled 早于 waterfall）。二者都不该有可信延迟。
    const latencyMs = started === undefined ? 0 : Math.max(0, Math.round(performance.now() - started));
    const bytes = contentBytes(result);
    // 失败消息优先取 error.message（成功结果里 error 是 never）。
    const message = result.isError ? result.error.message : undefined;
    return {
      tool: exec.name,
      timestamp: Date.now(),
      success: !result.isError,
      latencyMs,
      sessionId: sessionIdOf(exec),
      ...(message === undefined ? {} : { errorMessage: message }),
      ...(started === undefined ? { untimed: true } : {}),
      ...(bytes > 0 ? { contentBytes: bytes } : {}),
    };
  }
}
