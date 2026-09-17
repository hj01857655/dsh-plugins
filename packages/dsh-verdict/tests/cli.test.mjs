/**
 * CLI tests.
 *
 * The CLI is the only surface usable without booting dsh, so its exit codes carry a real
 * contract: `check` must exit non-zero for a genuine violation and stay zero when the
 * only problem is a guard that cannot run.
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// fileURLToPath rather than stripping the leading slash by hand: on Windows a URL path
// is `/E:/...`, and a naive replace yields a path the child process cannot open — which
// surfaces as empty stdout rather than a clear error.
const CLI = fileURLToPath(new URL('../lib/bin.js', import.meta.url))

function fixture() {
  return mkdtempSync(join(tmpdir(), 'verdict-cli-'))
}

function verdict(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' })
}

test('help exits zero', () => {
  const dir = fixture()
  try {
    const r = verdict(['help'], dir)
    assert.equal(r.status, 0)
    assert.match(r.stdout, /usage:/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('unknown command exits 2', () => {
  const dir = fixture()
  try {
    assert.equal(verdict(['nope'], dir).status, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('learn promotes a checkable rule and records it', () => {
  const dir = fixture()
  try {
    const learned = verdict(['learn', 'never commit the file secrets.env'], dir)
    assert.equal(learned.status, 0)
    assert.match(learned.stdout, /promoted /)

    const listed = verdict(['list'], dir)
    assert.match(listed.stdout, /never commit the file secrets\.env/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('learn refuses to promote a rule with no checkable predicate', () => {
  const dir = fixture()
  try {
    const r = verdict(['learn', 'be more careful with deployments'], dir)
    assert.equal(r.status, 0)
    assert.match(r.stdout, /not promoted/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('check exits 0 when the rule holds and 1 when it is violated', () => {
  const dir = fixture()
  try {
    verdict(['learn', 'never commit the file secrets.env'], dir)
    assert.equal(verdict(['check'], dir).status, 0)

    writeFileSync(join(dir, 'secrets.env'), 'x')
    const violated = verdict(['check'], dir)
    assert.equal(violated.status, 1, 'a real violation must make the exit code non-zero')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('check stays zero when a guard cannot run', () => {
  const dir = fixture()
  try {
    // A command that does not exist: reported as broken, never as a violation.
    verdict(['learn', 'a rule', '--guard', 'definitely-not-a-real-binary-xyz'], dir)
    const r = verdict(['check'], dir)
    assert.equal(r.status, 0)
    assert.match(r.stdout, /could not run/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('sessions accumulate and surface as skill candidates', () => {
  const dir = fixture()
  try {
    for (let i = 0; i < 3; i += 1) {
      const r = verdict(
        ['session', '--intent', 'verify a change', '--outcome', 'success', '--step', 'run tests', '--step', 'commit'],
        dir,
      )
      assert.equal(r.status, 0)
    }
    const skills = verdict(['skills'], dir)
    assert.match(skills.stdout, /3× verify a change/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
