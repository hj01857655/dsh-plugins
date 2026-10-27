/**
 * Browser half of dsh-context-meter: its page inside Settings.
 *
 * Two services are injected by their runtime identity: the settings shell is `slots`, the
 * dictionary registry is `locale`. The panel polls the host route every two seconds while
 * mounted so occupancy tracks the live log without a manual refresh.
 *
 * @module client
 */

import { useEffect, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client'

import { NS, en, zh } from './locales.js'
import { ContextMeterPanel } from './view.js'
import type { MeterPanelDto } from './view.js'

export const inject = ['slots', 'locale']

const PANEL_PATH = '/api/context-meter.panel'
const POLL_MS = 2000

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
    ContextMeterSection,
  ))
}

function ContextMeterSection(_props: SettingsSectionOwnerProps): JSX.Element {
  const t = useT()
  const [panel, setPanel] = useState<MeterPanelDto | undefined>(undefined)

  useEffect(() => {
    let alive = true
    const tick = () => {
      void fetch(PANEL_PATH).then(async (r) => {
        if (!alive) return
        if (r.ok) setPanel(await r.json() as MeterPanelDto)
      }).catch(() => { /* transient transport errors render as the previous state */ })
    }
    tick()
    const timer = window.setInterval(tick, POLL_MS)
    return () => { alive = false; window.clearInterval(timer) }
  }, [])

  return <ContextMeterPanel panel={panel} t={t} />
}
