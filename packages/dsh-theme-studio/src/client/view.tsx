/**
 * Theme Studio panel — customize the dsh UI appearance.
 *
 * All state is client-side: preferences persist in localStorage and are applied
 * by setting CSS custom properties on document.documentElement.style.
 *
 * @module client/view
 */

import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import type { Density, FontFamily, Radius, ThemePreferences } from '../types.js'
import { DEFAULT_PREFERENCES, STORAGE_KEY } from '../types.js'
import {
  DENSITY_TOKENS, FONT_TOKENS, PRESETS, RADIUS_TOKENS, getPreset,
} from '../themes.js'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, SectionTitle,
  Textarea, ToastProvider, useToast,
} from './ui.js'

export type Translate = (key: string, params?: Record<string, unknown>) => string
export interface PanelProps { t: Translate }

// ─── Persistence ───────────────────────────────────────────────
function loadPreferences(): ThemePreferences {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PREFERENCES }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return { ...DEFAULT_PREFERENCES }
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) as Partial<ThemePreferences> }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

function savePreferences(prefs: ThemePreferences): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

// ─── Apply theme to DOM ────────────────────────────────────────
function applyTheme(prefs: ThemePreferences): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const allTokens: Record<string, string> = {}

  // Preset
  if (prefs.preset !== null) {
    const preset = getPreset(prefs.preset)
    if (preset !== undefined) Object.assign(allTokens, preset.tokens)
  }

  // Accent color
  if (prefs.accentColor !== null && prefs.accentColor.trim() !== '') {
    allTokens['--accent'] = prefs.accentColor
  }

  // Density
  Object.assign(allTokens, DENSITY_TOKENS[prefs.density] ?? {})
  // Radius
  Object.assign(allTokens, RADIUS_TOKENS[prefs.radius] ?? {})
  // Font
  Object.assign(allTokens, FONT_TOKENS[prefs.fontFamily] ?? {})

  // Apply all tokens
  for (const [prop, value] of Object.entries(allTokens)) {
    root.style.setProperty(prop, value)
  }

  // Custom CSS — parse `--property: value;` lines
  if (prefs.customCss.trim() !== '') {
    for (const line of prefs.customCss.split('\n')) {
      const match = line.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*;?\s*$/)
      if (match !== null) {
        root.style.setProperty(match[1], match[2])
      }
    }
  }
}

/** Remove all previously applied custom properties. */
function clearTheme(): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const known = new Set<string>([
    '--accent', '--accent-hover',
    '--dsh-content-font-size', '--dsh-spacing-unit',
    '--dsh-radius-small', '--dsh-radius-medium', '--dsh-radius-large',
    '--dsh-font-family',
    '--dsw-alias-state-business-primary', '--dsw-alias-state-business-secondary',
    '--dsw-alias-interactive-bg-hover',
  ])
  for (const prop of known) root.style.removeProperty(prop)
  // Also clear any from custom CSS
  const prefs = loadPreferences()
  if (prefs.customCss.trim() !== '') {
    for (const line of prefs.customCss.split('\n')) {
      const match = line.match(/^\s*(--[\w-]+)\s*:/)
      if (match !== null) root.style.removeProperty(match[1])
    }
  }
}

// ─── Preset card ───────────────────────────────────────────────
function PresetCard({ preset, selected, onClick }: {
  preset: { id: string; name: string; description: string; tokens: Record<string, string> }
  selected: boolean
  onClick: () => void
}): ReactNode {
  const accent = preset.tokens['--accent'] ?? '#4B8BBE'
  return (
    <div
      onClick={onClick}
      style={{
        cursor: 'pointer', borderRadius: 10, padding: 12,
        border: selected ? '2px solid var(--accent, #4B8BBE)' : '1px solid var(--border, rgba(128,128,128,0.2))',
        background: selected ? 'rgba(75,139,190,0.06)' : 'var(--bg-secondary, rgba(128,128,128,0.04))',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ width: 16, height: 16, borderRadius: '50%', background: accent, border: '1px solid rgba(128,128,128,0.2)' }} />
        <strong style={{ fontSize: 13 }}>{preset.name}</strong>
        {selected && <Badge color="info">✓</Badge>}
      </div>
      <div style={{ fontSize: 11, opacity: 0.6 }}>{preset.description}</div>
    </div>
  )
}

// ─── Segmented control ─────────────────────────────────────────
function Segmented<T extends string>({ value, options, onChange }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}): ReactNode {
  return (
    <div style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border, rgba(128,128,128,0.2))' }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          style={{
            cursor: 'pointer', border: 'none', padding: '7px 16px',
            fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
            background: value === opt.value ? 'var(--accent, #4B8BBE)' : 'transparent',
            color: value === opt.value ? '#fff' : 'var(--text-primary, inherit)',
            transition: 'all 0.15s ease',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Preview area ──────────────────────────────────────────────
function PreviewArea({ t }: { t: Translate }): ReactNode {
  return (
    <Card title={t('preview')} icon="👁">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Badge color="info">Info</Badge>
          <Badge color="success">Success</Badge>
          <Badge color="warning">Warning</Badge>
          <Badge color="error">Error</Badge>
        </div>
        <Card>
          <div style={{ fontSize: 13, marginBottom: 8 }}>{t('text')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" size="sm">{t('button')}</Button>
            <Button variant="secondary" size="sm">Secondary</Button>
            <Button variant="danger" size="sm">Danger</Button>
          </div>
        </Card>
      </div>
    </Card>
  )
}

// ─── Main panel ────────────────────────────────────────────────
function ThemePanelInner({ t }: PanelProps): ReactNode {
  const toast = useToast()
  const [prefs, setPrefs] = useState<ThemePreferences>(loadPreferences)
  const [confirmReset, setConfirmReset] = useState(false)

  // Apply theme on mount and whenever prefs change
  useEffect(() => {
    applyTheme(prefs)
    savePreferences(prefs)
  }, [prefs])

  const update = useCallback(<K extends keyof ThemePreferences>(key: K, value: ThemePreferences[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }))
  }, [])

  const handleReset = useCallback(() => {
    clearTheme()
    setPrefs({ ...DEFAULT_PREFERENCES })
    toast('success', t('resetted'))
  }, [t, toast])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 820 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <strong style={{ fontSize: 15 }}>🎨 {t('title')}</strong>
        <span style={{ fontSize: 12, opacity: 0.6 }}>{t('subtitle')}</span>
        <span style={{ flex: 1 }} />
        <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>↺ {t('reset')}</Button>
      </header>

      {/* Preset themes */}
      <SectionTitle icon="🎭">{t('presetSection')}</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
        <PresetCard
          preset={{ id: 'none', name: t('noPreset'), description: '', tokens: {} }}
          selected={prefs.preset === null}
          onClick={() => update('preset', null)}
        />
        {PRESETS.map((p) => (
          <PresetCard
            key={p.id}
            preset={p}
            selected={prefs.preset === p.id}
            onClick={() => update('preset', p.id)}
          />
        ))}
      </div>

      {/* Accent color */}
      <SectionTitle icon="🌈">{t('accentSection')}</SectionTitle>
      <Card>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="color"
            value={prefs.accentColor ?? '#4B8BBE'}
            onChange={(e) => update('accentColor', e.target.value)}
            style={{ width: 40, height: 40, cursor: 'pointer', borderRadius: 8, border: '1px solid var(--border, rgba(128,128,128,0.2))' }}
          />
          <Input
            value={prefs.accentColor ?? ''}
            onChange={(e) => update('accentColor', e.target.value || null)}
            placeholder={t('accentPlaceholder')}
            style={{ maxWidth: 200 }}
          />
          {prefs.accentColor !== null && (
            <Button variant="ghost" size="sm" onClick={() => update('accentColor', null)}>✕</Button>
          )}
        </div>
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>{t('accentHint')}</div>
      </Card>

      {/* Density */}
      <SectionTitle icon="📐">{t('densitySection')}</SectionTitle>
      <Segmented<Density>
        value={prefs.density}
        onChange={(v) => update('density', v)}
        options={[
          { value: 'compact', label: t('densityCompact') },
          { value: 'comfortable', label: t('densityComfortable') },
          { value: 'spacious', label: t('densitySpacious') },
        ]}
      />

      {/* Radius */}
      <SectionTitle icon="⬜">{t('radiusSection')}</SectionTitle>
      <Segmented<Radius>
        value={prefs.radius}
        onChange={(v) => update('radius', v)}
        options={[
          { value: 'sharp', label: t('radiusSharp') },
          { value: 'rounded', label: t('radiusRounded') },
          { value: 'soft', label: t('radiusSoft') },
        ]}
      />

      {/* Font family */}
      <SectionTitle icon="🔤">{t('fontSection')}</SectionTitle>
      <Segmented<FontFamily>
        value={prefs.fontFamily}
        onChange={(v) => update('fontFamily', v)}
        options={[
          { value: 'system', label: t('fontSystem') },
          { value: 'mono', label: t('fontMono') },
          { value: 'serif', label: t('fontSerif') },
        ]}
      />

      {/* Custom CSS */}
      <SectionTitle icon="✏️">{t('customCssSection')}</SectionTitle>
      <Card>
        <Field label={t('customCssSection')} hint={t('customCssHint')}>
          <Textarea
            value={prefs.customCss}
            onChange={(e) => update('customCss', e.target.value)}
            placeholder={t('customCssPlaceholder')}
            rows={4}
          />
        </Field>
      </Card>

      {/* Preview */}
      <PreviewArea t={t} />

      {confirmReset && (
        <ConfirmDialog
          title={t('reset')}
          message={t('resetConfirm')}
          confirmLabel={t('reset')}
          danger
          onConfirm={handleReset}
          onClose={() => setConfirmReset(false)}
        />
      )}
    </div>
  )
}

export function ThemePanel({ t }: PanelProps): ReactNode {
  return <ToastProvider><ThemePanelInner t={t} /></ToastProvider>
}
