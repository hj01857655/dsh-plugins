/**
 * Browser half of dsh-context-memory — the view model.
 *
 * Rendering is kept here, separate from the fetch-and-register shell, so it can be
 * statically rendered in Node during tests. The panel is a claim about what the agent
 * remembers, so it is worth asserting on without a browser.
 *
 * @module context-memory/client/view
 */

import type { MemoryState, PanelPayload } from '../types.js'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * A memory's verification badge.
 *
 * Four states, not two, because "no check exists" and "the check could not run" are
 * different answers from "the check failed" — collapsing them would report an
 * unverifiable memory and a false one identically, which is the failure this plugin
 * exists to avoid.
 */
export function verificationLabel(memory: MemoryState): string {
  if (!memory.guard) return 'no check'
  switch (memory.verification?.outcome) {
    case 'passed': return 'checked, holds'
    case 'violated': return 'checked, does not hold'
    case 'broken': return 'check unusable'
    default: return 'not yet checked'
  }
}

function rows(memories: MemoryState[]): string {
  return memories
    .map((memory) => {
      const provenance = [
        memory.source,
        memory.sessionId ? `session ${memory.sessionId}` : null,
        memory.step !== undefined ? `step ${memory.step}` : null,
      ].filter(Boolean).join(' · ')
      return `<tr><td><code>${escapeHtml(memory.id)}</code></td><td>${escapeHtml(memory.text)}</td><td>${escapeHtml(memory.kind)}</td><td>${escapeHtml(verificationLabel(memory))}</td><td>${escapeHtml(provenance)}</td></tr>`
    })
    .join('')
}

export function renderPanel(payload: PanelPayload): string {
  const { totals } = payload

  const summary = `<p class="memory-summary">${totals.active} active (${totals.verified} checked and holding, ${totals.unverified} not), ${totals.superseded} superseded, ${totals.withGuard} with a compiled check.</p>`

  const conflictBlock = payload.conflicts.length === 0
    ? '<p>No conflicts.</p>'
    : `<div class="memory-conflicts"><h3>Conflicts</h3><ul>${payload.conflicts
        .map((conflict) => `<li><strong>${escapeHtml(conflict.subject)}</strong><ul>${conflict.memories
          .map((memory) => `<li><code>${escapeHtml(memory.id)}</code> ${escapeHtml(memory.text)}</li>`)
          .join('')}</ul></li>`)
        .join('')}</ul></div>`

  const activeBlock = payload.active.length === 0
    ? '<p>Nothing is remembered yet.</p>'
    : `<table><thead><tr><th>Id</th><th>Memory</th><th>Kind</th><th>Status</th><th>From</th></tr></thead><tbody>${rows(payload.active)}</tbody></table>`

  const supersededBlock = payload.superseded.length === 0
    ? ''
    : `<details><summary>Superseded (${payload.superseded.length})</summary><table><thead><tr><th>Id</th><th>Memory</th><th>Kind</th><th>Status</th><th>From</th></tr></thead><tbody>${rows(payload.superseded)}</tbody></table></details>`

  return `<div class="context-memory-panel"><h2>Context memory</h2>${summary}${conflictBlock}<h3>Active</h3>${activeBlock}${supersededBlock}</div>`
}
