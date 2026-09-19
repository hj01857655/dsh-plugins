/**
 * Host half of dsh-theme-studio.
 *
 * A purely client-side plugin — the host half exists only to satisfy the Cordis
 * bundle contract (every plugin needs a host entry point with a cordis.patch.yml).
 * No routes, no storage, no services: all theme state lives in the browser's
 * localStorage and is applied via CSS custom properties on document.documentElement.
 *
 * @module index
 */

import type { Context } from '@deepseek-ai/cordis'

export function apply(_ctx: Context): void {
  // Intentionally empty. The client half (src/client/index.tsx) registers the
  // settings section; the host half has no work to do.
}
