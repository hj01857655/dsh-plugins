/**
 * Browser half of dsh-theme-studio: its page inside Settings.
 *
 * @module client
 */

import type { ComponentType } from 'react'

import { NS, en, zh } from './locales.js'
import { ThemePanel } from './view.js'

export const inject = ['slots', 'locale']

interface SlotsService {
  inject(name: string, register: () => void): void
  register(
    options: { name: string; id: string; order: number; label: () => string; locale: string },
    component: ComponentType<{ t: (key: string, params?: Record<string, unknown>) => string }>,
  ): unknown
}

interface ClientContext {
  slots: SlotsService
  locale: {
    register(ns: string, dicts: { zh: unknown; en: unknown }): () => void
    bind(ns: string): (key: string, params?: Record<string, unknown>) => string
  }
  effect(callback: () => unknown, label?: string): unknown
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-theme-studio: dictionaries')

  ctx.slots.inject('settings.section', () => ctx.slots.register(
    {
      name: 'settings.section',
      id: 'theme-studio',
      order: 47,
      label: () => ctx.locale.bind(NS)('nav'),
      locale: NS,
    },
    ThemePanel,
  ))
}
