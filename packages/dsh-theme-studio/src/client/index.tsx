/**
 * Browser half of dsh-theme-studio: its page inside Settings.
 *
 * This half owns the bridge between the panel's stored preferences and dsh's
 * theme service. The panel itself (view.tsx) is a pure view — it never touches
 * `ctx.theme` or the DOM; it calls `applyPreferences()` and reads back a status.
 * That keeps every write on one path, which is what makes "unload restores the
 * host exactly" true.
 *
 * All theme changes go through `ctx.theme.overrideTokens` (stacked partial
 * layers) rather than direct DOM writes. See `src/apply.ts` for why.
 *
 * @module client
 */

import type { ComponentType } from 'react'

import type { ThemePreferences } from '../types.js'
import { NS, en, zh } from './locales.js'
import { ThemePanel } from './view.js'
import { resolveOverrides, type TokenOverrides } from '../apply.js'
import { MOTION_OFF_CSS } from '../tokens.js'

/** Layer identity: one layer per source, replaced wholesale on each update. */
const SOURCE = 'dsh-theme-studio'

/** Stylesheet id for the motion-reduction sheet this half owns. */
const MOTION_STYLE_ID = 'dsh-theme-studio-motion'

export const inject = ['slots', 'locale', 'theme']

// ─── Service shapes ────────────────────────────────────────────
/**
 * The slice of `ctx.theme` this half uses. Declared locally so typechecking
 * needs no host type packages; the runtime contract is ui-theme's.
 */
interface ThemeRuntime {
  getTheme(): { fontSize: number; active: { colorScheme: 'light' | 'dark' } }
  overrideTokens(source: string, tokens: TokenOverrides): () => void
}

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
  theme: ThemeRuntime
  effect(callback: () => unknown, label?: string): unknown
  on(event: 'theme/change', listener: (snapshot: { active: { colorScheme: 'light' | 'dark' } }) => void): unknown
}

// ─── Shared runtime bridge ─────────────────────────────────────
/**
 * The one function the panel uses to publish preferences.
 *
 * Held at module scope because the panel is mounted by the settings shell and
 * has no access to the client context. It is installed during `apply` and
 * removed on dispose, so a panel that somehow outlives its plugin reports an
 * error instead of silently writing to nothing.
 */
export interface ApplyBridge {
  /** Publish these preferences; returns the contrast guard result and active accents. */
  (prefs: ThemePreferences): { contrastAdjusted: boolean; accent: { light: string | null; dark: string | null } }
  /** The live dark-mode state, kept current by the `theme/change` subscription. */
  isDark(): boolean
  /** Subscribe to dark-mode flips; returns an unsubscribe function. */
  subscribe(listener: (dark: boolean) => void): () => void
  /** Remove every layer and stylesheet this half owns. */
  reset(): void
}

let bridge: ApplyBridge | null = null

/** Read the bridge, throwing a teaching error if the plugin is not applied. */
export function useApplyBridge(): ApplyBridge {
  if (bridge === null) {
    throw new Error(
      'dsh-theme-studio: the theme bridge is not installed — the client half is not applied. '
      + 'This panel must be rendered inside the plugin whose apply() registered it.',
    )
  }
  return bridge
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-theme-studio: dictionaries')

  // Track the host's dark state from the theme service rather than by watching
  // the DOM attribute: `theme/change` is the documented channel, and it fires
  // for OS-scheme flips too, not only for explicit preference switches.
  let isDark = ctx.theme.getTheme().active.colorScheme === 'dark'
  const listeners = new Set<(dark: boolean) => void>()
  ctx.effect(() => ctx.on('theme/change', (snapshot) => {
    const next = snapshot.active.colorScheme === 'dark'
    if (next === isDark) return
    isDark = next
    for (const listener of listeners) listener(next)
  }), 'dsh-theme-studio: dark-mode tracking')

  ctx.effect(() => {
    const installed: ApplyBridge = Object.assign(
      (prefs: ThemePreferences) => {
        const resolved = resolveOverrides(prefs, isDark)
        // overrideTokens replaces this source's whole layer, so a shrinking
        // override set can never leave a stale token behind.
        ctx.theme.overrideTokens(SOURCE, resolved.overrides)
        setMotionStyles(prefs.animations)
        return { contrastAdjusted: resolved.contrastAdjusted, accent: resolved.accent }
      },
      {
        isDark: () => isDark,
        subscribe: (listener: (dark: boolean) => void) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        reset: () => {
          ctx.theme.overrideTokens(SOURCE, {})
          setMotionStyles(true)
        },
      },
    )
    bridge = installed
    return () => {
      if (bridge === installed) bridge = null
      listeners.clear()
      // Dropping the layer restores whatever the host had underneath, including
      // a font size the user chose in the official Appearance row.
      ctx.theme.overrideTokens(SOURCE, {})
      setMotionStyles(true)
    }
  }, 'dsh-theme-studio: theme override layer')

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

/**
 * Apply or clear the motion-reduction sheet.
 *
 * dsh ships no motion tokens, so there is no override to set; a stylesheet is
 * the only implementation. It lives inside this plugin's effect scope, so
 * unloading removes it — the earlier version kept it in the document head with
 * no owner.
 */
function setMotionStyles(animations: boolean): void {
  if (typeof document === 'undefined') return
  let el = document.getElementById(MOTION_STYLE_ID) as HTMLStyleElement | null
  if (animations) {
    el?.remove()
    return
  }
  if (el === null) {
    el = document.createElement('style')
    el.id = MOTION_STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = MOTION_OFF_CSS
}
