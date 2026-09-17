/**
 * Command-line entry.
 *
 * Exists for two reasons. First, the plugin's own claims need to be checkable without
 * booting dsh — a verification tool that can only be exercised from inside the thing
 * being verified is hard to trust and painful to test. Second, `check` needs to be
 * callable from CI, where a non-zero exit is the whole point.
 *
 * Deliberately dependency-free and synchronous: it is a thin shell over the same modules
 * `apply` wires up, so there is one implementation of every behaviour.
 *
 * @module verdict/cli
 */

import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { check } from './check.js'
import { learn } from './pipeline.js'
import { recordSession, readSessions } from './session.js'
import { findCandidates, generateSkills } from './skills.js'
import { listRules, recall } from './store.js'

/** Directory the ledger and session log live in. */
const DATA_DIR = '.verdict'

function rootOf(): string {
  return resolve(process.cwd())
}

function dataOf(root: string): string {
  return join(root, DATA_DIR)
}

/** Print usage. Kept short; the point is that these are the only operations. */
function usage(): string {
  return [
    'dsh-verdict — capture rules, compile them into checks, and re-verify them.',
    '',
    'usage:',
    '  verdict learn "<rule>" [--guard "<command>"]   capture and promote a rule',
    '  verdict check                                  re-run every guard; exit 1 on real violations',
    '  verdict list                                   every captured rule',
    '  verdict recall "<query>"                       rules matching text',
    '  verdict session --intent "<text>" [--outcome success|failure|partial] [--step "<s>"]...',
    '  verdict skills [--write]                       procedures repeated often enough to become skills',
  ].join('\n')
}

/** Pull `--flag value` and repeated `--step value` out of argv. */
function parseArgs(argv: string[]): { flags: Map<string, string[]>; positional: string[] } {
  const flags = new Map<string, string[]>()
  const positional: string[] = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg?.startsWith('--')) {
      const key = arg.slice(2)
      const value = argv[i + 1]
      if (value !== undefined && !value.startsWith('--')) {
        const bucket = flags.get(key)
        if (bucket) bucket.push(value)
        else flags.set(key, [value])
        i += 1
      } else {
        if (!flags.has(key)) flags.set(key, [])
      }
    } else if (arg) {
      positional.push(arg)
    }
  }
  return { flags, positional }
}

function first(flags: Map<string, string[]>, key: string): string | undefined {
  return flags.get(key)?.[0]
}

/**
 * Run one command.
 *
 * @returns process exit code; non-zero only for a real verification failure.
 */
export function run(argv: string[]): number {
  const command = argv[0]
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(usage())
    return 0
  }

  const root = rootOf()
  const dataDir = dataOf(root)
  mkdirSync(dataDir, { recursive: true })
  const { flags, positional } = parseArgs(argv.slice(1))

  switch (command) {
    case 'learn': {
      const text = positional[0]
      if (!text) {
        console.error('verdict learn: a rule is required')
        return 2
      }
      const guard = first(flags, 'guard')
      const result = learn(root, dataDir, text, guard ? { guard } : {})
      if (result.promoted) {
        console.log(`promoted ${result.rule.id}: ${result.rule.text}`)
        console.log(`  guard: ${result.rule.guard?.command ?? ''}`)
        return 0
      }
      console.log(`captured ${result.rule.id}: ${result.rule.text}`)
      console.log(`  not promoted — ${result.reason ?? 'unknown reason'}`)
      return 0
    }

    case 'check': {
      const report = check(dataDir, root)
      for (const run of report.runs) {
        console.log(`${run.outcome.padEnd(8)} ${run.ruleId}`)
      }
      for (const id of report.broken) {
        console.log(`broken   ${id} — guard could not run; reported, not counted as a violation`)
      }
      console.log(
        `passed=${report.passed.length} violated=${report.violated.length} broken=${report.broken.length} exit=${report.exitCode}`,
      )
      return report.exitCode
    }

    case 'list': {
      for (const rule of listRules(dataDir)) {
        const open = rule.openViolation ? ' (open violation)' : ''
        console.log(`${rule.state.padEnd(11)} ${rule.id}  recurrences=${rule.recurrences}${open}  ${rule.text}`)
      }
      return 0
    }

    case 'recall': {
      const query = positional[0] ?? ''
      for (const rule of recall(dataDir, query)) {
        console.log(`${rule.state.padEnd(11)} ${rule.id}  ${rule.text}`)
      }
      return 0
    }

    case 'session': {
      const intent = first(flags, 'intent') ?? positional[0] ?? ''
      const outcome = (first(flags, 'outcome') ?? 'success') as 'success' | 'failure' | 'partial'
      const steps = flags.get('step') ?? []
      const record = recordSession(dataDir, {
        trigger: first(flags, 'trigger') ?? 'cli',
        intent,
        outcome,
        steps,
        rules: flags.get('rule') ?? [],
      })
      console.log(`recorded session ${record.seq} (${record.outcome})`)
      return 0
    }

    case 'skills': {
      const threshold = Number(first(flags, 'threshold') ?? '')
      const candidates = findCandidates(dataDir, Number.isFinite(threshold) && threshold > 0 ? threshold : undefined)
      if (candidates.length === 0) {
        console.log('no procedure has succeeded often enough yet')
        return 0
      }
      console.log(`sessions recorded: ${readSessions(dataDir).length}`)
      for (const candidate of candidates) {
        console.log(`${candidate.occurrences}× ${candidate.intent ?? candidate.key}  steps=${candidate.steps.length}`)
      }
      if (flags.has('write')) {
        const result = generateSkills(root, dataDir)
        for (const file of result.written) console.log(`wrote ${file.path}`)
        for (const candidate of result.skipped) {
          console.log(`skipped ${candidate.key} — no runnable guard, left as a candidate`)
        }
      }
      return 0
    }

    default:
      console.error(`verdict: unknown command "${command}"`)
      console.log(usage())
      return 2
  }
}
