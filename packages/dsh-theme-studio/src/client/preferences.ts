/**
 * The panel's own preference record: the one place that reads and writes it.
 *
 * Both halves need it — the panel loads and saves on every edit, and the
 * plugin's load path restores the stored choice before the panel has ever been
 * mounted. It lives here rather than in the view because `index.tsx` must not
 * import the view: the view already imports `useApplyBridge` from `index.tsx`.
 *
 * @module client/preferences
 */

import type { ThemePreferences } from '../types.js'
import { DEFAULT_PREFERENCES, STORAGE_KEY, normalizePreferences } from '../types.js'

/** The stored preferences, or the defaults when nothing usable is stored. */
export function loadPreferences(): ThemePreferences {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_PREFERENCES }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return { ...DEFAULT_PREFERENCES }
    // Normalize rather than merge: a set stored by an older version may carry
    // `density: 'comfortable'`, which used to mean "14px" and now means "leave
    // the host alone".
    return normalizePreferences(JSON.parse(raw) as Partial<ThemePreferences>)
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

/** Persist the preferences after an edit. */
export function savePreferences(prefs: ThemePreferences): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}
