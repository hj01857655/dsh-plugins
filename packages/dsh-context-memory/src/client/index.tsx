/**
 * Browser half of dsh-context-memory — the registration shell.
 *
 * Declaring `inject` at module scope is required, not stylistic: without it the client
 * loader cannot resolve the settings and connection services, and the half fails to
 * register with an unhelpful error.
 *
 * @module context-memory/client
 */

import type { PanelPayload } from '../types.js'
import { renderPanel } from './view.js'

export const inject = ['@deepseek-ai/dsh-client-ui-settings', '@deepseek-ai/dsh-client-connection']

export function apply(ctx: { inject: (deps: string[], fn: (...services: unknown[]) => void) => void }): void {
  ctx.inject(inject, (settings: unknown, connection: unknown) => {
    const s = settings as { section: (id: string, opts: { title: string; render: () => Promise<string> | string }) => void }
    const c = connection as { fetch: (path: string) => Promise<Response> }

    s.section('context-memory', {
      title: 'Context memory',
      render: async () => {
        try {
          const res = await c.fetch('/api/context-memory.panel')
          const payload: PanelPayload = await res.json()
          return renderPanel(payload)
        } catch (error) {
          // Say what failed rather than rendering an empty panel, which would read as
          // "nothing is remembered" — a different and wrong answer.
          return `<div class="context-memory-panel"><h2>Context memory</h2><p>Could not load memories: ${String(error)}</p></div>`
        }
      },
    })
  })
}
