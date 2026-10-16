/**
 * Browser half of dsh-verdict: the Verdict page inside Settings.
 *
 * Registered into the host's `settings.section` slot; the data comes from
 * `GET /api/verdict.panel`, which the host half registers on the web
 * connection. The page draws only what the view model decides: verification
 * is shown because a guard ran and passed, and a one-sided comparison states
 * its insufficiency instead of a verdict.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client'
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

import {
  buildVerdictView, VERDICT_PANEL_PATH, VERDICT_SKILLS_WRITE_PATH,
  type PanelPayload, type VerdictView,
} from '../verdict-view.js'
import { NS, en, zh } from './locales.js'
import { ViewPanel, type Translate } from './view.js'
import { Card, Spinner } from './ui.js'

const VERDICT_LEARN_PATH = '/api/verdict.learn'
const VERDICT_CHECK_PATH = '/api/verdict.check'

/**
 * This half compiles against the host's own client types: `ctx.slots` is the
 * renderer's SlotRegistry, `ctx.locale` the locale runtime — both taken from the
 * official packages, so the registration below is checked against the host
 * contract rather than a local mirror of it.
 *
 * The intersection is spelled out because cordis types an unknown service
 * property as `any`: the module augmentation alone would compile and check
 * nothing. `SettingsSectionOwnerProps` is also the module that declares
 * `settings.section` in `SlotMap`, which is what makes the `name` below a
 * checked key instead of a free string.
 */
type ClientContext = Context & { slots: SlotRegistry; locale: LocaleRuntime }

/**
 * Declaring the namespace is what lets the registration below name it: the host's
 * `LocaleNamespaceMap` is merge-extensible and `locale: NS` is checked against it,
 * so an undeclared namespace does not type-check at all.
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    verdict: keyof typeof zh
  }
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
  const [learning, setLearning] = useState(false)
  const [checking, setChecking] = useState(false)

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

  const learnRule = useCallback(async (text: string, guard?: string) => {
    setLearning(true)
    try {
      await fetch(VERDICT_LEARN_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(guard ? { text, guard } : { text }),
      })
      reload()
    } finally {
      setLearning(false)
    }
  }, [reload])

  const runCheck = useCallback(async () => {
    setChecking(true)
    try {
      await fetch(VERDICT_CHECK_PATH, { method: 'POST' })
      reload()
    } finally {
      setChecking(false)
    }
  }, [reload])

  if (error !== null) {
    return (
      <section style={{ maxWidth: 760 }}>
        <Card>
          <p style={{ margin: 0, fontSize: 13 }} role="alert">{t('failed')}: {error}</p>
          <button type="button" onClick={reload} style={{ alignSelf: 'flex-start', marginTop: 8 }}>{t('retry')}</button>
        </Card>
      </section>
    )
  }
  if (view === null) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={28} /></div>
  return <ViewPanel view={view} t={t} onRefresh={reload} onWrite={writeSkill} writing={writing} onLearn={learnRule} learning={learning} onCheck={runCheck} checking={checking} />
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
      order: 46,
      label: () => ctx.locale.bind(NS)('nav'),
      locale: NS,
    },
    VerdictPanel,
  ))
}
