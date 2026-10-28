/**
 * Custom themes: normalization, validation and the theme-pack wire format.
 *
 * Pure module — no DOM access. The localStorage half lives in
 * `client/custom-storage.js`; both entry points funnel through
 * `normalizeCustomTheme` here so a theme that reaches the resolver is always
 * one the resolver can apply, no matter whether it arrived from storage, an
 * import or a hand-edited file.
 *
 * Every token name a custom theme writes must be on the verified list
 * (`isVerifiedToken`). `ctx.theme.overrideTokens` validates the *shape* of a
 * value but not the name, so an unverified name is accepted by the host and
 * then silently does nothing — rejecting it here is what makes a custom theme
 * behave like a built-in instead of half-applying.
 *
 * @module custom
 */

import type { CustomTheme } from './types.js'
import { CUSTOM_ID_PREFIX } from './types.js'
import { isVerifiedToken, accentTokens, surfaceTokens } from './tokens.js'

/** A slug safe for ids and file names: ascii letters, digits, hyphen. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

/** A theme-pack document, the v2 wire format. */
export interface ThemePack {
  $schema: 'dsh-theme-studio/v2'
  name?: string
  preferences?: Record<string, unknown>
  themes?: unknown[]
  exportedAt: string
}

/** Generate a fresh custom-theme id: `custom:<timestamp-base36><random>`. */
export function newCustomThemeId(): string {
  const stamp = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `${CUSTOM_ID_PREFIX}${stamp}${rand}`
}

/** Keep only verified token names; an unverified name can never take effect. */
export function sanitizeTokens(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isVerifiedToken(name)) continue
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    // Values reach CSS custom properties verbatim; a value that could close a
    // declaration or smuggle a rule is rejected, not trimmed into safety.
    if (trimmed === '' || /[;{}]/.test(trimmed)) continue
    out[name] = trimmed
  }
  return out
}

/**
 * Build a full-theme variant from one accent color per mode.
 *
 * This is what "new theme from current accent" produces: the surface family is
 * derived from the accent with the same derivation every built-in preset uses,
 * so a saved custom theme carries a complete palette rather than eight accent
 * tokens over an untouched host look.
 */
export function themeFromAccent(
  name: string,
  lightAccent: string,
  darkAccent = lightAccent,
  description = '',
): CustomTheme {
  const now = new Date().toISOString()
  return {
    id: newCustomThemeId(),
    name,
    description,
    tokens: { ...surfaceTokens(lightAccent, false), ...accentTokens(lightAccent) },
    darkTokens: { ...surfaceTokens(darkAccent, true), ...accentTokens(darkAccent) },
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Bring an arbitrary value up to the `CustomTheme` shape, or `null` when it
 * cannot honestly represent a theme (no name, no usable tokens on either side).
 *
 * Lenient on purpose: a theme saved by a future version may carry extra fields
 * and still applies — they are just dropped, the same way `normalizePreferences`
 * drops fields it does not know.
 */
export function normalizeCustomTheme(raw: unknown): CustomTheme | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const doc = raw as Record<string, unknown>

  const name = typeof doc['name'] === 'string' ? doc['name'].trim() : ''
  if (name === '') return null

  const tokens = sanitizeTokens(doc['tokens'])
  const darkTokens = sanitizeTokens(doc['darkTokens'])
  // At least one side must paint something; an empty shell has nothing to apply.
  if (Object.keys(tokens).length === 0 && Object.keys(darkTokens).length === 0) return null

  const rawId = typeof doc['id'] === 'string' ? doc['id'] : ''
  const bare = rawId.startsWith(CUSTOM_ID_PREFIX) ? rawId.slice(CUSTOM_ID_PREFIX.length) : rawId
  const id = SLUG_RE.test(bare) ? `${CUSTOM_ID_PREFIX}${bare}` : newCustomThemeId()

  const now = new Date().toISOString()
  const createdAt = typeof doc['createdAt'] === 'string' ? doc['createdAt'] : now
  const base: CustomTheme = {
    id,
    name,
    description: typeof doc['description'] === 'string' ? doc['description'] : '',
    tokens,
    createdAt,
    updatedAt: typeof doc['updatedAt'] === 'string' ? doc['updatedAt'] : now,
  }
  // exactOptionalPropertyTypes: an empty dark side is *absent*, not present-but-undefined.
  if (Object.keys(darkTokens).length > 0) base.darkTokens = darkTokens
  return base
}

/** Normalize a whole list, dropping unusable entries and de-duplicating ids. */
export function normalizeCustomThemeList(raw: unknown): CustomTheme[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: CustomTheme[] = []
  for (const item of raw) {
    const theme = normalizeCustomTheme(item)
    if (theme === null) continue
    if (seen.has(theme.id)) continue
    seen.add(theme.id)
    out.push(theme)
  }
  return out
}

/** Build a v2 theme-pack document around a preference set and its custom themes. */
export function buildThemePack(
  preferences: Record<string, unknown>,
  themes: readonly CustomTheme[],
  name?: string,
): ThemePack {
  const pack: ThemePack = {
    $schema: 'dsh-theme-studio/v2',
    preferences,
    themes: themes.map((t) => ({ ...t })),
    exportedAt: new Date().toISOString(),
  }
  if (name !== undefined && name !== '') pack.name = name
  return pack
}

/**
 * Parse a theme-pack document: the v2 envelope, a v1 export, or a bare
 * preferences object. Returns what could be salvaged from each half.
 */
export function parseThemePack(raw: string): {
  preferences: Record<string, unknown> | null
  themes: CustomTheme[]
} | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const doc = parsed as Record<string, unknown>
  const inner = doc['preferences'] !== null && typeof doc['preferences'] === 'object' && !Array.isArray(doc['preferences'])
    ? doc['preferences'] as Record<string, unknown>
    : doc

  return {
    preferences: inner,
    themes: normalizeCustomThemeList(doc['themes']),
  }
}
