/**
 * Theme Studio panel — customize the dsh UI appearance.
 *
 * All state is client-side: preferences persist in localStorage and are applied
 * by setting CSS custom properties on document.documentElement.style.
 *
 * @module client/view
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import type { Density, FontFamily, Radius, ThemePreferences } from '../types.js'
import { DEFAULT_PREFERENCES, STORAGE_KEY } from '../types.js'
import {
  ANIMATION_OFF_TOKENS, ANIMATION_ON_TOKENS, DENSITY_TOKENS, FONT_TOKENS,
  PRESETS, RADIUS_TOKENS, getPreset,
} from '../themes.js'
import { ensureDarkContrast, exportTheme, parseTheme } from '../io.js'
import {
  Badge, Button, Card, ConfirmDialog, Field, Input, SectionTitle, Textarea,
  ToastProvider, useToast,
} from './ui.js'

export type Translate = (key: string, params?: Record<string, unknown>) => string
export interface PanelProps { t: Translate }

/** Every property this plugin may set, so a reset can remove exactly those. */
const MANAGED_PROPERTIES = [
  '--accent', '--accent-hover',
  '--dsh-content-font-size', '--dsh-spacing-unit',
  '--dsh-radius-small', '--dsh-radius-medium', '--dsh-radius-large',
  '--dsh-font-family',
  '--dsh-transition-fast', '--dsh-transition-normal',
  '--dsw-alias-state-business-primary', '--dsw-alias-state-business-secondary',
  '--dsw-alias-interactive-bg-hover',
] as const

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

// ─── Dark mode detection ───────────────────────────────────────
/** dsh's theme plugin marks dark mode with this attribute on <body>. */
export function isDarkMode(): boolean {
  if (typeof document === 'undefined') return false
  return document.body.hasAttribute('data-ds-dark-theme')
}

/** Watch the dark-mode attribute; returns an unsubscribe function. */
export function observeDarkMode(onChange: (dark: boolean) => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {}
  }
  const observer = new MutationObserver(() => onChange(isDarkMode()))
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  return () => observer.disconnect()
}

// ─── Token resolution ──────────────────────────────────────────
/**
 * Resolve the complete token map to apply for a given preference set.
 *
 * Pure: takes `dark` as an argument rather than reading the DOM, so the panel
 * and the tests agree on what a given state renders.
 */
export function resolveTokens(prefs: ThemePreferences, dark: boolean): {
  tokens: Record<string, string>
  contrastAdjusted: boolean
} {
  const tokens: Record<string, string> = {}
  let contrastAdjusted = false

  const preset = prefs.preset !== null ? getPreset(prefs.preset) : undefined
  if (preset !== undefined) {
    Object.assign(tokens, preset.tokens)
    if (dark && preset.darkTokens !== undefined) Object.assign(tokens, preset.darkTokens)
  }

  // Accent: the dark-specific pick wins in dark mode, otherwise the shared one.
  const chosenAccent = dark
    ? (prefs.darkAccentColor ?? prefs.accentColor)
    : prefs.accentColor

  if (chosenAccent !== null && chosenAccent.trim() !== '') {
    let accent = chosenAccent
    if (dark) {
      const guarded = ensureDarkContrast(accent)
      accent = guarded.color
      contrastAdjusted = guarded.adjusted
    }
    tokens['--accent'] = accent
  }

  Object.assign(tokens, DENSITY_TOKENS[prefs.density] ?? {})
  Object.assign(tokens, RADIUS_TOKENS[prefs.radius] ?? {})
  Object.assign(tokens, FONT_TOKENS[prefs.fontFamily] ?? {})
  Object.assign(tokens, prefs.animations ? ANIMATION_ON_TOKENS : ANIMATION_OFF_TOKENS)

  return { tokens, contrastAdjusted }
}

/** Parse `--property: value;` lines from the custom CSS textarea. */
export function parseCustomCss(css: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of css.split('\n')) {
    const match = line.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*;?\s*$/)
    if (match !== null) out[match[1]] = match[2]
  }
  return out
}

/** Apply a preference set to the document root. Returns whether contrast was raised. */
export function applyTheme(prefs: ThemePreferences, dark = isDarkMode()): boolean {
  if (typeof document === 'undefined') return false
  const root = document.documentElement
  const { tokens, contrastAdjusted } = resolveTokens(prefs, dark)

  const custom = parseCustomCss(prefs.customCss)
  const merged = { ...tokens, ...custom }

  // Remove managed properties that this pass no longer sets, so switching off
  // a preset actually clears its colors instead of leaving them behind.
  for (const prop of MANAGED_PROPERTIES) {
    if (!(prop in merged)) root.style.removeProperty(prop)
  }
  for (const [prop, value] of Object.entries(merged)) root.style.setProperty(prop, value)

  return contrastAdjusted
}

/** Remove every property this plugin manages. */
function clearTheme(): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  for (const prop of MANAGED_PROPERTIES) root.style.removeProperty(prop)
}

// ─── Preset card ───────────────────────────────────────────────
function PresetCard({ preset, selected, onClick }: {
  preset: { id: string; name: string; description: string; tokens: Record<string, string>; darkTokens?: Record<string, string> }
  selected: boolean
  onClick: () => void
}): ReactNode {
  const accent = preset.tokens['--accent'] ?? '#4B8BBE'
  const secondary = preset.tokens['--dsw-alias-state-business-secondary'] ?? '#e5e5e5'
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ display: 'flex', gap: 3 }}>
          <div style={{ width: 14, height: 14, borderRadius: '50%', background: accent, border: '1px solid rgba(128,128,128,0.2)' }} />
          <div style={{ width: 14, height: 14, borderRadius: '50%', background: secondary, border: '1px solid rgba(128,128,128,0.2)' }} />
        </div>
        <strong style={{ fontSize: 13 }}>{preset.name}</strong>
        {preset.darkTokens !== undefined && <Badge color="info">◐</Badge>}
        {selected && <Badge color="success">✓</Badge>}
      </div>
      <div style={{ fontSize: 11, opacity: 0.6, lineHeight: 1.4 }}>{preset.description}</div>
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

// ─── Color picker row ──────────────────────────────────────────
function ColorRow({ value, onChange, placeholder }: {
  value: string | null
  onChange: (v: string | null) => void
  placeholder: string
}): ReactNode {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <input
        type="color"
        value={value ?? '#4B8BBE'}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 40, height: 40, cursor: 'pointer', borderRadius: 8, border: '1px solid var(--border, rgba(128,128,128,0.2))' }}
      />
      <Input
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value.trim() === '' ? null : e.target.value)}
        placeholder={placeholder}
        style={{ maxWidth: 200 }}
      />
      {value !== null && (
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>✕</Button>
      )}
    </div>
  )
}

// ─── Preview area ──────────────────────────────────────────────
function PreviewArea({ t, dark }: { t: Translate; dark: boolean }): ReactNode {
  return (
    <Card
      title={t('preview')}
      icon="👁"
      actions={<Badge color={dark ? 'info' : 'warning'}>{dark ? '🌙 dark' : '☀ light'}</Badge>}
    >
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
  const [dark, setDark] = useState(isDarkMode)
  const [contrastAdjusted, setContrastAdjusted] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [importText, setImportText] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)

  // Apply on every preference or dark-mode change.
  useEffect(() => {
    setContrastAdjusted(applyTheme(prefs, dark))
    savePreferences(prefs)
  }, [prefs, dark])

  // Follow the host theme plugin's dark-mode toggle.
  useEffect(() => observeDarkMode(setDark), [])

  const update = useCallback(<K extends keyof ThemePreferences>(key: K, value: ThemePreferences[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }))
  }, [])

  const handleReset = useCallback(() => {
    clearTheme()
    setPrefs({ ...DEFAULT_PREFERENCES })
    setConfirmReset(false)
    toast('success', t('resetted'))
  }, [t, toast])

  const handleExport = useCallback(() => {
    const json = exportTheme(prefs)
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
    if (clipboard === undefined) {
      setImportText(json)
      setImportOpen(true)
      toast('warning', t('exportFailed'))
      return
    }
    clipboard.writeText(json).then(
      () => toast('success', t('exportSuccess')),
      () => { setImportText(json); setImportOpen(true); toast('warning', t('exportFailed')) },
    )
  }, [prefs, t, toast])

  const runImport = useCallback((raw: string) => {
    const parsed = parseTheme(raw)
    if (parsed === null) {
      toast('error', t('importFailed'))
      return
    }
    setPrefs(parsed)
    setImportOpen(false)
    setImportText('')
    toast('success', t('importSuccess'))
  }, [t, toast])

  const handleFile = useCallback((file: File | undefined) => {
    if (file === undefined) return
    file.text().then(runImport, () => toast('error', t('importFailed')))
  }, [runImport, t, toast])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>🎨 {t('title')}</strong>
        <span style={{ fontSize: 12, opacity: 0.6 }}>{t('subtitle')}</span>
        <span style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onClick={handleExport}>⤴ {t('export')}</Button>
        <Button variant="secondary" size="sm" onClick={() => setImportOpen((v) => !v)}>⤵ {t('import')}</Button>
        <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>↺ {t('reset')}</Button>
      </header>

      {importOpen && (
        <Card title={t('import')} icon="⤵">
          <Field label={t('import')} hint={t('importHint')}>
            <Textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={t('importPlaceholder')}
              rows={5}
            />
          </Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Button
              variant="primary"
              size="sm"
              onClick={() => runImport(importText)}
              disabled={importText.trim() === ''}
            >
              {t('import')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
              📄 {t('importFile')}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = '' }}
            />
          </div>
        </Card>
      )}

      {/* Preset themes */}
      <SectionTitle icon="🎭">{t('presetSection')}</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
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
        <ColorRow
          value={prefs.accentColor}
          onChange={(v) => update('accentColor', v)}
          placeholder={t('accentPlaceholder')}
        />
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>{t('accentHint')}</div>

        <div style={{ height: 14 }} />
        <Field label={t('darkAccentSection')} hint={t('darkAccentHint')}>
          <ColorRow
            value={prefs.darkAccentColor}
            onChange={(v) => update('darkAccentColor', v)}
            placeholder={t('accentPlaceholder')}
          />
        </Field>
        {contrastAdjusted && (
          <div style={{ marginTop: 8 }}>
            <Badge color="warning">⚠ {t('preserveContrast')}</Badge>
          </div>
        )}
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

      {/* Behavior */}
      <SectionTitle icon="⚙">{t('behaviorSection')}</SectionTitle>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            id="theme-animations"
            type="checkbox"
            checked={prefs.animations}
            onChange={(e) => update('animations', e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <label htmlFor="theme-animations" style={{ fontSize: 13, cursor: 'pointer' }}>{t('animations')}</label>
        </div>
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 6, marginLeft: 26 }}>{t('animationsHint')}</div>
      </Card>

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
      <PreviewArea t={t} dark={dark} />

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
