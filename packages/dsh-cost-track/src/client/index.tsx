/**
 * Browser half of dsh-cost-track: its page inside Settings.
 *
 * Two services are injected by their runtime identity, not by the packages that provide
 * them: the settings shell is `slots`, the dictionary registry is `locale`. The label and
 * every string inside the component are translated through this plugin's own namespace,
 * which is why the page follows the UI language instead of the plugin author's.
 *
 * @module client
 */

import type { Context } from '@deepseek-ai/cordis'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client'

import { NS, en, zh } from './locales.js'
import { CostPanel } from './view.js'

export const inject = ['slots', 'locale']

type ClientContext = Context & { slots: SlotRegistry; locale: LocaleRuntime }

/**
 * Declaring the namespace is what lets the registration below name it: the host's
 * `LocaleNamespaceMap` is merge-extensible and `locale: NS` is checked against it,
 * so an undeclared namespace does not type-check at all.
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    costTrack: keyof typeof zh
  }
}

export function apply(ctx: ClientContext): void {
  // `zh` is the key-set source of truth, matching the official client plugins.
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-cost-track: dictionaries')

  ctx.slots.inject('settings.section', () => ctx.slots.register(
    {
      name: 'settings.section',
      id: 'cost',
      order: 40,
      label: () => ctx.locale.bind(NS)('nav'),
      locale: NS,
    },
    CostPanel,
  ))
}
