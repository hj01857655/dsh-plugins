/**
 * Guard compilation and execution for memories.
 *
 * A memory is a claim, and this module is what decides whether the claim still holds.
 * It keeps the same distinction dsh-verdict does, for the same reason: **a check that
 * cannot run is not a memory that is wrong.** Conflating them would mean a mistyped
 * path in a guard marks a perfectly good memory as false, and the user learns to
 * ignore the output.
 *
 * Recognition is narrow on purpose. Only statement shapes whose checkable predicate is
 * unambiguous get a guard; everything else stays uncheckable and says so. Emitting an
 * approximate command would produce a check that exits 0 while verifying nothing, and
 * every later "verified" would be a lie.
 *
 * There is deliberately **no** shape that runs a command taken from memory text. A
 * memory can be written by the agent itself, so treating its content as an executable
 * command is an injection path — the templates below only ever interpolate quoted file
 * paths and literal search strings.
 *
 * @module context-memory/guard
 */

import { spawnSync } from 'node:child_process'

import type { Guard, GuardOutcome } from './types.js'

/** Enough output to diagnose, small enough to keep inline in the event log. */
const OUTPUT_LIMIT = 2000

/**
 * Compile a memory statement into an executable check.
 *
 * Commands are emitted for the platform in use. `process.platform` rather than a
 * hardcoded POSIX spelling: `test -e` on Windows would leave every compiled memory
 * permanently unrunnable, so verification would report on nothing while looking busy.
 */
export function compileGuard(text: string, platform: NodeJS.Platform = process.platform): Guard | undefined {
  const normalized = text.trim().replace(/\s+/g, ' ')
  const posix = platform !== 'win32'
  const operand = (value: string): string => (posix ? shellQuote(value) : `"${value.replace(/"/g, '\\"')}"`)

  // "the file X must not contain Y" — checked before the positive form so that the
  // negated sentence is never read as an assertion that Y is present.
  const fileLacks = /^(?:the )?(?:file|path) `?([^\s`]+)`? (?:must not|should not|never) (?:contain|mention|include) `?([^\s`]+)`?$/i.exec(
    normalized,
  )
  if (fileLacks?.[1] && fileLacks[2]) {
    const [file, needle] = [fileLacks[1], fileLacks[2]]
    // A quote inside the operand cannot survive cmd.exe's own quoting layer; refusing
    // beats emitting a command whose meaning differs from the sentence.
    if (!posix && needle.includes('"')) return undefined
    return {
      command: posix
        ? `! grep -qF ${shellQuote(needle)} ${shellQuote(file)}`
        : `findstr /c:${operand(needle)} ${operand(file)} >nul 2>nul && exit 1`,
      source: 'template',
    }
  }

  // "the file X contains Y" / "X mentions Y"
  const fileHas = /^(?:the )?(?:file|path) `?([^\s`]+)`? (?:contains|mentions|includes) `?([^\s`]+)`?$/i.exec(
    normalized,
  )
  if (fileHas?.[1] && fileHas[2]) {
    const [file, needle] = [fileHas[1], fileHas[2]]
    if (!posix && needle.includes('"')) return undefined
    return {
      command: posix
        ? `grep -qF ${shellQuote(needle)} ${shellQuote(file)}`
        : `findstr /c:${operand(needle)} ${operand(file)} >nul`,
      source: 'template',
    }
  }

  // "the file X exists" / "X exists" / "X is at <path>" is the same predicate.
  const fileExists = /^(?:the )?(?:file|path) `?([^\s`]+)`? (?:exists|is present)$/i.exec(normalized)
    ?? /^`?([^\s`]+)`? exists$/i.exec(normalized)
  if (fileExists?.[1]) {
    const target = operand(fileExists[1])
    return {
      command: posix ? `test -f ${target}` : `cmd /c if not exist ${target} exit 1`,
      source: 'template',
    }
  }

  // "there is no file X" / "never commit X"
  const fileAbsent = /^(?:there is no|there are no|no) (?:file )?`?([^\s`]+)`?$/i.exec(normalized)
    ?? /^(?:never|do not|don't) (?:create|add|commit|write|touch) (?:the )?(?:file )?`?([^\s`]+)`?$/i.exec(normalized)
  if (fileAbsent?.[1]) {
    const target = operand(fileAbsent[1])
    return {
      command: posix ? `! test -e ${target}` : `cmd /c if exist ${target} exit 1`,
      source: 'template',
    }
  }

  return undefined
}

/**
 * Quote a string so a POSIX shell treats it as one literal argument.
 *
 * Single quotes make every character literal; the only character that cannot appear
 * inside them is the quote itself, escaped by closing, escaping, and reopening.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * Run one guard to completion.
 *
 * `spawnSync` with a shell so compound commands work as written. No timeout: a guard
 * that hangs is a hang, and killing it after N seconds would turn "slow" into an
 * outcome that varies with machine load.
 */
export function runGuard(id: string, guard: Guard, cwd: string, now = new Date()) {
  const at = now.toISOString()
  let proc: ReturnType<typeof spawnSync>
  try {
    proc = spawnSync(guard.command, { cwd, shell: true, encoding: 'utf8' })
  } catch (error) {
    return { id, outcome: 'broken' as GuardOutcome, exitCode: null, output: String(error), at }
  }

  const output = `${proc.stdout ?? ''}${proc.stderr ?? ''}`.slice(0, OUTPUT_LIMIT)

  if (proc.error) {
    return { id, outcome: 'broken' as GuardOutcome, exitCode: null, output: `${output}${proc.error.message}`.slice(0, OUTPUT_LIMIT), at }
  }

  const code = proc.status
  if (code === null) {
    return { id, outcome: 'broken' as GuardOutcome, exitCode: null, output: output || 'terminated by signal', at }
  }

  return { id, outcome: classify(code, output), exitCode: code, output, at }
}

/**
 * Classify an exit code into an outcome.
 *
 * Two conventions mean "the command does not exist": POSIX shells use 127, cmd.exe
 * uses 9009. Both are recognised, along with the text shells print instead of a
 * distinctive code when the failure happens inside the shell. Without this, a
 * misspelled path would look like a memory being wrong about the world.
 */
export function classify(code: number, output = ''): GuardOutcome {
  if (code === 0) return 'passed'
  if (code === 127 || code === 9009) return 'broken'
  if (/command not found|is not recognized|No such file or directory|cannot open/i.test(output)) {
    return 'broken'
  }
  return 'violated'
}
