/**
 * Host half of dsh-verdict.
 *
 * A dsh plugin contributes through its Cordis context: `apply` receives the context and
 * registers whatever the plugin owns on it. dsh discovers the plugin through
 * `cordis.patch.yml`, which appends this package to the profile bundle graph.
 *
 * Everything below is derived rather than stored wherever that is possible, because the
 * plugin's whole claim is that its verdicts can be re-derived at any moment: `capture`
 * folds duplicates by hashing the rule text, `check` re-reads the agent file before
 * trusting a rule is in force, and both leave an inspectable ledger behind.
 *
 * @module dsh-verdict
 */

import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Context } from '@deepseek-ai/cordis'

import { compare, panelState, readSnapshot, ruleRows, saveSnapshot, snapshot } from './client.js'
import { diagnose } from './diagnose.js'
import { audit, inventory } from './inventory.js'
import { check } from './check.js'
import { learn } from './pipeline.js'
import { recordSession, type SessionInput } from './session.js'
import { findCandidates, generateSkills, type SkillCandidate } from './skills.js'
import { recall } from './store.js'
import type { CheckReport, Rule } from './types.js'

/** Display metadata; labels this plugin in Cordis diagnostics. */
export const name = 'dsh-verdict'

/**
 * Services this plugin needs before `apply` runs. Cordis resolves `inject` first and
 * only then calls `apply`, so anything listed here is guaranteed present. Kept empty:
 * the plugin depends on nothing but the filesystem, and claiming a dependency it does
 * not consume would only couple it to load ordering for no benefit.
 */
export const inject: string[] = []

/**
 * The surface other plugins and the future client half consume.
 *
 * Exposed as a Cordis service rather than closure state so contributions are reachable
 * without reaching into this module, and so anything registered through `ctx` is
 * disposed with the plugin.
 */
export interface Verdict {
  /** Project root; the agent file lives here. */
  root: string
  /** Directory holding the durable ledger. */
  dataDir: string
  /** Record a lesson, promoting it when it has an executable form. */
  learn(text: string, options?: { guard?: string }): ReturnType<typeof learn>
  /** Search captured rules by text. */
  recall(query: string): Rule[]
  /** Append one session record. Append-only: records are evidence, not summary. */
  record(input: SessionInput): ReturnType<typeof recordSession>
  /** Procedures that succeeded often enough to be worth writing down. */
  skills(): SkillCandidate[]
  /** The panel's view of the project, recomputed from disk on demand. */
  panel(): ReturnType<typeof panelState>
  /** Take a before/after snapshot, or read one back. */
  snap(slot: 'before' | 'after'): void
  /** Compare the two snapshots. Insufficient when either side is missing. */
  diff(): ReturnType<typeof compare>
  /** Check this package against dsh's plugin rules; advisory, never throws. */
  doctor(): ReturnType<typeof diagnose>
  /** Installed plugins, and what would stop them loading. */
  plugins(): ReturnType<typeof inventory>
  /** Audit findings: only what would actually stop a plugin loading. */
  audit(): ReturnType<typeof audit>
  /** Rows for the panel, from a fresh check. */
  rows(): ReturnType<typeof ruleRows>
  /** Re-run every promoted rule's guard. */
  check(): CheckReport
}

/**
 * Register the plugin's contributions.
 *
 * @param ctx - the Cordis context this plugin contributes to.
 */
export function apply(ctx: Context): void {
  const root = resolve(process.cwd())
  const dataDir = join(root, '.verdict')

  // Created eagerly so the first `learn` has somewhere to write. Nothing else happens at
  // load time: nothing about registration should be able to fail.
  mkdirSync(dataDir, { recursive: true })

  ctx.provide('verdict', {
    root,
    dataDir,
    learn: (text: string, options?: { guard?: string }) => learn(root, dataDir, text, options ?? {}),
    recall: (query: string) => recall(dataDir, query),
    record: (input: SessionInput) => recordSession(dataDir, input),
    skills: () => findCandidates(dataDir),
    panel: () => panelState(root, dataDir),
    snap: (slot: 'before' | 'after') => saveSnapshot(dataDir, slot, snapshot(slot, root, dataDir)),
    diff: () => compare(readSnapshot(dataDir, 'before'), readSnapshot(dataDir, 'after')),
    doctor: () => diagnose(fileURLToPath(new URL('..', import.meta.url))),
    plugins: () => inventory(root),
    check: () => check(dataDir, root),
    audit: () => audit(root),
    rows: () => ruleRows(root, dataDir),
  } satisfies Verdict)
}
