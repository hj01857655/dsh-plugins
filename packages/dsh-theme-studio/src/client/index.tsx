/**
 * Browser half of dsh-theme-studio: its page inside Settings.
 *
 * This half owns the bridge between the panel's stored preferences and dsh's
 * theme service. The panel itself (view.tsx) is a pure view — it never touches
 * `ctx.theme` or the DOM; it calls `applyPreferences()` and reads back a status.
 * That keeps every write on one path, which is what makes "unload restores the
 * host exactly" true.
 *
 * All theme changes go through `ctx.theme` — `overrideTokens` for color tokens and
 * `setFontSize` for the content font size — rather than direct DOM writes. See
 * `src/apply.ts` for why the font size in particular must not be an override.
 *
 * @module client
 */

import type { Context } from '@deepseek-ai/cordis'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'

import type { ThemePreferences } from '../types.js'
import { NS, en, zh } from './locales.js'
import { ThemePanel } from './view.js'
import { loadPreferences } from './preferences.js'
import { resolveOverrides, type TokenOverrides } from '../apply.js'
import { MOTION_OFF_CSS } from '../tokens.js'

/** Layer identity: one layer per source, replaced wholesale on each update. */
const SOURCE = 'dsh-theme-studio'

/** Stylesheet id for the motion-reduction sheet this half owns. */
const MOTION_STYLE_ID = 'dsh-theme-studio-motion'

export const inject = ['slots', 'locale', 'theme']

/**
 * dsh's own content-font-size bounds. `setFontSize` throws outside them, so the
 * reset guard below needs the same numbers the service validates against.
 */
const FONT_SIZE_MIN = 12
const FONT_SIZE_MAX = 17

// ─── Service shapes ────────────────────────────────────────────
/**
 * This half compiles against the host's own client types: `ctx.slots` is the
 * renderer's SlotRegistry, `ctx.locale` the locale runtime and `ctx.theme` the
 * theme runtime — taken from the official packages rather than mirrored locally.
 * The intersection is spelled out because cordis types an unknown service
 * property as `any`; `on('theme/change')` is checked against the theme package's
 * declared events once it is in the program.
 */
type ClientContext = Context & {
  slots: SlotRegistry
  locale: LocaleRuntime
  theme: ThemeRuntime
}

/** The snapshot shape the theme runtime hands back, derived rather than mirrored. */
type ThemeSnapshotLike = ReturnType<ThemeRuntime['getTheme']>

/**
 * Declaring the namespace is what lets the registration below name it: the host's
 * `LocaleNamespaceMap` is merge-extensible and `locale: NS` is checked against it,
 * so an undeclared namespace does not type-check at all.
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'theme-studio': keyof typeof zh
  }
}

// ─── Shared runtime bridge ─────────────────────────────────────
/**
 * Everything the panel needs from the client half.
 *
 * Held at module scope because the panel is mounted by the settings shell and
 * has no access to the client context. It is installed during `apply` and
 * removed on dispose, so a panel that somehow outlives its plugin reports an
 * error instead of silently writing to nothing.
 */
export interface ApplyBridge {
  /** Publish tokens and motion state; returns the contrast guard result. */
  (prefs: ThemePreferences): {
    contrastAdjusted: boolean
    accent: { light: string | null; dark: string | null }
  }
  /** The live dark-mode state, kept current by the `theme/change` subscription. */
  isDark(): boolean
  /**
   * The host's current content font size in px.
   *
   * Read from `ctx.theme`, not from anything this plugin persists — the value
   * belongs to the host, so the panel and the official Appearance stepper
   * always report the same number.
   */
  fontSize(): number
  /** Set the content font size through dsh's own entry point. */
  setFontSize(px: number): void
  /** Subscribe to any theme change — dark flips and font-size edits alike. */
  subscribe(listener: (state: { dark: boolean; fontSize: number }) => void): () => void
  /** Drop the override layer, motion sheet, and restore the original font size. */
  reset(): void
  /**
   * Read back what the last apply actually left on the host document.
   *
   * `overrideTokens` publishes a snapshot and dsh's own presenter writes it onto
   * `body`; nothing here guarantees the write landed — a token dsh kept, or a
   * presenter that never ran, is indistinguishable from a theme that simply did
   * not paint. The panel asks instead of assuming.
   */
  verify(): { written: number; missing: string[] }
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

  // Track host state from the theme service rather than by watching the DOM
  // attribute: `theme/change` is the documented channel, and it fires for
  // OS-scheme flips and font-size edits too, not only preference switches.
  const snapshot = ctx.theme.getTheme()
  let isDark = snapshot.active.colorScheme === 'dark'

  // Captured on first apply so `reset()` can hand the user's font size back.
  // Without this a reset would strand whatever density they last picked, since
  // the value lives in the host and not in this plugin's storage.
  let originalFontSize: number | null = null

  // Names this plugin last handed to `overrideTokens`, for verify() to check
  // against what the host actually wrote onto the document.
  let lastApplied: string[] = []

  const listeners = new Set<(state: { dark: boolean; fontSize: number }) => void>()
  ctx.effect(() => ctx.on('theme/change', (next) => {
    isDark = next.active.colorScheme === 'dark'
    const fontSize = next.fontSize
    for (const listener of listeners) listener({ dark: isDark, fontSize })
  }), 'dsh-theme-studio: host theme tracking')

  ctx.effect(() => {
    const installed: ApplyBridge = Object.assign(
      (prefs: ThemePreferences) => {
        const resolved = resolveOverrides(prefs, isDark)
        // overrideTokens replaces this source's whole layer, so a shrinking
        // override set can never leave a stale token behind.
        ctx.theme.overrideTokens(SOURCE, resolved.overrides)
        lastApplied = Object.keys(resolved.overrides)
        setMotionStyles(prefs.animations)
        return { contrastAdjusted: resolved.contrastAdjusted, accent: resolved.accent }
      },
      {
        isDark: () => isDark,
        verify: () => {
          if (typeof document === 'undefined') return { written: 0, missing: [] }
          const body = document.body.style
          const missing = lastApplied.filter((name) => body.getPropertyValue(name) === '')
          return { written: lastApplied.length - missing.length, missing }
        },
        fontSize: () => ctx.theme.getTheme().fontSize,
        setFontSize: (px: number) => {
          if (originalFontSize === null) originalFontSize = ctx.theme.getTheme().fontSize
          ctx.theme.setFontSize(px)
        },
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        reset: () => {
          ctx.theme.overrideTokens(SOURCE, {})
          lastApplied = []
          setMotionStyles(true)
          // Hand the font size back. Guarded because `setFontSize` throws on
          // anything outside dsh's 12..17 range, and this value came from the
          // host — but a defensive check costs nothing and a throw here would
          // abort the rest of the reset.
          if (originalFontSize !== null
            && originalFontSize >= FONT_SIZE_MIN
            && originalFontSize <= FONT_SIZE_MAX) {
            ctx.theme.setFontSize(originalFontSize)
          }
        },
      },
    )
    bridge = installed

    // Publish the stored choice now. Until this existed only the panel called
    // the bridge, so a saved theme survived in localStorage but stayed
    // invisible until the user opened Settings — every restart started from
    // the host's default palette. Deliberately not wired to `theme/change`:
    // `overrideTokens` publishes that event, so re-applying from its handler
    // would recurse. The panel still re-publishes on every edit.
    installed(loadPreferences())
    return () => {
      if (bridge === installed) bridge = null
      listeners.clear()
      // Dropping the layer restores whatever the host had underneath, including
      // a font size the user chose in the official Appearance row.
      ctx.theme.overrideTokens(SOURCE, {})
      lastApplied = []
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
