/**
 * Theme Studio panel — customize the dsh UI appearance.
 *
 * This is a pure view. It does not touch `ctx.theme` or the DOM; every write
 * goes through the bridge installed by `client/index.tsx`, so there is exactly
 * one path from a preference to the host theme, and unloading the plugin
 * restores the host exactly.
 *
 * The preview renders with real dsh tokens, not fallbacks: a wrong token looks
 * wrong in the preview too, instead of being masked by a hardcoded color.
 *
 * Border radius is intentionally absent — dsh hardcodes radius per component
 * and ships no radius token, so there is no honest way to offer that control.
 *
 * @module client/view
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import type { FontFamily, ThemePreferences } from '../types.js'
import { DEFAULT_PREFERENCES } from '../types.js'
import { loadPreferences, savePreferences } from './preferences.js'
import { DENSITY_FONT_SIZE, densityForFontSize } from '../tokens.js'
import { PRESETS } from '../themes.js'
import { exportTheme, parseTheme } from '../io.js'
import { useApplyBridge } from './index.js'
import {
  Badge, Button, Card, ConfirmDialog, Field, Input, SectionTitle, Textarea,
  ToastProvider, useToast,
} from './ui.js'

/**
 * The translate seat the host injects for this plugin's namespace, taken from the
 * official type so the panel and its registration agree on one key domain.
 */
export type Translate = TranslateNS<'theme-studio'>
export interface PanelProps { t: Translate }

/**
 * Which half of the theme pair a control is editing. dsh declares a palette per
 * mode, so the preset picker chooses a theme for one mode at a time rather than
 * forcing one choice onto both.
 */
type PresetSide = 'light' | 'dark'

/**
 * The density presets the panel offers, in display order — the whole 12..17px
 * range `setFontSize` accepts, so the panel can address every size the official
 * Appearance stepper can rather than only the three the plugin shipped with.
 */
const DENSITY_OPTIONS = ['tight', 'compact', 'comfortable', 'relaxed', 'spacious', 'maximum'] as const
type DensityKey = typeof DENSITY_OPTIONS[number]

/** The template key for one density's label. */
type DensityLabelKey = `density_${DensityKey}`

// ─── Preset card ───────────────────────────────────────────────
/**
 * A miniature page painted in one preset's own colors.
 *
 * A preset is a full palette per mode, and this is what shows it: the grid used
 * to reduce each theme to two accent dots, which said nothing about the surfaces,
 * labels and borders that actually make a theme read differently. Tokens the
 * preset does not define falls back to the same name read live from dsh itself,
 * so the "None (use default)" card previews the host's palette rather than a
 * guess.
 */
function PresetPane({ tokens, dark }: {
  tokens: Record<string, string>
  dark: boolean
}): ReactNode {
  const color = (name: string): string => tokens[name] ?? `var(${name})`
  return (
    <div style={{ flex: 1, padding: '7px 8px', background: color('--dsw-alias-bg-base') }}>
      <div style={{ height: 5, width: '55%', borderRadius: 3, background: color('--dsw-alias-label-primary') }} />
      <div
        style={{
          marginTop: 6, padding: '5px 6px', borderRadius: 5,
          background: color('--dsw-alias-bg-layer-2'),
          border: `1px solid ${color('--dsw-alias-border-l2')}`,
        }}
      >
        <div style={{ height: 4, width: '80%', borderRadius: 2, background: color('--dsw-alias-label-secondary') }} />
        <div
          style={{
            height: 4, width: '45%', borderRadius: 2, marginTop: 4,
            background: color('--dsw-alias-label-tertiary'),
          }}
        />
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          <span
            style={{
              display: 'block', height: 8, width: 24, borderRadius: 4,
              background: color('--dsw-alias-button-primary-fill'),
            }}
          />
          <span
            style={{
              display: 'block', height: 8, width: 14, borderRadius: 4,
              background: color('--dsw-alias-link'),
            }}
          />
        </div>
      </div>
      <span
        style={{
          display: 'block', marginTop: 5, fontSize: 9, opacity: 0.5,
          color: color('--dsw-alias-label-caption'),
        }}
      >
        {dark ? '🌙' : '☀'}
      </span>
    </div>
  )
}

function PresetCard({ preset, selected, onClick }: {
  preset: { name: string; description: string; tokens: Record<string, string>; darkTokens?: Record<string, string> }
  selected: boolean
  onClick: () => void
}): ReactNode {
  return (
    <div
      onClick={onClick}
      style={{
        cursor: 'pointer', borderRadius: 10, padding: 12,
        border: selected
          ? '2px solid var(--dsw-alias-brand-primary)'
          : '1px solid var(--dsw-alias-border-l2)',
        background: selected ? 'var(--dsw-alias-interactive-bg-hover-accent)' : 'transparent',
        transition: 'all 0.15s ease',
      }}
    >
      <div
        style={{
          display: 'flex', height: 56, marginBottom: 8, borderRadius: 7,
          overflow: 'hidden', border: '1px solid var(--dsw-alias-border-l2)',
        }}
      >
        <PresetPane tokens={preset.tokens} dark={false} />
        <PresetPane tokens={preset.darkTokens ?? {}} dark />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <strong style={{ fontSize: 13 }}>{preset.name}</strong>
        {selected && <Badge color="success">✓</Badge>}
      </div>
      <div style={{ fontSize: 11, opacity: 0.65, lineHeight: 1.4 }}>{preset.description}</div>
    </div>
  )
}

// ─── Segmented control ─────────────────────────────────────────
/**
 * A row of mutually exclusive buttons.
 *
 * `value` may be an empty string, which selects nothing — the density row needs
 * that because the host's font size is not required to match one of the presets
 * (the user can pick 15px or 17px in the official Appearance control).
 */
function Segmented<T extends string>({ value, options, onChange }: {
  value: T | ''
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}): ReactNode {
  return (
    <div style={{
      display: 'inline-flex', borderRadius: 8, overflow: 'hidden',
      border: '1px solid var(--dsw-alias-border-l2)',
    }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          style={{
            cursor: 'pointer', border: 'none', padding: '7px 16px',
            fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
            background: value === opt.value ? 'var(--dsw-alias-button-primary-fill)' : 'transparent',
            color: value === opt.value
              ? 'var(--dsw-alias-label-primary-inverted)'
              : 'inherit',
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
          border: '1px solid var(--dsw-alias-border-l2)',
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
          {([
            ['accent', 'var(--dsw-alias-state-business-primary)'],
            ['button', 'var(--dsw-alias-button-primary-fill)'],
            ['label', 'var(--dsw-alias-label-primary)'],
            ['surface', 'var(--dsw-alias-bg-layer-1)'],
          ] as const).map(([label, token]) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <i style={{
                width: 18, height: 18, borderRadius: 4, display: 'block',
                background: token,
                border: '1px solid var(--dsw-alias-border-l2)',
              }} />
              {label}
            </span>
          ))}
        </div>

        <div style={{
          padding: 12, borderRadius: 10,
          border: '1px solid var(--dsw-alias-border-l2)',
          background: 'var(--dsw-alias-bg-layer-1)',
        }}>
          <div
            style={{
              fontSize: 'var(--dsh-content-font-size)',
              fontFamily: 'var(--dsw-font-family)',
              marginBottom: 10,
            }}
          >
            {t('text')}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{
              display: 'inline-block', padding: '7px 16px', borderRadius: 7,
              background: 'var(--dsw-alias-button-primary-fill)',
              color: 'var(--dsw-alias-label-primary-inverted)',
              fontSize: 13,
            }}>
              {t('button')}
            </span>
            <span style={{
              display: 'inline-block', padding: '7px 16px', borderRadius: 7,
              border: '1px solid var(--dsw-alias-border-l2)',
              fontSize: 13,
            }}>
              {t('link')}
            </span>
            <a
              href="#preview"
              onClick={(e) => e.preventDefault()}
              style={{ color: 'var(--dsw-alias-link)', fontSize: 13 }}
            >
              {t('link')}
            </a>
          </div>
        </div>

        {accentApplied !== null && (
          <div style={{ fontSize: 11, opacity: 0.6, fontFamily: 'var(--dsw-font-mono)' }}>
            {t('accentApplying')} {accentApplied}
          </div>
        )}
      </div>
    </Card>
  )
}

// ─── Main panel ────────────────────────────────────────────────
function ThemePanelInner({ t }: PanelProps): ReactNode {
  const toast = useToast()
  const bridge = useApplyBridge()
  const [prefs, setPrefs] = useState<ThemePreferences>(loadPreferences)
  const [dark, setDark] = useState(() => bridge.isDark())
  // The font size lives in the host, not in our storage, so it is read from the
  // service on every render pass rather than mirrored into preferences. Two
  // copies could disagree; this one cannot.
  const [fontSize, setFontSize] = useState(() => bridge.fontSize())
  const [contrastAdjusted, setContrastAdjusted] = useState(false)
  const [accentApplied, setAccentApplied] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [presetSide, setPresetSide] = useState<PresetSide>('light')
  const [importText, setImportText] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)

  // A single effect owns every token write: publish through the bridge, persist,
  // and refresh the panel's view of what is in effect.
  useEffect(() => {
    const result = bridge(prefs)
    savePreferences(prefs)
    setContrastAdjusted(result.contrastAdjusted)
    const current = bridge.isDark()
    setDark(current)
    setAccentApplied(current ? result.accent.dark : result.accent.light)
    // The write itself is the host's to perform, so confirm it landed on the next
    // frame instead of assuming: a token dsh kept, or a presenter that never ran,
    // would leave this panel showing a theme the rest of the app never got.
    const frame = requestAnimationFrame(() => {
      const { missing } = bridge.verify()
      if (missing.length > 0) toast('error', `${t('writeBackFailed')}: ${missing.join(', ')}`)
    })
    return () => cancelAnimationFrame(frame)
  }, [prefs, bridge])

  // The host can change the theme independently — the Appearance preference, the
  // OS while the preference is `system`, or a font-size edit in the official row
  // — so follow the service's notification rather than polling the DOM for it.
  // This is also what keeps the density buttons highlighted when the user
  // changes the size in the official control instead of here.
  useEffect(() => bridge.subscribe((next) => {
    setDark(next.dark)
    setFontSize(next.fontSize)
    setAccentApplied(next.dark
      ? (prefs.darkAccentColor ?? prefs.accentColor)
      : prefs.accentColor)
  }), [bridge, prefs.accentColor, prefs.darkAccentColor])

  const update = useCallback(<K extends keyof ThemePreferences>(key: K, value: ThemePreferences[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }))
  }, [])

  /** Which preset field the grid below writes: one picker per mode. */
  const presetField = presetSide === 'light' ? 'preset' : 'darkPreset'

  const handleReset = useCallback(() => {
    // The bridge also restores the font size the host had before this panel
    // first changed it, so a reset returns the official control to its value.
    bridge.reset()
    setPrefs({ ...DEFAULT_PREFERENCES })
    setFontSize(bridge.fontSize())
    setConfirmReset(false)
    toast('success', t('resetted'))
  }, [bridge, t, toast])

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

  // Which preset, if any, the host's current font size corresponds to. Read from
  // the live value rather than a stored field, so the highlight follows the
  // official Appearance stepper too — including to nothing at all when the user
  // picked a size between presets.
  const currentDensity = densityForFontSize(fontSize)
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <Segmented<PresetSide>
          value={presetSide}
          onChange={setPresetSide}
          options={[
            { value: 'light', label: `☀ ${t('presetSideLight')}` },
            { value: 'dark', label: `🌙 ${t('presetSideDark')}` },
          ]}
        />
        <span style={{ fontSize: 11, opacity: 0.55 }}>{t('presetSideHint')}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
        <PresetCard
          preset={{
            name: presetSide === 'light' ? t('noPreset') : t('noPresetDark'),
            description: '',
            tokens: {},
          }}
          selected={prefs[presetField] === null}
          onClick={() => update(presetField, null)}
        />
        {PRESETS.map((p) => (
          <PresetCard
            key={p.id}
            preset={p}
            selected={prefs[presetField] === p.id}
            onClick={() => update(presetField, p.id)}
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
      {/* Highlights whichever preset matches the host's current font size, or
          nothing when the user picked a size that is not one of them. Writing
          goes through ctx.theme.setFontSize, so the official Appearance stepper
          stays in step rather than being shadowed. */}
      <Segmented<DensityKey>
        value={currentDensity ?? ''}
        onChange={(v) => {
          bridge.setFontSize(DENSITY_FONT_SIZE[v])
          setFontSize(DENSITY_FONT_SIZE[v])
        }}
        options={DENSITY_OPTIONS.map((value) => ({ value, label: t(`density_${value}` as DensityLabelKey) }))}
      />
      <div style={{ fontSize: 11, opacity: 0.55, marginTop: -8 }}>
        {t('densityHint', { px: fontSize })}
      </div>

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
