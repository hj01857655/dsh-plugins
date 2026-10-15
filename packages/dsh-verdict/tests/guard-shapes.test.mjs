/**
 * Tests for the extended guard shapes: forbidden globs and required file contents.
 *
 * The same discipline as the original shapes applies, per platform: a shape is only
 * compiled when both platforms have a faithful equivalent, the command checks exactly
 * what the sentence says, and a guard that cannot run (missing file, bad quoting) is
 * `broken`, never a violation.
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { classify, compileGuard, runGuard } from '../lib/guard.js'

test('forbidden glob: "no *.pem files in the repo" compiles on both platforms', () => {
  assert.equal(compileGuard('no *.pem files in the repo', 'win32')?.command, 'cmd /c if exist "*.pem" exit 1')
  assert.equal(
    compileGuard('no *.pem files in the repo', 'linux')?.command,
    `[ -z "$(find . -maxdepth 1 -name '*.pem' -print -quit)" ]`,
  )
})

test('forbidden glob: dot-prefixed globs like .env compile without a location clause', () => {
  assert.equal(compileGuard('no .env files', 'win32')?.command, 'cmd /c if exist ".env" exit 1')
  assert.equal(
    compileGuard('no .env files', 'linux')?.command,
    `[ -z "$(find . -maxdepth 1 -name '.env' -print -quit)" ]`,
  )
})

test('forbidden glob: a plain noun is not guessed into a glob', () => {
  assert.equal(compileGuard('no lock files', 'linux'), undefined)
  assert.equal(compileGuard('never store secrets anywhere', 'linux'), undefined)
})

test('forbidden glob: a glob containing a single quote is not compiled on POSIX', () => {
  assert.equal(compileGuard(`no *'.pem files`, 'linux'), undefined)
})

test('forbidden glob: runGuard flags an existing match as violated on this platform', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'verdict-glob-'))
  try {
    writeFileSync(join(cwd, 'server.pem'), 'not a secret')
    const guard = compileGuard('no *.pem files', process.platform)
    assert.ok(guard, 'the glob shape must compile on the platform running the tests')
    assert.equal(runGuard('g', guard, cwd).outcome, 'violated')
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('forbidden glob: runGuard passes when nothing matches', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'verdict-glob-'))
  try {
    const guard = compileGuard('no *.pem files', process.platform)
    assert.ok(guard)
    assert.equal(runGuard('g', guard, cwd).outcome, 'passed')
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('file contents: "must mention" compiles as a fixed-string search on both platforms', () => {
  assert.equal(
    compileGuard('the file README.md must mention install', 'win32')?.command,
    'findstr /c:"install" "README.md"',
  )
  assert.equal(
    compileGuard('the file README.md must mention install', 'linux')?.command,
    `grep -qF 'install' 'README.md'`,
  )
})

test('file contents: optional "the word" phrasing still lands on the operand', () => {
  assert.equal(
    compileGuard('AGENTS.md must contain the word verdict', 'win32')?.command,
    'findstr /c:"verdict" "AGENTS.md"',
  )
})

test('file contents: a missing filename ("the file must mention x") is not compiled', () => {
  assert.equal(compileGuard('the file must mention install', 'linux'), undefined)
})

test('file contents: text containing a double quote is not compiled for cmd.exe', () => {
  assert.equal(compileGuard('README.md must mention say "hi"', 'win32'), undefined)
})

test('file contents: a file holding the phrase passes, a clean file violates', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'verdict-mention-'))
  try {
    const guard = compileGuard('NOTES.md must mention changelog', process.platform)
    assert.ok(guard)
    writeFileSync(join(cwd, 'NOTES.md'), 'see the changelog for details')
    assert.equal(runGuard('g', guard, cwd).outcome, 'passed')
    writeFileSync(join(cwd, 'NOTES.md'), 'nothing to see here')
    assert.equal(runGuard('g', guard, cwd).outcome, 'violated')
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('file contents: a missing file is broken, not violated', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'verdict-mention-'))
  try {
    const guard = compileGuard('NOTES.md must mention changelog', process.platform)
    assert.ok(guard)
    const run = runGuard('g', guard, cwd)
    // POSIX grep exits 2 with "No such file or directory" (already a hint); on Windows
    // findstr prints "Cannot open" — that text is what this assertion pins down.
    assert.equal(run.outcome, 'broken')
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('classify: "Cannot open" output is broken, whatever the exit code', () => {
  assert.equal(classify(1, 'FINDSTR: Cannot open NOTES.md'), 'broken')
})
