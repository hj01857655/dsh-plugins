/**
 * Host half of dsh-verdict.
 *
 * A dsh plugin contributes through its Cordis context: `apply` receives the context and
 * registers whatever the plugin owns on it. This module is deliberately thin for now —
 * it proves the load path (manifest -> cordis.patch.yml -> apply) before any measurement
 * logic is built on top of it. A plugin that cannot be loaded cannot be debugged.
 *
 * @module dsh-verdict
 */

import type { Context } from '@deepseek-ai/cordis'

/** Display metadata; labels this plugin in Cordis diagnostics. */
export const name = 'dsh-verdict'

/**
 * Services this plugin needs before `apply` runs. Cordis resolves `inject` first and
 * only then calls `apply`, so anything listed here is guaranteed present. Kept empty
 * until the plugin actually consumes a service: claiming a dependency it does not use
 * only couples the plugin to load ordering for no benefit.
 */
export const inject: string[] = []

/**
 * Register the plugin's contributions.
 *
 * @param ctx - the Cordis context this plugin contributes to.
 */
export function apply(ctx: Context): void {
  // Effects registered through `ctx` are disposed with the plugin, which is what makes
  // the profile's "stop the backend, modify the profile" flow safe. Nothing is
  // registered yet, so there is nothing to dispose.
  void ctx
}
