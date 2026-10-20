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
 * approximate check would produce one that passes while verifying nothing, and every
 * later "verified" would be a lie.
 *
 * There is deliberately **no** shape that runs a command taken from memory text. A
 * memory can be written by the agent itself, so treating its content as executable is
 * an injection path. That is why the checks below are evaluated in-process against the
 * filesystem rather than handed to a shell: the statement supplies operands (a path, a
 * search string) and never a program, an argument list, or shell syntax.
 *
 * **Why not a shell command.** This module used to compile each shape into a shell
 * command string and run it with `spawnSync(..., { shell: true })`, branching on
 * `process.platform`. That design made the central question — did the check run at
 * all? — undecidable on Windows. A guard whose program is missing and a guard whose
 * predicate is simply false both exit 1 through cmd.exe, and cmd.exe's own diagnostic
 * is a localized resource string: on a zh-CN host it arrives as GBK bytes reading
 * 不是内部或外部命令…, which decodes to mojibake under utf8, so neither an English nor
 * a Chinese pattern could reliably tell the two apart. Any classifier built on "what
 * did the shell say" is a classifier that answers differently per host language.
 *
 * The predicates are all filesystem facts. Four of them are about a file's *text*
 * (`exists` / `absent` / `contains` / `lacks`); four are about a file's *structure*
 * (`depends` / `script` / `option` / `lineLimit`), answered by `JSON.parse` and a line
 * count. Answered directly, they need no shell, no locale, no platform branch, and no
 * quoting layer — and the distinction this module exists to protect becomes a fact about
 * a return value instead of a guess about text.
 *
 * The structured predicates exist because the text ones cannot answer structural
 * questions honestly: `contains "tsx" package.json` passes when `tsx` appears in a
 * description or a script string, so it would report `passed` while verifying nothing.
 * Parsing is still in-process, and the memory still supplies only operands.
 *
 * @module context-memory/guard
 */

import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { StringDecoder } from 'node:string_decoder'

import { stripLeadingFillers } from './identity.js'
import type { Guard, GuardKind, GuardOutcome } from './types.js'

/**
 * Every guard kind this version can evaluate.
 *
 * This list is the single definition. `memory.ts` drops a guard whose kind is not in it
 * (a log written by a newer version), and the exhaustiveness assertion below turns
 * "added a kind to the union but forgot to teach the evaluator" into a compile error
 * rather than a runtime fallthrough into whichever branch happens to come last.
 */
export const GUARD_KINDS = [
  'exists',
  'absent',
  'contains',
  'lacks',
  'depends',
  'script',
  'option',
  'lineLimit',
] as const satisfies readonly GuardKind[]

/**
 * Compile-time exhaustiveness. Adding a kind to the `Guard` union without listing it
 * here fails to compile, with the message below as the error.
 */
type UnlistedKind = Exclude<GuardKind, (typeof GUARD_KINDS)[number]>
const _everyKindIsListed: UnlistedKind extends never
  ? true
  : 'a guard kind is missing from GUARD_KINDS in guard.ts' = true
void _everyKindIsListed

/** Enough output to diagnose, small enough to keep inline in the event log. */
const OUTPUT_LIMIT = 2000

/** How much of a file to scan for a containment check before giving up. */
const SCAN_LIMIT = 8 * 1024 * 1024

/**
 * Compile a memory statement into a check.
 *
 * The returned predicate names operands, never a program: `{ kind: 'exists', path }`
 * says what must be true, and `runGuard` decides it with `fs`. Nothing from the
 * statement text is ever executed, so a memory cannot smuggle in an injection.
 *
 * Operands are stored as written. Resolution against the project directory happens at
 * run time, so a memory stays meaningful if the project is moved or the check is
 * evaluated from a different working directory.
 */
export function compileGuard(text: string): Guard | undefined {
  // Discourse padding in front of the statement is dropped before matching, and by the
  // same function `normaliseSubject` uses: every pattern below is anchored at `^`, so a
  // statement the user prefixed with "note that" would otherwise get the subject of a
  // checkable claim and no check to go with it. The `distill` path already removes the
  // verb, which is exactly why this gap only showed up on direct writes.
  const normalized = stripLeadingFillers(text.trim().replace(/\s+/g, ' '))

  // ── Structured predicates ─
  //
  // Checked before the text predicates because they are strictly more specific: "the file
  // package.json contains tsx" is a text claim anyone can make, while "package.json
  // depends on tsx" is a claim about a *key*. If the text branch ran first, a statement
  // about a dependency would compile into a substring search that passes whenever the
  // package name appears anywhere in the file — including inside a script string — and
  // that check would report `passed` while verifying nothing.
  const dependency = compileDependency(normalized)
  if (dependency) return dependency
  const script = compileScript(normalized)
  if (script) return script
  const option = compileOption(normalized)
  if (option) return option
  const lines = compileLineLimit(normalized)
  if (lines) return lines

  // "the file X must not contain Y" — checked before the positive form so that the
  // negated sentence is never read as an assertion that Y is present.
  const fileLacks = /^(?:the )?(?:file|path) `?([^\s`]+)`? (?:must not|should not|never) (?:contain|mention|include) `?([^\s`]+)`?$/i.exec(
    normalized,
  )
  if (fileLacks?.[1] && fileLacks[2]) {
    return { kind: 'lacks', path: fileLacks[1], needle: fileLacks[2], source: 'template' }
  }

  // "the file X contains Y" / "X mentions Y"
  const fileHas = /^(?:the )?(?:file|path) `?([^\s`]+)`? (?:contains|mentions|includes) `?([^\s`]+)`?$/i.exec(
    normalized,
  )
  if (fileHas?.[1] && fileHas[2]) {
    return { kind: 'contains', path: fileHas[1], needle: fileHas[2], source: 'template' }
  }

  // "the file X exists" / "X exists" / "X is at <path>" is the same predicate.
  const fileExists = /^(?:the )?(?:file|path) `?([^\s`]+)`? (?:exists|is present)$/i.exec(normalized)
    ?? /^`?([^\s`]+)`? exists$/i.exec(normalized)
  if (fileExists?.[1]) {
    return { kind: 'exists', path: fileExists[1], source: 'template' }
  }

  // "there is no file X" / "never commit X"
  const fileAbsent = /^(?:there is no|there are no|no) (?:file )?`?([^\s`]+)`?$/i.exec(normalized)
    ?? /^(?:never|do not|don't) (?:create|add|commit|write|touch) (?:the )?(?:file )?`?([^\s`]+)`?$/i.exec(normalized)
  if (fileAbsent?.[1]) {
    return { kind: 'absent', path: fileAbsent[1], source: 'template' }
  }

  return undefined
}

/**
 * Read a manifest as JSON, or report why it could not be read.
 *
 * Nothing here is executed and nothing is resolved: a `package.json` is read as data, so
 * a malformed one is `broken` (the check could not be carried out), never `violated`
 * (the memory is wrong).
 */
function readJson(path: string, cwd: string): { value: unknown } | { error: string } {
  const target = resolveOperand(path, cwd)
  const scan = readForScan(target)
  if ('error' in scan) return { error: `cannot read ${target}: ${scan.error}` }
  try {
    return { value: JSON.parse(scan.text) as unknown }
  } catch (error) {
    return { error: `cannot parse ${target}: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/** A plain object, or nothing — used to walk a parsed manifest without casting. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

/**
 * "package.json depends on X" / "X is a dev dependency".
 *
 * A dependency claim is about a key, not a substring: the whole reason nobody could
 * verify "we use tsx" is that `grep tsx package.json` passes when `tsx` appears in a
 * script, a description, or a `files` entry. `runGuard` reads all four dependency maps.
 */
function compileDependency(text: string): Guard | undefined {
  const negated = /^(?:the )?package\.json (?:does not|doesn't|no longer) depend on `?([^\s`]+)`?$/i.exec(text)
    ?? /^`?([^\s`]+)`? is not a dependency$/i.exec(text)
  if (negated?.[1]) return { kind: 'depends', name: negated[1], absent: true, source: 'template' }

  const plain = /^(?:the )?package\.json depends on `?([^\s`]+)`?$/i.exec(text)
    ?? /^`?([^\s`]+)`? is a (?:dev )?dependency$/i.exec(text)
  if (plain?.[1]) return { kind: 'depends', name: plain[1], source: 'template' }
  return undefined
}

/**
 * "package.json script `build` runs `tsc`" / "there is no `build` script".
 *
 * The command is matched exactly as written. A prefix match would make `build runs tsc`
 * pass on `tsc --noEmit`, which is a different command; the statement has to be as
 * specific as the check.
 */
function compileScript(text: string): Guard | undefined {
  const negated = /^(?:the )?package\.json has no `?([^\s`]+)`? script$/i.exec(text)
    ?? /^there is no `?([^\s`]+)`? (?:npm )?script$/i.exec(text)
  if (negated?.[1]) return { kind: 'script', name: negated[1], absent: true, source: 'template' }

  const withCmd = /^(?:the )?package\.json script `?([^\s`]+)`? (?:runs|is|equals) `?([^`]+?)`?$/i.exec(text)
  if (withCmd?.[1] && withCmd[2]) {
    return { kind: 'script', name: withCmd[1], cmd: withCmd[2], source: 'template' }
  }

  const bare = /^(?:the )?package\.json has (?:a |an )?`?([^\s`]+)`? script$/i.exec(text)
  if (bare?.[1]) return { kind: 'script', name: bare[1], source: 'template' }
  return undefined
}

/**
 * "tsconfig enables `strict`" / "tsconfig does not enable `strict`".
 *
 * Only JSON config files (`tsconfig` / `jsconfig`, with or without the `.json`), and only
 * options that are single keys. A dotted path would be a second grammar for the same
 * feature; if a memory needs a nested option, the statement is not specific enough to
 * check yet.
 *
 * `tsconfig` is canonicalised to `tsconfig.json` here rather than at run time, so the
 * guard that lands in the log names the file it will actually be checked against. A
 * guard saying `path: "tsconfig"` would describe itself in terms no file has.
 */
function canonicalConfig(name: string): string {
  return name.endsWith('.json') ? name : `${name}.json`
}

function compileOption(text: string): Guard | undefined {
  const negated = /^(?:the )?(?:file )?`?(tsconfig|jsconfig)(?:\.json)?`? (?:does not|doesn't|no longer) (?:enable|set) `?([^\s`]+)`?$/i.exec(text)
    ?? /^(?:the )?(?:file )?`?(tsconfig|jsconfig)(?:\.json)?`? has `?([^\s`]+)`? disabled$/i.exec(text)
  if (negated?.[1] && negated[2]) {
    // `value: true` with `absent` is the negative of "the option is on" — so an option
    // that is missing *and* one that is explicitly `false` both satisfy it. Without the
    // value the predicate would degrade to "the key is missing", and "has strict
    // disabled" would then be violated by the perfectly correct `"strict": false`.
    return { kind: 'option', path: canonicalConfig(negated[1]), option: negated[2], value: true, absent: true, source: 'template' }
  }

  const enabled = /^(?:the )?(?:file )?`?(tsconfig|jsconfig)(?:\.json)?`? (?:enables|sets) `?([^\s`]+)`?$/i.exec(text)
    ?? /^(?:the )?(?:file )?`?(tsconfig|jsconfig)(?:\.json)?`? has `?([^\s`]+)`? enabled$/i.exec(text)
  if (enabled?.[1] && enabled[2]) {
    return { kind: 'option', path: canonicalConfig(enabled[1]), option: enabled[2], value: true, source: 'template' }
  }
  return undefined
}

/**
 * "the file X has at most N lines" / "at least N lines".
 *
 * Counted, not guessed: the scan helpers below refuse files above the scan limit, which
 * keeps a memory about a log file from turning every re-check into a full read.
 */
function compileLineLimit(text: string): Guard | undefined {
  const at = /^(?:the )?(?:file|path) `?([^\s`]+)`? has at (most|least) (\d+) lines?$/i.exec(text)
  if (!(at?.[1] && at[2] && at[3])) return undefined
  const count = Number(at[3])
  if (!Number.isSafeInteger(count) || count < 0) return undefined
  return at[2].toLowerCase() === 'most'
    ? { kind: 'lineLimit', path: at[1], max: count, source: 'template' }
    : { kind: 'lineLimit', path: at[1], min: count, source: 'template' }
}

/**
 * A human-readable rendering of a check, for the CLI and the log.
 *
 * Deliberately not a shell command: printing one would invite the reader to run it,
 * which is the interface this module just removed.
 */
export function describeGuard(guard: Guard): string {
  switch (guard.kind) {
    case 'exists': return `path "${guard.path}" exists`
    case 'absent': return `path "${guard.path}" does not exist`
    case 'contains': return `file "${guard.path}" contains "${guard.needle}"`
    case 'lacks': return `file "${guard.path}" does not contain "${guard.needle}"`
    case 'depends': return guard.absent === true
      ? `package.json does not depend on "${guard.name}"`
      : `package.json depends on "${guard.name}"`
    case 'script':
      if (guard.absent === true) return `package.json has no "${guard.name}" script`
      return guard.cmd === undefined
        ? `package.json has a "${guard.name}" script`
        : `package.json script "${guard.name}" is "${guard.cmd}"`
    case 'option':
      // "set to false" and "not set" are different facts, and the second is what the
      // negated predicate actually tests, so the description must not collapse them.
      if (guard.absent === true) {
        return guard.value === true
          ? `"${guard.path}" does not enable "${guard.option}"`
          : `"${guard.path}" does not set "${guard.option}" to ${JSON.stringify(guard.value)}`
      }
      if (guard.value === undefined) return `"${guard.path}" sets "${guard.option}"`
      return guard.value === true
        ? `"${guard.path}" enables "${guard.option}"`
        : `"${guard.path}" sets "${guard.option}" to false`
    case 'lineLimit':
      if (guard.max !== undefined) return `file "${guard.path}" has at most ${guard.max} lines`
      if (guard.min !== undefined) return `file "${guard.path}" has at least ${guard.min} lines`
      return `file "${guard.path}" has a line count`
  }
}

/**
 * Why a check contradicted a memory, in one line.
 *
 * `runGuard` reports a reason when the check could not run, but a check that ran and came
 * back false has nothing to report beyond its own verdict — `exists` and `absent` return
 * an empty `output`. Answering "contradicted" with no detail leaves the reader unable to
 * tell which path or which string was actually tested, so this falls back to the check's
 * own description: it names the operand the memory no longer matches, which is the fact
 * that made the memory wrong.
 */
export function describeContradiction(check: Guard | undefined, output: string | undefined): string {
  const first = output?.trim().split('\n')[0]
  if (first !== undefined && first.length > 0) return first
  return check === undefined ? 'its check' : describeGuard(check)
}

/**
 * Resolve a statement's operand against the project directory.
 *
 * Absolute operands are kept as written. Anything else is relative to the project the
 * memory was recorded in, because that is the directory the statement was talking
 * about — resolving against `process.cwd()` instead would make the same memory mean
 * different things depending on where the command happened to be invoked.
 */
export function resolveOperand(path: string, cwd: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path)
}

/** Size of one read when scanning a file. Fixed, never derived from the file's size. */
const SCAN_CHUNK = 64 * 1024

/**
 * Open a file for scanning, or report why it cannot be scanned.
 *
 * A containment claim about a huge file cannot be answered cheaply and honestly; saying
 * so keeps it out of the violated bucket where it does not belong.
 */
function openForScan(path: string): { fd: number } | { error: string } {
  try {
    const stats = statSync(path)
    if (stats.isDirectory()) return { error: `${path} is a directory` }
    if (stats.size > SCAN_LIMIT) return { error: `${path} is larger than ${SCAN_LIMIT} bytes` }
    return { fd: openSync(path, 'r') }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Walk a file in fixed-size chunks, handing each decoded piece to `sink`.
 *
 * A fixed window rather than one buffer sized by `stat`: an 8 MB file used to mean an
 * 8 MB allocation per check, and `verify` runs every check in the log, so the cost
 * multiplied by the number of memories. `StringDecoder` carries a multi-byte character
 * split across a chunk boundary rather than emitting a replacement character, which
 * would make a `contains` check disagree with a plain read of the same file.
 */
function scanChunks(path: string, sink: (chunk: string) => void): { error: string } | undefined {
  const opened = openForScan(path)
  if ('error' in opened) return opened
  const buffer = Buffer.allocUnsafe(SCAN_CHUNK)
  const decoder = new StringDecoder('utf8')
  try {
    for (;;) {
      const read = readSync(opened.fd, buffer, 0, buffer.length, null)
      if (read === 0) {
        const tail = decoder.end()
        if (tail.length > 0) sink(tail)
        return undefined
      }
      sink(decoder.write(buffer.subarray(0, read)))
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  } finally {
    closeSync(opened.fd)
  }
}

/** Read a file as text, or report why it could not be read. */
function readForScan(path: string): { text: string } | { error: string } {
  const parts: string[] = []
  const failure = scanChunks(path, (chunk) => { parts.push(chunk) })
  return failure ?? { text: parts.join('') }
}

/**
 * Whether a file's text contains `needle`.
 *
 * Answered from the stream, so a containment check never holds the file in memory. The
 * carry keeps a match straddling a chunk seam from being missed: a needle can only
 * cross the seam if it starts within `needle.length - 1` characters of it.
 */
function containsInFile(path: string, needle: string): { found: boolean } | { error: string } {
  const carryLength = Math.max(0, needle.length - 1)
  let carry = ''
  let found = false
  const failure = scanChunks(path, (chunk) => {
    if (found) return
    const window = carry + chunk
    if (window.includes(needle)) {
      found = true
      carry = ''
      return
    }
    carry = carryLength === 0 ? '' : window.slice(-carryLength)
  })
  return failure ?? { found }
}

/**
 * Count a file's lines.
 *
 * A trailing newline is not a line. `wc -l` would count it, but the statement "this file
 * has at most 500 lines" is about content, and an editor reports the content count — so
 * the two would disagree on every file that ends with a newline, which is most of them.
 */
function countFileLines(path: string): { lines: number } | { error: string } {
  let newlines = 0
  let lastChar = ''
  const failure = scanChunks(path, (chunk) => {
    if (chunk.length === 0) return
    newlines += chunk.split('\n').length - 1
    lastChar = chunk.slice(-1)
  })
  if (failure !== undefined) return failure
  // An empty file has no lines; otherwise a final newline terminates the last line
  // rather than starting a new one.
  if (lastChar === '') return { lines: 0 }
  return { lines: lastChar === '\n' ? newlines : newlines + 1 }
}

/** Where a dependency name may be declared. A claim is satisfied by any of them. */
const DEPENDENCY_MAPS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const

/**
 * The value of `option` in a parsed config file, and whether it was found.
 *
 * Two places are consulted, in this order: the top level, then `compilerOptions`. The
 * second is not decoration — `strict` lives inside `compilerOptions` in every real
 * `tsconfig.json`, so a top-level-only lookup would report a perfectly correct memory as
 * `violated`, and a false contradiction is the one outcome this module must not produce.
 * Top level wins when both exist, so the rule stays "the file's own outermost statement".
 */
function optionAt(record: Record<string, unknown>, option: string): { found: boolean; value: unknown } {
  if (Object.prototype.hasOwnProperty.call(record, option)) return { found: true, value: record[option] }
  const nested = asRecord(record.compilerOptions)
  if (nested !== undefined && Object.prototype.hasOwnProperty.call(nested, option)) {
    return { found: true, value: nested[option] }
  }
  return { found: false, value: undefined }
}

/**
 * Evaluate one check and say what happened.
 *
 * The three-way split is the whole point. `broken` covers "the check could not be
 * carried out" — an operand that resolves to nothing, a path that is a directory where
 * a file was named, a file too large to scan, a manifest that will not parse — and is
 * never evidence about the memory. `violated` is reserved for a check that ran and came
 * back false.
 *
 * No exit code is invented here. There is no child process, so there is no status to
 * report; `exitCode` is null and `output` carries the reason. The one place a caller
 * needs a process-style signal — `ContextMemory.exitCode` — derives it from the summary,
 * counting only `violated`.
 */
export function runGuard(id: string, guard: Guard, cwd: string, now = new Date()) {
  const at = now.toISOString()

  const verdict = (outcome: GuardOutcome, output = ''): { id: string; outcome: GuardOutcome; exitCode: number | null; output: string; at: string } =>
    ({ id, outcome, exitCode: null, output: output.slice(0, OUTPUT_LIMIT), at })

  if (guard.kind === 'exists' || guard.kind === 'absent') {
    const target = resolveOperand(guard.path, cwd)
    let present: boolean
    try {
      // `stat` follows symlinks, so a dangling link counts as absent — which is what
      // "the file X exists" means to someone about to open it.
      present = statSync(target) !== undefined
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      // ENOENT/ENOTDIR are answers ("no"), not failures to answer. Anything else —
      // EACCES, ELOOP, ENAMETOOLONG — means the check itself could not be trusted.
      if (code === 'ENOENT' || code === 'ENOTDIR') present = false
      else return verdict('broken', `cannot inspect ${target}: ${(error as Error).message}`)
    }
    if (guard.kind === 'exists') return verdict(present ? 'passed' : 'violated', present ? '' : `${target} does not exist`)
    return verdict(present ? 'violated' : 'passed', present ? `${target} exists` : '')
  }

  if (guard.kind === 'contains' || guard.kind === 'lacks') {
    const target = resolveOperand(guard.path, cwd)
    const scan = containsInFile(target, guard.needle)
    if ('error' in scan) return verdict('broken', `cannot read ${target}: ${scan.error}`)

    const found = scan.found
    if (guard.kind === 'contains') {
      return verdict(found ? 'passed' : 'violated', found ? '' : `${target} does not contain "${guard.needle}"`)
    }
    return verdict(found ? 'violated' : 'passed', found ? `${target} contains "${guard.needle}"` : '')
  }

  if (guard.kind === 'depends') {
    const manifest = readJson('package.json', cwd)
    if ('error' in manifest) return verdict('broken', manifest.error)
    const record = asRecord(manifest.value)
    // A manifest that parses to something other than an object cannot answer a question
    // about its keys, and saying `violated` would blame the memory for a broken file.
    if (record === undefined) return verdict('broken', `${resolveOperand('package.json', cwd)} is not a JSON object`)

    const declaredIn = DEPENDENCY_MAPS.filter((map) => {
      const deps = asRecord(record[map])
      return deps !== undefined && Object.prototype.hasOwnProperty.call(deps, guard.name)
    })
    const present = declaredIn.length > 0
    if (guard.absent !== true) {
      return verdict(present ? 'passed' : 'violated',
        present ? '' : `${guard.name} is in none of ${DEPENDENCY_MAPS.join(', ')}`)
    }
    return verdict(present ? 'violated' : 'passed',
      present ? `${guard.name} is declared in ${declaredIn.join(', ')}` : '')
  }

  if (guard.kind === 'script') {
    const manifest = readJson('package.json', cwd)
    if ('error' in manifest) return verdict('broken', manifest.error)
    const record = asRecord(manifest.value)
    if (record === undefined) return verdict('broken', `${resolveOperand('package.json', cwd)} is not a JSON object`)

    const scripts = asRecord(record.scripts)
    const present = scripts !== undefined && Object.prototype.hasOwnProperty.call(scripts, guard.name)
    if (guard.absent === true) {
      return verdict(present ? 'violated' : 'passed', present ? `scripts has "${guard.name}"` : '')
    }
    if (!present) return verdict('violated', `scripts has no "${guard.name}"`)
    if (guard.cmd === undefined) return verdict('passed')

    // Exact equality, not a prefix or a substring: `build runs tsc` must not pass on
    // `tsc --noEmit`, which is a different command with a different meaning.
    const actual = scripts[guard.name]
    const runs = typeof actual === 'string' ? actual.trim() : undefined
    if (runs === guard.cmd.trim()) return verdict('passed')
    return verdict('violated', `scripts.${guard.name} is ${JSON.stringify(actual ?? null)}, not ${JSON.stringify(guard.cmd)}`)
  }

  if (guard.kind === 'option') {
    const config = readJson(guard.path, cwd)
    if ('error' in config) return verdict('broken', config.error)
    const record = asRecord(config.value)
    if (record === undefined) return verdict('broken', `${resolveOperand(guard.path, cwd)} is not a JSON object`)

    const { found, value } = optionAt(record, guard.option)
    // Without an expected value the statement is only "the option is set", so presence
    // is the whole question. With one, absence and inequality are both violations: the
    // memory said `strict` is on and it is either missing or off.
    const satisfied = guard.value === undefined ? found : found && value === guard.value
    if (guard.absent !== true) {
      return verdict(satisfied ? 'passed' : 'violated',
        satisfied ? '' : found
          ? `"${guard.option}" is ${JSON.stringify(value)}`
          : `"${guard.option}" is not set in ${guard.path}`)
    }
    return verdict(satisfied ? 'violated' : 'passed',
      satisfied ? `"${guard.option}" is ${JSON.stringify(value)} in ${guard.path}` : '')
  }

  // lineLimit
  if (guard.kind === 'lineLimit') {
    if (guard.max === undefined && guard.min === undefined) {
      // A bound that states no bound cannot be evaluated. Passing it would be a check that
      // verifies nothing while reporting `passed`, which is the one outcome to avoid.
      return verdict('broken', 'the check states neither a maximum nor a minimum line count')
    }
    const target = resolveOperand(guard.path, cwd)
    const scan = countFileLines(target)
    if ('error' in scan) return verdict('broken', `cannot read ${target}: ${scan.error}`)
    const lines = scan.lines
    const withinMax = guard.max === undefined || lines <= guard.max
    const withinMin = guard.min === undefined || lines >= guard.min
    if (withinMax && withinMin) return verdict('passed')
    const expected = [
      guard.max === undefined ? undefined : `at most ${guard.max}`,
      guard.min === undefined ? undefined : `at least ${guard.min}`,
    ].filter((part): part is string => part !== undefined).join(' and ')
    return verdict('violated', `${target} has ${lines} lines, not ${expected}`)
  }

  // Unreachable while the dispatch above covers every member of `Guard`. The assignment is
  // the assertion: add a kind to the union and forget a branch, and this stops compiling
  // with the missing kind named in the error.
  const unhandled: never = guard
  return verdict('broken', `no evaluator for guard kind ${JSON.stringify((unhandled as { kind?: unknown }).kind)}`)
}

/**
 * Classify an exit code into an outcome.
 *
 * Kept for callers holding a status they did not produce themselves — the CLI reports
 * on log entries written by older versions of this plugin, which recorded a child
 * process's status. 127 is the POSIX convention for "command not found" and 9009 is
 * cmd.exe's, and both mean the check never ran.
 *
 * The textual fallback is gone along with the shell. It could only ever have worked on
 * an English host, and a classifier that reads differently depending on the system
 * language is not a classifier. `runGuard` no longer spawns anything, so no new entry
 * can carry a status that needs interpreting here.
 */
export function classify(code: number): GuardOutcome {
  if (code === 0) return 'passed'
  if (code === 127 || code === 9009) return 'broken'
  return 'violated'
}
