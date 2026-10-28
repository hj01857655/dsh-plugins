/**
 * Browser half of dsh-git: its page inside Settings.
 *
 * Injects `slots` (the settings shell) and `locale` (the dictionary registry) by runtime
 * identity. The label and every string in the component go through this plugin's own
 * namespace, so the page follows the UI language.
 *
 * @module client
 */

import type { Context } from '@deepseek-ai/cordis'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'

import { NS, en, zh } from './locales.js'
import { GitPanel } from './view.js'

export const inject = ['slots', 'locale']

type ClientContext = Context & { slots: SlotRegistry; locale: LocaleRuntime }

/** Declares this plugin's namespace so `locale: NS` below type-checks. */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    dshGit: keyof typeof zh
  }
}

export function apply(ctx: ClientContext): void {
  // `zh` is the key-set source of truth, matching the official client plugins.
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-git: dictionaries')

  ctx.slots.inject('settings.section', () => ctx.slots.register(
    {
      name: 'settings.section',
      id: 'dsh-git',
      order: 46,
      label: () => ctx.locale.bind(NS)('nav'),
      locale: NS,
    },
    GitPanel,
  ))
}
