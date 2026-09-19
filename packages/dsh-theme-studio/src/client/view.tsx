/**
 * Theme Studio panel — customize the dsh UI appearance.
 *
 * Every control here writes real dsh design tokens; see `src/tokens.ts` for why
 * that constraint exists. The preview is deliberately NOT a separate mock: it
 * renders with the same variable names the app uses, so if a token is wrong the
 * preview looks wrong too, instead of masking the mistake.
 *
 * Border radius is intentionally absent. dsh hardcodes radius per component and
 * ships no radius token, so there is no honest way to offer that control.
 *
 * @module client/view
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import type { Density, FontFamily, ThemePreferences } from '../types.js'
import { DEFAULT_PREFERENCES, STORAGE_KEY } from '../types.js'
import { DENSITY_TOKENS, FONT_TOKENS, VERIFIED_TOKENS } from '../tokens.js'
import { PRESETS, getPreset } from '../themes.js'
import {
  applyTheme, isDarkMode, observeDarkMode, resetTheme, resolveAccent,
} from '../apply.js'
import { exportTheme, parseTheme } from '../io.js'
import {
  Badge, Button, Card, ConfirmDialog, Field, Input, SectionTitle, Textarea,
  ToastProvider, useToast,
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

// ─── Preset card ───────────────────────────────────────────────
function PresetCard({ preset, selected, onClick }: {
  preset: { id: string; name: string; description: string; tokens: Record<string, string>; darkTokens?: Record<string, string> }
  selected: boolean
  onClick: () => void
}): ReactNode {
  const accent = preset.tokens['--dsw-alias-state-business-primary'] ?? '#4d6bfe'
  const darkAccent = preset.darkTokens?.['--dsw-alias-state-business-primary']
  return (
    <div
      onClick={onClick}
      style={{
        cursor: 'pointer', borderRadius: 10, padding: 12,
        border: selected ? `2px solid ${accent}` : '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))',
        background: selected ? 'var(--dsw-alias-interactive-bg-hover-accent, rgba(77,107,254,0.08))' : 'transparent',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ display: 'flex', gap: 3 }}>
          <i style={{ width: 14, height: 14, borderRadius: '50%', background: accent, display: 'block' }} />
          {darkAccent !== undefined && (
            <i style={{ width: 14, height: 14, borderRadius: '50%', background: darkAccent, display: 'block' }} />
          )}
        </span>
        <strong style={{ fontSize: 13 }}>{preset.name}</strong>
        {selected && <Badge color="success">✓</Badge>}
      </div>
      <div style={{ fontSize: 11, opacity: 0.65, lineHeight: 1.4 }}>{preset.description}</div>
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
    <div style={{
      display: 'inline-flex', borderRadius: 8, overflow: 'hidden',
      border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))',
    }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          style={{
            cursor: 'pointer', border: 'none', padding: '7px 16px',
            fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
            background: value === opt.value
              ? 'var(--dsw-alias-button-primary-fill, #4d6bfe)'
              : 'transparent',
            color: value === opt.value ? '#fff' : 'inherit',
            transition: 'all 0.15s ease',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Color row ─────────────────────────────────────────────────
function ColorRow({ value, onChange, placeholder }: {
  value: string | null
  onChange: (v: string | null) => void
  placeholder: string
}): ReactNode {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <input
        type="color"
        value={value ?? '#4d6bfe'}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: 40, height: 40, cursor: 'pointer', borderRadius: 8,
          border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))',
        }}
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

// ─── Preview ───────────────────────────────────────────────────
/**
 * Renders real dsh tokens, not fallbacks: a swatch that reads
 * `var(--dsw-alias-state-business-primary)` shows the same value every other
 * component gets, which is the whole point of the preview.
 */
function PreviewArea({ t, dark, accentApplied }: {
  t: Translate
  dark: boolean
  accentApplied: string | null
}): ReactNode {
  return (
    <Card
      title={t('preview')}
      icon="👁"
      actions={<Badge color={dark ? 'info' : 'warning'}>{dark ? '🌙 dark' : '☀ light'}</Badge>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <i style={{
              width: 18, height: 18, borderRadius: 4, display: 'block',
              background: 'var(--dsw-alias-state-business-primary, #4d6bfe)',
            }} />
            accent
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <i style={{
              width: 18, height: 18, borderRadius: 4, display: 'block',
              background: 'var(--dsw-alias-button-primary-fill, #4d6bfe)',
            }} />
            button
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <i style={{
              width: 18, height: 18, borderRadius: 4, display: 'block',
              background: 'var(--dsw-alias-label-primary, currentColor)',
            }} />
            label
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <i style={{
              width: 18, height: 18, borderRadius: 4, display: 'block',
              background: 'var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.1))',
              border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))',
            }} />
            surface
          </span>
        </div>

        <div style={{
          padding: 12, borderRadius: 10,
          border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))',
          background: 'var(--dsw-alias-bg-layer-1, transparent)',
        }}>
          <div
            style={{
              fontSize: 'var(--dsh-content-font-size, 14px)',
              fontFamily: 'var(--dsw-font-family, inherit)',
              marginBottom: 10,
            }}
          >
            {t('text')}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{
              display: 'inline-block', padding: '7px 16px', borderRadius: 7,
              background: 'var(--dsw-alias-button-primary-fill, #4d6bfe)',
              color: 'var(--dsw-alias-label-primary-inverted, #fff)',
              fontSize: 13,
            }}>
              {t('button')}
            </span>
            <span style={{
              display: 'inline-block', padding: '7px 16px', borderRadius: 7,
              border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))',
              fontSize: 13,
            }}>
              {t('link')}
            </span>
            <a
              href="#preview"
              onClick={(e) => e.preventDefault()}
              style={{ color: 'var(--dsw-alias-link, #4d6bfe)', fontSize: 13 }}
            >
              {t('link')}
            </a>
          </div>
        </div>

        {accentApplied !== null && (
          <div style={{ fontSize: 11, opacity: 0.6, fontFamily: 'var(--dsw-font-mono, monospace)' }}>
            {t('accentApplying')} {accentApplied}
          </div>
        )}
      </div>
    </Card>
  )
}

// ─── Token coverage note ───────────────────────────────────────
function TokenCoverage({ t }: { t: Translate }): ReactNode {
  return (
    <div style={{ fontSize: 11, opacity: 0.55, lineHeight: 1.5 }}>
      {t('tokenNote', { count: VERIFIED_TOKENS.length })}
    </div>
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

  useEffect(() => {
    setContrastAdjusted(applyTheme(prefs, dark))
    savePreferences(prefs)
  }, [prefs, dark])

  useEffect(() => observeDarkMode(setDark), [])
  // Apply once more when the panel closes so the value dsh's own bootstrap may
  // have rewritten on body is still ours.
  useEffect(() => () => { applyTheme(loadPreferences(), isDarkMode()) }, [])

  const update = useCallback(<K extends keyof ThemePreferences>(key: K, value: ThemePreferences[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }))
  }, [])

  const handleReset = useCallback(() => {
    resetTheme()
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

  const { accent: accentApplied } = resolveAccent(prefs, dark)

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

      <SectionTitle icon="🌈">{t('accentSection')}</SectionTitle>
      <Card>
        <ColorRow
          value={prefs.accentColor}
          onChange={(v) => update('accentColor', v)}
          placeholder={t('accentPlaceholder')}
        />
        <div style={{ fontSize: 11, opacity: 0.55, marginTop: 6 }}>{t('accentHint')}</div>

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
          <label htmlFor="theme-animations" style={{ fontSize: 13, cursor: 'pointer' }}>
            {t('animations')}
          </label>
        </div>
        <div style={{ fontSize: 11, opacity: 0.55, marginTop: 6, marginLeft: 26 }}>
          {t('animationsHint')}
        </div>
      </Card>

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

      <PreviewArea t={t} dark={dark} accentApplied={accentApplied} />

      <TokenCoverage t={t} />

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
