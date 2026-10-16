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

import type { FontFamily, ThemePreferences, TokenMode, TokenValues } from '../types.js'
import { DEFAULT_PREFERENCES, TOKEN_MODE_VALUES, normalizeCssValue } from '../types.js'
import { loadPreferences, savePreferences } from './preferences.js'
import { DENSITY_FONT_SIZE, TOKEN_GROUPS, VERIFIED_TOKENS, densityForFontSize } from '../tokens.js'
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
 * The density presets the panel offers, in display order — the whole 12..17px
 * range `setFontSize` accepts, so the panel can address every size the official
 * Appearance stepper can rather than only the three the plugin shipped with.
 */
const DENSITY_OPTIONS = ['tight', 'compact', 'comfortable', 'relaxed', 'spacious', 'maximum'] as const
type DensityKey = typeof DENSITY_OPTIONS[number]

/** The template key for one density's label. */
type DensityLabelKey = `density_${DensityKey}`

// ─── Preset card ───────────────────────────────────────────────
function PresetCard({ preset, selected, onClick }: {
  preset: { name: string; description: string; tokens: Record<string, string>; darkTokens?: Record<string, string> }
  selected: boolean
  onClick: () => void
}): ReactNode {
  const accent = preset.tokens['--dsw-alias-state-business-primary']
  const darkAccent = preset.darkTokens?.['--dsw-alias-state-business-primary']
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ display: 'flex', gap: 3 }}>
          {accent !== undefined && (
            <i style={{ width: 14, height: 14, borderRadius: '50%', background: accent, display: 'block' }} />
          )}
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

// ─── Token editor ──────────────────────────────────────────────
/** The template key for one token group's heading. */
type GroupLabelKey = `group${string}`

/** The part of a token name a user recognises: `--dsw-alias-bg-base` → `bg-base`. */
function tokenLabel(name: string): string {
  return name.replace(/^--dsh-/, '').replace(/^--dsw-(alias-)?/, '')
}

/**
 * One token: a swatch when the token holds a color, a text field for the value
 * itself (typography tokens hold font stacks and sizes), and a clear button.
 *
 * Edits commit on blur or Enter rather than per keystroke: a half-typed `#4d`
 * would be written into the override layer, come back as missing from the
 * write-back check on the next frame, and report a failure that is not one.
 */
function TokenRow({ t, name, value, color, onSet, onClear }: {
  t: Translate
  name: string
  value: string
  color: boolean
  onSet: (name: string, value: string) => void
  onClear: (name: string) => void
}): ReactNode {
  const toast = useToast()
  const [draft, setDraft] = useState(value)

  // Follow the stored value when it changes for a reason other than typing: an
  // import, a reset, or the same token edited from the other mode's tab.
  useEffect(() => { setDraft(value) }, [value])

  const commit = (): void => {
    const next = draft.trim()
    if (next === value) return
    if (next === '') { onClear(name); return }
    if (normalizeCssValue(next) === null) {
      toast('error', `${t('tokenInvalid')}: ${tokenLabel(name)}`)
      setDraft(value)
      return
    }
    onSet(name, next)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
      {color && (
        <input
          type="color"
          title={name}
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#4d6bfe'}
          onChange={(e) => { setDraft(e.target.value); onSet(name, e.target.value) }}
          style={{
            width: 26, height: 26, padding: 0, cursor: 'pointer',
            borderRadius: 6, border: '1px solid var(--dsw-alias-border-l2)',
            background: 'transparent',
          }}
        />
      )}
      <span
        title={name}
        style={{
          fontFamily: 'var(--dsw-font-mono)', fontSize: 12, width: 200,
          opacity: value === '' ? 0.55 : 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {tokenLabel(name)}
      </span>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
        placeholder={t('tokenNone')}
        style={{ maxWidth: 260 }}
      />
      {value !== '' && <Button variant="ghost" size="sm" onClick={() => onClear(name)}>✕</Button>}
    </div>
  )
}

/**
 * Every token this plugin may write, grouped, edited one mode at a time.
 *
 * Groups start collapsed so the section first reads as an inventory of what can
 * be themed; the counter on a heading (`2 / 8`) is what makes a deep edit
 * findable again on a later visit.
 */
function TokenEditor({ t, mode, overrides, onSet, onClear }: {
  t: Translate
  mode: TokenMode
  overrides: Record<string, TokenValues>
  onSet: (name: string, value: string) => void
  onClear: (name: string) => void
}): ReactNode {
  const [expanded, setExpanded] = useState<string | null>(null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {TOKEN_GROUPS.map((group) => {
        const open = expanded === group.label
        const changed = group.tokens.filter((name) => overrides[name]?.[mode] !== undefined).length
        return (
          <div key={group.label} style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 9 }}>
            <button
              type="button"
              onClick={() => setExpanded(open ? null : group.label)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '9px 12px', cursor: 'pointer', border: 'none',
                background: 'transparent', color: 'inherit', fontFamily: 'inherit', fontSize: 13,
              }}
            >
              <span style={{ width: 12, opacity: 0.6 }}>{open ? '▾' : '▸'}</span>
              <strong style={{ fontWeight: 500 }}>{t(group.label as GroupLabelKey)}</strong>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, opacity: 0.6 }}>
                {changed > 0 ? `${changed} / ${group.tokens.length}` : group.tokens.length}
              </span>
            </button>
            {open && (
              <div style={{ padding: '0 12px 10px 32px' }}>
                {group.tokens.map((name) => (
                  <TokenRow
                    key={name}
                    t={t}
                    name={name}
                    value={overrides[name]?.[mode] ?? ''}
                    color={group.label !== 'groupTypography'}
                    onSet={onSet}
                    onClear={onClear}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
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
  const [importText, setImportText] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  // Token edits are per mode and start on whichever palette the host is showing.
  const [tokenMode, setTokenMode] = useState<TokenMode>(() => (bridge.isDark() ? 'dark' : 'light'))
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

  // dsh declares its palette twice — on `body` and on `body[data-ds-dark-theme]`
  // — so an edit made while the panel is on Light must leave the Dark
  // declaration alone. One token at a time, one mode at a time.
  const setToken = useCallback((name: string, value: string) => {
    setPrefs((p) => ({
      ...p,
      tokenOverrides: {
        ...p.tokenOverrides,
        [name]: { ...p.tokenOverrides[name], [tokenMode]: value },
      },
    }))
  }, [tokenMode])

  const clearToken = useCallback((name: string) => {
    setPrefs((p) => {
      const next = { ...p.tokenOverrides }
      const entry: TokenValues = { ...next[name] }
      delete entry[tokenMode]
      // An entry with no modes left is an empty promise the normalizer drops on
      // the next load anyway; removing it here keeps the counter honest.
      if (Object.keys(entry).length === 0) delete next[name]
      else next[name] = entry
      return { ...p, tokenOverrides: next }
    })
  }, [tokenMode])

  const clearTokenMode = useCallback(() => {
    setPrefs((p) => {
      const next: Record<string, TokenValues> = {}
      for (const [name, entry] of Object.entries(p.tokenOverrides)) {
        const kept: TokenValues = {}
        for (const mode of TOKEN_MODE_VALUES) {
          if (mode !== tokenMode && entry[mode] !== undefined) kept[mode] = entry[mode]
        }
        if (Object.keys(kept).length > 0) next[name] = kept
      }
      return { ...p, tokenOverrides: next }
    })
  }, [tokenMode])

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
  /** How many tokens the mode being edited has overrides for, for the heading. */
  const tokenCount = Object.values(prefs.tokenOverrides)
    .filter((entry) => entry[tokenMode] !== undefined).length

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
          preset={{ name: t('noPreset'), description: '', tokens: {} }}
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

      <SectionTitle icon="🎚">{t('tokenSection')}</SectionTitle>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Segmented<TokenMode>
            value={tokenMode}
            onChange={setTokenMode}
            options={[
              { value: 'light', label: `☀ ${t('tokenModeLight')}` },
              { value: 'dark', label: `🌙 ${t('tokenModeDark')}` },
            ]}
          />
          <span style={{ fontSize: 11, opacity: 0.55, flex: 1, minWidth: 220 }}>{t('tokenHint')}</span>
          {tokenCount > 0 && (
            <>
              <Badge color="info">{tokenCount}</Badge>
              <Button variant="ghost" size="sm" onClick={clearTokenMode}>{t('tokenClearMode')}</Button>
            </>
          )}
        </div>
        <div style={{ height: 10 }} />
        <TokenEditor
          t={t}
          mode={tokenMode}
          overrides={prefs.tokenOverrides}
          onSet={setToken}
          onClear={clearToken}
        />
      </Card>

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

      <div style={{ fontSize: 11, opacity: 0.55, lineHeight: 1.5 }}>
        {t('tokenNote', { count: VERIFIED_TOKENS.length })}
      </div>

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
