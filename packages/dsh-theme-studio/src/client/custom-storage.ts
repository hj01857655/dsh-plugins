/**
 * localStorage persistence for custom themes.
 *
 * The one place that reads and writes the custom-theme list, mirroring the
 * role `preferences.ts` plays for preferences. The list is small and edits are
 * rare, so the whole list is rewritten on every change — no incremental diffing
 * to get wrong.
 *
 * @module client/custom-storage
 */

import type { CustomTheme } from '../types.js'
import { CUSTOM_THEMES_KEY } from '../types.js'
import { normalizeCustomTheme, normalizeCustomThemeList, newCustomThemeId } from '../custom.js'

/** The stored list, or an empty one when nothing usable is stored. */
export function loadCustomThemes(): CustomTheme[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_KEY)
    if (raw === null) return []
    return normalizeCustomThemeList(JSON.parse(raw))
  } catch {
    return []
  }
}

/** Persist the whole list after an edit. */
export function saveCustomThemes(themes: readonly CustomTheme[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes))
}

/**
 * Insert or update by id, returning the stored list.
 *
 * A theme whose id already exists is replaced in place (order preserved — the
 * list is user-visible and reordering on rename would jump rows); a new id is
 * appended. `updatedAt` is stamped here, the single write path, so every edit
 * is dated exactly once.
 */
export function upsertCustomTheme(theme: CustomTheme): CustomTheme[] {
  const themes = loadCustomThemes()
  const stamped: CustomTheme = { ...theme, updatedAt: new Date().toISOString() }
  const index = themes.findIndex((t) => t.id === stamped.id)
  if (index === -1) themes.push(stamped)
  else themes[index] = stamped
  saveCustomThemes(themes)
  return themes
}

/** Remove by id, returning the stored list. */
export function deleteCustomTheme(id: string): CustomTheme[] {
  const themes = loadCustomThemes().filter((t) => t.id !== id)
  saveCustomThemes(themes)
  return themes
}

/**
 * Duplicate a theme under a fresh id and a "copy" suffix, returning the new
 * theme and the stored list. The copy is selected by the caller — this module
 * does not know the preference shape.
 */
export function duplicateCustomTheme(id: string): { theme: CustomTheme; themes: CustomTheme[] } | null {
  const source = loadCustomThemes().find((t) => t.id === id)
  if (source === undefined) return null
  const copy: CustomTheme = {
    ...source,
    id: newCustomThemeId(),
    name: `${source.name} copy`,
    createdAt: new Date().toISOString(),
  }
  return { theme: copy, themes: upsertCustomTheme(copy) }
}
