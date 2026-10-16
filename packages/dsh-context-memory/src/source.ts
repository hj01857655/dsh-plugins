/**
 * Message source of the recall context this plugin injects into a step.
 *
 * 0.2.0-rc.2 removed the shared catch-all `plugin` kind: a producer declares its
 * own `kind` by augmenting `MessageSourceMap` in its own module, and a consumer
 * narrows on that kind — the official `dsh-agent-loop` does the same with its
 * `runtime-context` kind. `form` is the producer-independent axis, and `recall`
 * is exactly what this plugin hands the model: material lifted out of another
 * session's log.
 *
 * @module context-memory/source
 */

import type { ContextFormed } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'dsh-context-memory': { kind: 'dsh-context-memory' } & ContextFormed
  }
}

/** Source stamped on every message this plugin injects. */
export const recallSource = { kind: 'dsh-context-memory', form: 'recall' } as const

/** True when a message is this plugin's own recall injection. */
export function isRecallMessage(message: UserMessage): boolean {
  return message.source.kind === 'dsh-context-memory' && message.source.form === 'recall'
}
