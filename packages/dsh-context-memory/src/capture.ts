/**
 * Automatic memory capture from the conversation.
 *
 * WHAT THIS MODULE DELIBERATELY IS
 * --------------------------------
 * A pure distiller: user text in, statements out. No DOM, no log, no service —
 * so it is unit-testable in Node without a harness and the policy is visible in
 * one file. The caller (`index.ts`) owns persistence and the pre-step seam.
 *
 * WHY SO SELECTIVE
 * ----------------
 * Capturing everything makes recall useless: every future request would carry
 * dozens of stale rows and the model learns to ignore them. The rules below
 * keep the log close to "what the user explicitly asked to be kept" — the same
 * bar a careful human note-taker applies.
 *
 * @module context-memory/capture
 */

import type { MemoryKind } from './types.js'
import type { RememberInput } from './memory.js'

/** One distilled statement ready for `memory.remember()`. */
export type DistilledMemory = RememberInput & { sessionId: string }

/**
 * Extract remember-worthy statements from one incoming user message.
 *
 * Patterns are anchored and require an explicit memory verb, so ordinary
 * conversation never lands in the log. Chinese and English forms are handled
 * with the same acceptance bar; matched text is cleaned of the verb itself.
 *
 * @param text - the user's message text.
 * @param sessionId - provenance for the panel.
 * @returns zero or more statements to persist (already deduped within the message).
 */
export function distill(text: string, sessionId: string): DistilledMemory[] {
  const statements = extractStatements(text)
  const seen = new Set<string>()
  const result: DistilledMemory[] = []
  for (const raw of statements) {
    const normalized = raw.trim()
    if (normalized.length < 4) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push({
      text: normalized,
      source: 'user',
      kind: classifyKind(normalized),
      sessionId,
    })
  }
  return result
}

function extractStatements(text: string): string[] {
  const out: string[] = []
  for (const sentence of text.split(/(?<=[。！？!?\n])/)) {
    const s = sentence.trim()
    if (s.length === 0) continue

    // English: remember (that) ... / keep in mind (that) ... / note that ...
    let m = /^(?:please\s+)?(?:remember|keep in mind|note)(?:\s+that)?\s+(.{4,})$/i.exec(s)
    if (m) { out.push(m[1].replace(/[.。]+$/, '').trim()); continue }

    // English: don't forget to X / never X (imperative rules)
    m = /^(?:don't|do not)\s+forget\s+(?:to\s+)?(.{4,})$/i.exec(s)
    if (m) { out.push(`must ${m[1].replace(/[.。]+$/, '').trim()}`); continue }

    // Chinese: 记住…/请记住…/记一下…/注意…(后接陈述)
    m = /^(?:请|麻烦)?(?:记住|记一下|记着|注意)(?:，|,|:|：|\s)?(.{4,})$/.exec(s)
    if (m) { out.push(m[1].replace(/[。.]+$/, '').trim()); continue }

    // Chinese: 不要忘记…/别忘了…
    m = /^(?:不要|别)忘记(?:了)?(?:，|,|:|：|\s)?(.{4,})$/.exec(s)
    if (m) { out.push(m[1].replace(/[。.]+$/, '').trim()); continue }

    // Chinese: 以后… (standing preference), e.g. 以后都用 pnpm
    m = /^(?:以后|从今以后)(.{4,})$/.exec(s)
    if (m) { out.push(m[1].replace(/[。.]+$/, '').trim()); continue }
  }
  return out
}

/** Classify the captured statement by its shape. */
function classifyKind(text: string): MemoryKind {
  if (/^never\s|^don't\s|^do not\s|^must\s|^不要|^别|禁止|不能|不许/i.test(text)) return 'pitfall'
  if (/prefer|always|以后|都改用|都用|而不是|instead of|rather than|偏好|喜欢/i.test(text)) return 'preference'
  if (/决定|decided|we'?ll|we will|改为|切换到|migrate/i.test(text)) return 'decision'
  return 'fact'
}
