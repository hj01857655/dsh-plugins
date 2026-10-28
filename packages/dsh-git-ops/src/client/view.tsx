/**
 * Pure rendering half of the dsh-git page.
 *
 * Self-contained on purpose: no shared UI kit import, only React and host theme tokens
 * (`--dsw-*`), so the panel follows the host theme without pulling another module into
 * the client bundle.
 *
 * @module client/view
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

import type { GitPanelPayload } from '../types.js'

/** The translate seat the host injects for this plugin's namespace. */
export type Translate = TranslateNS<'dshGit'>
export interface PanelProps { t: Translate }

const PANEL_PATH = '/api/dsh-git-ops.panel'

const styles = {
  wrap: { display: 'flex', flexDirection: 'column' as const, gap: 12, color: 'var(--dsw-alias-label-primary)' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  h2: { margin: 0, fontSize: 15, fontWeight: 600 },
  repo: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', wordBreak: 'break-all' as const },
  badge: {
    display: 'inline-block', padding: '2px 10px', borderRadius: 999,
    fontSize: 12,
  },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12.5 },
  cell: { padding: '4px 8px', textAlign: 'left' as const, borderBottom: '1px solid var(--dsw-alias-interactive-bg-hover)' },
  muted: { color: 'var(--dsw-alias-label-tertiary)' },
  mono: { fontFamily: 'ui-monospace, monospace' },
  button: {
    padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: 'var(--dsw-alias-brand-primary)', color: 'var(--dsw-alias-label-primary-inverted)',
  },
}

function stateLabel(index: string, worktree: string, t: Translate): string {
  if (index === '?' && worktree === '?') return t('untracked')
  if (index !== ' ' && index !== '?') return t('staged')
  return t('unstaged')
}

export function GitPanel({ t }: PanelProps): ReactNode {
  const [payload, setPayload] = useState<GitPanelPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((v) => v + 1), [])

  useEffect(() => {
    let alive = true
    setError(null)
    fetch(PANEL_PATH)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: GitPanelPayload) => { if (alive) setPayload(data) })
      .catch((e: Error) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [tick])

  if (error !== null) {
    return <div style={styles.wrap}>{t('failed')}: {error}</div>
  }
  if (payload === null) {
    return <div style={{ ...styles.wrap, ...styles.muted }}>{t('loading')}</div>
  }
  if (payload.error !== undefined) {
    return <div style={styles.wrap}><p style={styles.muted}>{t('notRepo')}</p></div>
  }

  const badgeStyle = {
    ...styles.badge,
    background: payload.clean
      ? 'var(--dsw-alias-state-success-tertiary)'
      : 'var(--dsw-alias-state-warn-tertiary)',
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.head}>
        <h2 style={styles.h2}>{t('title')}</h2>
        <button style={styles.button} onClick={reload}>{t('refresh')}</button>
      </div>
      <p style={styles.repo}>
        {t('repo')}: {payload.cwd} · {t('branch')}: <span style={styles.mono}>{payload.branch}</span>{' '}
        <span style={badgeStyle}>{payload.clean ? t('clean') : `${payload.entries.length} ${t('changes')}`}</span>
      </p>

      {payload.entries.length > 0 && (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.cell, ...styles.muted }}>{t('file')}</th>
              <th style={{ ...styles.cell, ...styles.muted }}>{t('state')}</th>
            </tr>
          </thead>
          <tbody>
            {payload.entries.map((entry) => (
              <tr key={entry.path}>
                <td style={{ ...styles.cell, ...styles.mono }}>{entry.path}</td>
                <td style={styles.cell}>{stateLabel(entry.index, entry.worktree, t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {payload.entries.length === 0 && <p style={styles.muted}>{t('noChanges')}</p>}

      <h3 style={{ ...styles.h2, marginTop: 8 }}>{t('commits')}</h3>
      {payload.commits.length === 0
        ? <p style={styles.muted}>{t('noCommits')}</p>
        : (
          <table style={styles.table}>
            <tbody>
              {payload.commits.map((commit) => (
                <tr key={commit.hash}>
                  <td style={{ ...styles.cell, ...styles.mono }}>{commit.hash.slice(0, 8)}</td>
                  <td style={styles.cell}>{commit.subject}</td>
                  <td style={{ ...styles.cell, ...styles.muted }}>
                    {commit.author} · {commit.date.slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  )
}
