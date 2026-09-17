/**
 * Guard compilation and execution.
 *
 * This module is where the plugin's claim is actually decided, so the distinction it
 * exists to maintain is the one enforced here: **a guard that cannot run is not a
 * violated rule.**
 *
 * Conflating them would be fatal to the point of the plugin. Guards are compiled from
 * free text and can be wrong — a missing binary, a quoting slip, a name that only exists
 * on one machine. If "could not run" were reported as "rule broken", a typo would mark a
 * perfectly good rule as ineffective, and the user would learn to ignore the output.
 *
 * So every run resolves to one of three outcomes, and `broken` is never allowed to
 * influence a rule's recurrence count or a pipeline's exit code.
 *
 * @module verdict/guard
 */

import { spawnSync } from 'node:child_process'

import type { Guard, GuardOutcome, GuardRun } from './types.js'

/** How much output to keep per run. Enough to diagnose, small enough to store inline. */
const OUTPUT_LIMIT = 2000

/**
 * Compile a rule into an executable guard.
 *
 * Recognition is deliberately narrow: only rule shapes whose checkable predicate is
 * unambiguous get a guard. A rule this cannot compile is returned without one, and
 * promotion refuses it — the alternative is inventing a command that exits 0 while
 * checking nothing, which would make every later report a lie.
 *
 * Commands are emitted for the platform in use. `process.platform` rather than a
 * hardcoded POSIX spelling: emitting `test -e` everywhere would produce guards that are
 * permanently unrunnable on Windows, so every compiled rule would sit in `broken` and
 * the check would report on nothing.
 */
export function compileGuard(text: string, platform: NodeJS.Platform = process.platform): Guard | undefined {
  const normalized = text.trim().replace(/\s+/g, ' ')
  const posix = platform !== 'win32'
  const operand = (value: string): string => (posix ? shellQuote(value) : `"${value.replace(/"/g, '\\"')}"`)

  const fileNotExists = /^(?:never |do not |don't )?(?:create|add|commit|write|touch)\s+(?:the\s+)?file\s+`?([^\s`]+)`?/i.exec(
    normalized,
  )
  if (fileNotExists?.[1]) {
    const target = operand(fileNotExists[1])
    return {
      command: posix ? `! test -e ${target}` : `cmd /c if exist ${target} exit 1`,
      source: 'template',
    }
  }

  const fileExists = /^(?:always |keep |ensure )?(?:the\s+)?file\s+`?([^\s`]+)`?\s+(?:must|should)\s+exist/i.exec(
    normalized,
  )
  if (fileExists?.[1]) {
    const target = operand(fileExists[1])
    return {
      command: posix ? `test -f ${target}` : `cmd /c if not exist ${target} exit 1`,
      source: 'template',
    }
  }

  // Searching file contents has no single cmd.exe equivalent worth emitting; on Windows
  // this shape is left uncompiled rather than approximated.
  if (posix) {
    const forbidden = /^(?:never |do not |don't )?use\s+`?([A-Za-z0-9_.-]+)`?/i.exec(normalized)
    if (forbidden?.[1]) {
      return {
        command: `! grep -RIn --exclude-dir=node_modules --exclude-dir=.git -F ${shellQuote(forbidden[1])} .`,
        source: 'template',
      }
    }
  }

  return undefined
}

/**
 * Quote a string so a POSIX shell treats it as one literal argument.
 *
 * Single quotes make every character literal; the only character that cannot appear
 * inside them is the quote itself, escaped by ending the string, adding an escaped
 * quote, and reopening.
 *
 * POSIX-only, and deliberately so: the guards compiled below are POSIX commands
 * (`test`, `grep`). On Windows they are not runnable, which `classify` reports as
 * `broken` — the outcome designed for exactly this case. The alternative, emitting
 * cmd.exe syntax here, would produce guards that are runnable on one platform and
 * silently meaningless on the other, which is worse than an honest "cannot run".
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * Run one guard to completion.
 *
 * `spawnSync` with a shell, so compound commands (`!`, pipes) work as written. No
 * timeout: a guard that hangs is a hang, and silently killing it after N seconds would
 * turn "slow" into an arbitrary outcome depending on machine load.
 *
 * @param cwd - directory the guard runs in; predicates are about this project.
 */
export function runGuard(ruleId: string, guard: Guard, cwd: string, now = new Date()): GuardRun {
  const at = now.toISOString()
  let proc: ReturnType<typeof spawnSync>
  try {
    proc = spawnSync(guard.command, { cwd, shell: true, encoding: 'utf8' })
  } catch (error) {
    return { ruleId, outcome: 'broken', exitCode: null, output: String(error), at }
  }

  const output = `${proc.stdout ?? ''}${proc.stderr ?? ''}`.slice(0, OUTPUT_LIMIT)

  // A spawn that failed outright leaves no usable status; that is a broken guard, not a
  // rule that failed its check.
  if (proc.error) {
    return { ruleId, outcome: 'broken', exitCode: null, output: `${output}${proc.error.message}`.slice(0, OUTPUT_LIMIT), at }
  }

  const code = proc.status
  if (code === null) {
    return { ruleId, outcome: 'broken', exitCode: null, output: output || 'terminated by signal', at }
  }

  return { ruleId, outcome: classify(code, output), exitCode: code, output, at }
}

/**
 * Classify an exit code into an outcome.
 *
 * Two conventions signal "the command does not exist": POSIX shells use 127, and
 * cmd.exe uses 9009. Both are recognised, plus the textual hints shells print instead
 * of a distinctive code when the failure happens inside the shell. Without this, a
 * misspelled binary would look like a rule being violated.
 */
export function classify(code: number, output = ''): GuardOutcome {
  if (code === 0) return 'passed'
  if (code === 127 || code === 9009) return 'broken'
  if (/command not found|is not recognized|No such file or directory|not found/i.test(output)) {
    return 'broken'
  }
  return 'violated'
}

/** True when a rule carries a guard that can be executed. */
export function hasRunnableGuard(guard: Guard | undefined): guard is Guard {
  return typeof guard?.command === 'string' && guard.command.trim().length > 0
}
