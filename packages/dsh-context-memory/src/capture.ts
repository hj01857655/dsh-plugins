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

/** A statement worth *offering*, not worth remembering unasked. */
export interface CapturedCandidate {
  text: string
  kind: MemoryKind
  sessionId: string
}

/**
 * Statements that look like durable facts but were not asked to be kept.
 *
 * These are deliberately **not** memories. The rules below are heuristics — "we use
 * sqlite" reads like a fact, and so does "we use two queues" or a sentence quoted from
 * somewhere else — and a heuristic that writes to the log is a heuristic that fills the
 * log with things the user never said they wanted. A candidate is a question put to the
 * user, which is the cheapest way to be generous without eroding what recall is worth.
 *
 * The bar is set by `technicalSignal`: without a token that looks like a name — `pnpm`,
 * `node_modules`, `MySQL`, `@scope/pkg` — a sentence is ordinary conversation, and
 * "今天用两个服务" must not become a memory.
 */
export function candidates(text: string, sessionId: string, explicit: readonly string[] = []): CapturedCandidate[] {
  const already = new Set(explicit.map((statement) => statement.trim().toLowerCase()))
  const seen = new Set<string>()
  const out: CapturedCandidate[] = []
  for (const sentence of sentenceCandidates(text)) {
    const normalized = sentence.text.trim()
    if (normalized.length < 6 || normalized.length > 160) continue
    const key = normalized.toLowerCase()
    // An explicit "记住…" in the same message already covers this sentence; proposing it
    // again would ask the user to confirm something they just asked for.
    if (already.has(key) || seen.has(key)) continue
    seen.add(key)
    out.push({ text: normalized, kind: sentence.kind, sessionId })
    // Three per message is a ceiling, not a target: a message that trips four patterns is
    // usually a message about something else, and a panel that offers ten rows at once
    // gets ignored exactly like one that offers none.
    if (out.length >= 3) break
  }
  return out
}

/**
 * A token that looks like a technology, a package, or a path.
 *
 * This is what separates "we use pnpm for this repo" from "我们用两个队列". Both are
 * declarative; only the first names something a future reader could act on. Requiring an
 * ASCII token of at least two characters is crude and deliberately so: a vocabulary list
 * would go stale, and semantic judgment is the model's job, not a regex's.
 */
const TECHNICAL_SIGNAL = /[A-Za-z][A-Za-z0-9_.\-+]*[A-Za-z0-9]|\/[A-Za-z0-9_.-]+\//

/** A question is not a statement, whatever else it contains. */
const QUESTION = /(?:\?|？)\s*$|(?:吗|么|呢)\s*[。.]?\s*$/

/** Openers that make a sentence an instruction to the agent, not a fact about the world. */
const DIRECTIVE = /^(?:please\b|帮(?:我|忙)|请|麻烦|看一下|看看|检查|修改|修复|添加|实现|重构|运行|跑一下|add\b|fix\b|check\b|look\b|show\b|run\b|update\b|refactor\b|implement\b)/i

/** Sentence shapes that assert something stable about the project or the user. */
const SHAPES: { pattern: RegExp; kind: MemoryKind }[] = [
  // English: we use X / this project builds with X / I rely on X
  { pattern: /^(?:we|i|this project|the project|our team)\s+(?:use|uses|build with|builds with|rely on|relies on|depend on|depends on|test with|tests with)\s+/i, kind: 'fact' },
  // English: we always/never/prefer X — a standing preference or a rule.
  { pattern: /^(?:we|i)\s+(?:always|never|prefer|avoid|stick to)\b/i, kind: 'preference' },
  { pattern: /^(?:don'?t|do not|never)\s+(?:use|commit|add|write)\b/i, kind: 'pitfall' },
  { pattern: /^the\s+(?:build|test suite|package manager|project)\s+(?:uses|runs|is)\b/i, kind: 'fact' },
  // Chinese: 我们用 X / 本项目用 X 构建 / 团队统一用 X
  { pattern: /^(?:我们|我|团队|本项目|这个项目|该项目)?\s*(?:都|一直|统一|一律)?\s*用\s*\S/i, kind: 'fact' },
  { pattern: /^(?:我们|我|团队|本项目|这个项目|该项目)?\s*(?:都|统一)?\s*(?:用|使用)\S+\s*(?:来)?\s*(?:构建|打包|管理|存|跑|测试|开发|部署|做)/, kind: 'fact' },
  // Chinese: X 是 (我们的) 构建工具 / 包管理器 / 数据库 …
  { pattern: /是(?:我们的|本项目的|这个项目的)?(?:构建工具|包管理器|测试框架|数据库|持久化|运行时|框架|语言)/, kind: 'fact' },
  // Chinese: 我们习惯 / 偏好 / 倾向
  { pattern: /^(?:我们|我)(?:习惯|倾向|偏好|喜欢|不喜欢)/, kind: 'preference' },
  // Chinese: 不要用 X / 别碰 X / 禁止 X
  { pattern: /^(?:不要|别|禁止|不能|不许)(?:再|直接)?\s*(?:用|使用|碰|提交|提交到|写|引入)/, kind: 'pitfall' },
]

function sentenceCandidates(text: string): { text: string; kind: MemoryKind }[] {
  const out: { text: string; kind: MemoryKind }[] = []
  for (const raw of text.split(/(?<=[。！？!?\n])/)) {
    const sentence = raw.trim().replace(/[。.!！]+$/, '').trim()
    if (sentence.length === 0) continue
    if (QUESTION.test(raw.trim())) continue
    if (DIRECTIVE.test(sentence)) continue
    if (!TECHNICAL_SIGNAL.test(sentence)) continue
    const shape = SHAPES.find((candidate) => candidate.pattern.test(sentence))
    if (shape === undefined) continue
    out.push({ text: sentence, kind: shape.kind })
  }
  return out
}

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
