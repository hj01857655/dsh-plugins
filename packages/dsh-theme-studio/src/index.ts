/**
 * Host half of dsh-theme-studio.
 *
 * A purely client-side plugin — the host half exists only to satisfy the Cordis
 * bundle contract (every plugin needs a host entry point plus a
 * `cordis.patch.yml` whose top level is a loader patch array). No routes, no
 * storage, no services: preferences live in the browser's localStorage and are
 * published through `ctx.theme`.
 *
 * @module index
 */

import type { Context } from '@deepseek-ai/cordis'

export function apply(_ctx: Context): void {
  // Intentionally empty. The client half (src/client/index.tsx) registers the
  // settings section; the host half has no work to do.
}
