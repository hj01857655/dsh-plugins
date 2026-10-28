/**
 * Browser half of dsh-context-meter: the session usage comparison page in Settings.
 *
 * Injects the settings shell (`slots`) and the dictionary registry (`locale`) by runtime
 * identity. Polls the host rows route every three seconds while mounted.
 *
 * The page deliberately does not re-render the composer's occupancy ring or breakdown —
 * the official input-bar ContextMeter owns that; this page covers cross-session
 * comparison, cumulative usage, and model routes.
 *
 * @module client
 */

import { useEffect, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client'

import { NS, en, zh } from './locales.js'
import { SessionUsageTable } from './view.js'
import type { MeterRowDto } from './view.js'

export const inject = ['slots', 'locale']

const ROWS_PATH = '/api/context-meter.rows'
const POLL_MS = 3000

type ClientContext = Context & { slots: SlotRegistry; locale: LocaleRuntime }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    contextMeter: keyof typeof zh
  }
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-context-meter: dictionaries')

  ctx.slots.inject('settings.section', () => ctx.slots.register(
    {
      name: 'settings.section',
      id: 'context-meter',
      order: 46,
      label: () => ctx.locale.bind(NS)('nav'),
      locale: NS,
    },
    SessionUsageSection,
  ))
}

function SessionUsageSection(_props: SettingsSectionOwnerProps): JSX.Element {
  const t = useT()
  const [rows, setRows] = useState<MeterRowDto[] | undefined>(undefined)

  useEffect(() => {
    let alive = true
    const tick = () => {
      void fetch(ROWS_PATH).then(async (r) => {
        if (!alive) return
        if (r.ok) setRows(await r.json() as MeterRowDto[])
      }).catch(() => { /* transient transport errors render as the previous state */ })
    }
    tick()
    const timer = window.setInterval(tick, POLL_MS)
    return () => { alive = false; window.clearInterval(timer) }
  }, [])

  return (
    <div>
      <p className="rt-usage-note">{t('autoRefresh')}</p>
      <SessionUsageTable rows={rows} t={t} />
    </div>
  )
}
