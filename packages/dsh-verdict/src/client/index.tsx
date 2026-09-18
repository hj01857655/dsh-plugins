/**
 * Browser half of dsh-verdict: the Verdict page inside Settings.
 *
 * Registered into the host's `settings.section` slot; the data comes from
 * `GET /api/verdict.panel`, which the host half registers on the web
 * connection. The page draws only what the view model decides: verification
 * is shown because a guard ran and passed, and a one-sided comparison states
 * its insufficiency instead of a verdict.
 */

import { useCallback, useEffect, useState } from 'react'
import type { ComponentType, CSSProperties } from 'react'

import {
  buildVerdictView, VERDICT_PANEL_PATH, VERDICT_SKILLS_WRITE_PATH,
  type PanelPayload, type VerdictView,
} from '../verdict-view.js'
import { NS, en, zh } from './locales.js'
import { card, muted, ViewPanel, type Translate } from './view.js'

/**
 * The slice of the slots and locale services this half uses, kept local so typechecking
 * needs no host type packages. The runtime contract is the host's: the settings shell
 * renders every registered `settings.section` entry, and the renderer binds a translate
 * seat from the namespace the entry declares.
 */
interface SlotsService {
  inject(name: string, register: () => void): void
  register(
    options: { name: string; id: string; order: number; label: () => string; locale: string },
    component: ComponentType<{ t: Translate }>,
  ): unknown
}

interface ClientContext {
  slots: SlotsService
  locale: {
    register(ns: string, dicts: { zh: unknown; en: unknown }): () => void
    bind(ns: string): Translate
  }
  effect(callback: () => unknown, label?: string): unknown
}

interface PanelState {
  view: VerdictView | null
  error: string | null
  loading: boolean
}

/** Fetch, decode, and re-derive the panel; `reload` re-runs the whole pass. */
function useVerdictPanel(): PanelState & { reload: () => void } {
  const [state, setState] = useState<PanelState>({ view: null, error: null, loading: true })
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    setState({ view: null, error: null, loading: true })
    fetch(VERDICT_PANEL_PATH, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        return buildVerdictView((await response.json()) as PanelPayload)
      })
      .then((view) => {
        if (!controller.signal.aborted) setState({ view, error: null, loading: false })
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setState({ view: null, error: cause instanceof Error ? cause.message : String(cause), loading: false })
      })
    return () => controller.abort()
  }, [tick])

  return { ...state, reload }
}

function VerdictPanel({ t }: { t: Translate }) {
  const { view, error, loading, reload } = useVerdictPanel()
  const [writing, setWriting] = useState<string | null>(null)

  const writeSkill = useCallback(async (key: string) => {
    setWriting(key)
    try {
      await fetch(VERDICT_SKILLS_WRITE_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      reload()
    } finally {
      setWriting(null)
    }
  }, [reload])

  if (error !== null) {
    return (
      <section style={{ ...card, maxWidth: 760 }}>
        <p style={{ margin: 0, fontSize: 13 }} role="alert">{t('failed')}: {error}</p>
        <button type="button" onClick={reload} style={{ alignSelf: 'flex-start' }}>{t('retry')}</button>
      </section>
    )
  }
  if (view === null) return <p style={muted} aria-live="polite">{t('loading')}</p>
  return <ViewPanel view={view} t={t} onRefresh={reload} onWrite={writeSkill} writing={writing} />
}

/** Register the Verdict page into the settings shell. */
export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  // `zh` is the key-set source of truth, matching the official client plugins.
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-verdict: dictionaries')

  ctx.slots.inject('settings.section', () => ctx.slots.register(
    {
      name: 'settings.section',
      id: 'verdict',
      order: 40,
      label: () => ctx.locale.bind(NS)('nav'),
      locale: NS,
    },
    VerdictPanel,
  ))
}
