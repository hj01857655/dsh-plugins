/**
 * Pure rendering half of the contextMemory page.
 *
 * Separate from `index.tsx` so a static render can assert in Node what the page draws —
 * the shipped bundle is a loader factory only a browser can run. Every user-visible
 * string comes from the `t` seat the renderer binds from this plugin's namespace, so the
 * page follows the UI language; no copy is hardcoded here.
 *
 * @module client/view
 */

import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

import type { MemoryState, PanelPayload, RecallHit } from '../types.js'

export type Translate = (key: string, params?: Record<string, unknown>) => string

export interface PanelProps {
  t: Translate
}

const PANEL_PATH = '/api/context-memory.panel'
const RECALL_PATH = '/api/context-memory.recall'
const REMEMBER_PATH = '/api/context-memory.remember'
const FORGET_PATH = '/api/context-memory.forget'

const wrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 820, fontFamily: 'inherit' }
const head: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }
const muted: CSSProperties = { fontSize: 12, opacity: 0.75 }
const table: CSSProperties = { borderCollapse: 'collapse', width: '100%' }
const th: CSSProperties = { textAlign: 'left', padding: '4px 10px 4px 0', fontWeight: 600, fontSize: 12, opacity: 0.8, borderBottom: '0.5px solid rgba(128,128,128,0.4)' }
const td: CSSProperties = { padding: '6px 10px 6px 0', fontSize: 13, borderBottom: '0.5px solid rgba(128,128,128,0.18)' }
const list: CSSProperties = { margin: 0, paddingLeft: 18, fontSize: 13 }
const card: CSSProperties = { padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(128,128,128,0.2)', fontSize: 13 }
const btn: CSSProperties = { fontSize: 12, cursor: 'pointer', padding: '3px 10px', borderRadius: 4, border: '0.5px solid rgba(128,128,128,0.4)' }
const dangerBtn: CSSProperties = { ...btn, color: '#e55', borderColor: '#e55' }
const inputStyle: CSSProperties = { fontSize: 13, padding: '4px 8px', borderRadius: 4, border: '0.5px solid rgba(128,128,128,0.4)', flex: 1 }

interface PanelState {
  payload: PanelPayload | null
  error: string | null
}

export function usePanel(): PanelState & { reload: () => void } {
  const [state, setState] = useState<PanelState>({ payload: null, error: null })
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((v) => v + 1), [])
  useEffect(() => {
    const c = new AbortController()
    setState((p) => ({ ...p, error: null }))
    fetch(PANEL_PATH, { signal: c.signal })
      .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<PanelPayload> })
      .then((payload) => { if (!c.signal.aborted) setState({ payload, error: null }) })
      .catch((e: unknown) => { if (!c.signal.aborted) setState({ payload: null, error: e instanceof Error ? e.message : String(e) }) })
    return () => c.abort()
  }, [tick])
  return { ...state, reload }
}

export function checkLabel(memory: MemoryState, t: Translate): string {
  if (!memory.guard) return t('checkNone')
  switch (memory.verification?.outcome) {
    case 'passed': return t('checkPassed')
    case 'violated': return t('checkViolated')
    case 'broken': return t('checkBroken')
    default: return t('checkPending')
  }
}

export function provenance(memory: MemoryState): string {
  return [
    memory.source,
    memory.sessionId !== undefined ? `session ${memory.sessionId}` : null,
    memory.step !== undefined ? `step ${String(memory.step)}` : null,
  ].filter((part) => part !== null).join(' · ')
}

// --- Search bar ---
function SearchBar({ t, onResult }: { t: Translate; onResult: (hits: RecallHit[] | null) => void }) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const handleSearch = useCallback(async () => {
    if (!query.trim()) { onResult(null); return }
    setLoading(true)
    try {
      const r = await fetch(`${RECALL_PATH}?q=${encodeURIComponent(query)}&limit=10`)
      if (r.ok) { const data = await r.json() as { hits: RecallHit[] }; onResult(data.hits) }
    } finally { setLoading(false) }
  }, [query, onResult])
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input style={inputStyle} placeholder={t('searchPlaceholder')} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }} />
      <button type="button" style={btn} disabled={loading} onClick={handleSearch}>{loading ? '…' : t('search')}</button>
    </div>
  )
}

// --- Add memory form ---
function AddMemoryForm({ t, onAdded }: { t: Translate; onAdded: () => void }) {
  const [text, setText] = useState('')
  const [subject, setSubject] = useState('')
  const [kind, setKind] = useState('fact')
  const [adding, setAdding] = useState(false)
  const handleAdd = useCallback(async () => {
    if (!text.trim()) return
    setAdding(true)
    try {
      await fetch(REMEMBER_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, subject: subject || undefined, kind, source: 'user' }),
      })
      setText(''); setSubject(''); setKind('fact')
      onAdded()
    } finally { setAdding(false) }
  }, [text, subject, kind, onAdded])
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <strong style={{ fontSize: 12 }}>➕ {t('addMemory')}</strong>
      <input style={inputStyle} placeholder={t('memoryText')} value={text} onChange={(e) => setText(e.target.value)} />
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={inputStyle} placeholder={t('subjectOptional')} value={subject} onChange={(e) => setSubject(e.target.value)} />
        <select style={{ ...btn, flex: '0 0 auto' }} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="fact">{t('kindFact')}</option>
          <option value="decision">{t('kindDecision')}</option>
          <option value="preference">{t('kindPreference')}</option>
          <option value="pitfall">{t('kindPitfall')}</option>
        </select>
        <button type="button" style={btn} disabled={adding} onClick={handleAdd}>{adding ? '…' : t('add')}</button>
      </div>
    </div>
  )
}

export function ContextMemoryPanel({ t }: PanelProps) {
  const { payload, error, reload } = usePanel()
  const [searchHits, setSearchHits] = useState<RecallHit[] | null>(null)

  const handleForget = useCallback(async (id: string, reason: string) => {
    await fetch(FORGET_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, reason }) })
    reload()
  }, [reload])

  const header = (
    <header style={head}>
      <strong style={{ fontSize: 13 }}>🧠 {t('title')}</strong>
      <span style={{ flex: 1 }} />
      <button type="button" style={btn} onClick={reload}>{t('refresh')}</button>
    </header>
  )
  if (error !== null) {
    return (
      <div style={wrap}>
        {header}
        <p role="alert" style={{ margin: 0, fontSize: 13 }}>{t('failed')}: {error}</p>
        <button type="button" onClick={reload} style={{ ...btn, alignSelf: 'flex-start' }}>{t('retry')}</button>
      </div>
    )
  }
  if (payload === null) return <p style={muted} aria-live="polite">{t('loading')}</p>
  const { totals } = payload
  return (
    <div style={wrap}>
      {header}
      <span style={muted}>
        {t('active')} {totals.active} · {t('checkPassed')} {totals.verified} · {t('unverified')} {totals.unverified} · {t('superseded')} {totals.superseded}
      </span>

      {/* Search */}
      <SearchBar t={t} onResult={setSearchHits} />
      {searchHits !== null && (
        <div style={card}>
          <strong style={{ fontSize: 12 }}>{t('searchResults')} ({searchHits.length})</strong>
          {searchHits.length === 0 ? (
            <p style={muted}>{t('noResults')}</p>
          ) : (
            <ul style={list}>
              {searchHits.map((hit) => (
                <li key={hit.memory.id} style={{ marginBottom: 4 }}>
                  <code style={{ fontSize: 11 }}>{hit.memory.id}</code> ({hit.score.toFixed(2)}) {hit.memory.text}
                  <span style={{ ...muted, marginLeft: 8 }}>— {hit.why}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Add memory */}
      <AddMemoryForm t={t} onAdded={reload} />

      {/* Conflicts with resolve buttons */}
      <strong style={{ fontSize: 13 }}>⚠️ {t('conflicts')}</strong>
      {payload.conflicts.length === 0 ? (
        <span style={muted}>{t('noConflicts')}</span>
      ) : (
        <ul style={list}>
          {payload.conflicts.map((conflict) => (
            <li key={conflict.subject}>
              <strong>{conflict.subject}</strong>
              <ul style={{ ...list, fontSize: 12, opacity: 0.85 }}>
                {conflict.memories.map((memory) => (
                  <li key={memory.id}>
                    <code style={{ fontSize: 11 }}>{memory.id}</code> {memory.text}
                    <button type="button" style={{ ...dangerBtn, marginLeft: 8 }} onClick={() => handleForget(memory.id, `conflict resolved: ${conflict.subject}`)}>
                      {t('resolve')}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {/* Active memories with supersede buttons */}
      <strong style={{ fontSize: 13 }}>✅ {t('active')}</strong>
      {payload.active.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>{t('empty')}</p>
      ) : (
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Id</th><th style={th}>{t('memory')}</th><th style={th}>{t('kind')}</th>
              <th style={th}>{t('status')}</th><th style={th}>{t('from')}</th><th style={th} />
            </tr>
          </thead>
          <tbody>
            {payload.active.map((memory) => (
              <tr key={memory.id}>
                <td style={td}><code style={{ fontSize: 11 }}>{memory.id}</code></td>
                <td style={td}>{memory.text}</td>
                <td style={td}>{memory.kind}</td>
                <td style={td}>{checkLabel(memory, t)}</td>
                <td style={td}>{provenance(memory)}</td>
                <td style={td}>
                  <button type="button" style={dangerBtn} onClick={() => handleForget(memory.id, 'superseded from panel')}>
                    🗑 {t('forget')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Superseded */}
      {payload.superseded.length > 0 && (
        <>
          <strong style={{ fontSize: 13 }}>📦 {t('superseded')} ({payload.superseded.length})</strong>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Id</th><th style={th}>{t('memory')}</th><th style={th}>{t('kind')}</th>
                <th style={th}>{t('status')}</th><th style={th}>{t('from')}</th>
              </tr>
            </thead>
            <tbody>
              {payload.superseded.map((memory) => (
                <tr key={memory.id}>
                  <td style={td}><code style={{ fontSize: 11 }}>{memory.id}</code></td>
                  <td style={td}>{memory.text}</td>
                  <td style={td}>{memory.kind}</td>
                  <td style={td}>{checkLabel(memory, t)}</td>
                  <td style={td}>{provenance(memory)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
