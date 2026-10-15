/**
 * Invariant tests for identity, guard classification, and recurrence counting.
 *
 * These three are the load-bearing claims: that a repeated lesson is recognised as the
 * same rule, that a guard which cannot run is never counted as a violated rule, and that
 * an ongoing violation is one recurrence rather than one per run. If any of them breaks,
 * every verdict the plugin reports is suspect.
 *
 * Run with: node --test tests/*.test.js  (after `pnpm run build`)
 */

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { ruleId, normalizeRuleText } from '../lib/identity.js'
import { classify, compileGuard, runGuard, shellQuote } from '../lib/guard.js'
import { foldOutcome, INEFFECTIVE_THRESHOLD } from '../lib/check.js'
import { capture, readLedger } from '../lib/store.js'
import { planPromotion, verifyHome, promote, marker } from '../lib/promote.js'

function fixture() {
  return mkdtempSync(join(tmpdir(), 'verdict-'))
}

function makeRule(over = {}) {
  return {
    id: 'abc123',
    text: 'run tests before commit',
    state: 'promoted',
    createdAt: new Date().toISOString(),
    recurrences: 0,
    ...over,
  }
}

test('identity: same text yields the same id regardless of case or trailing punctuation', () => {
  assert.equal(ruleId('Run tests before commit.'), ruleId('run tests before commit'))
  assert.equal(ruleId('Run  tests   before commit'), ruleId('run tests before commit'))
})

test('identity: normalization collapses whitespace and casefolds', () => {
  assert.equal(normalizeRuleText('  A   B '), 'a b')
})

test('capture is idempotent: repeating a lesson does not create a second rule', () => {
  const root = fixture()
  try {
    const first = capture(root, 'run tests before commit')
    const second = capture(root, 'Run tests before commit.')
    assert.equal(first.created, true)
    assert.equal(second.created, false)
    assert.equal(Object.keys(readLedger(root).rules).length, 1)
    assert.equal(second.rule.id, first.rule.id)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('classify: a missing command is broken, not violated', () => {
  assert.equal(classify(127), 'broken')
  assert.equal(classify(9009), 'broken')
  assert.equal(classify(0), 'passed')
  assert.equal(classify(1), 'violated')
})

test('classify: textual hints are recognised when the code is not distinctive', () => {
  assert.equal(classify(1, 'sh: foo: command not found'), 'broken')
  assert.equal(classify(1, "'foo' is not recognized as an internal or external command"), 'broken')
  // A rule genuinely failing is still violated even with output present.
  assert.equal(classify(1, 'expected 3 assertions, got 2'), 'violated')
})

test('shellQuote neutralises shell metacharacters', () => {
  assert.equal(shellQuote("a'b"), "'a'\\''b'")
})

test('compileGuard: recognises an unambiguous predicate and quotes the operand', () => {
  const posix = compileGuard('never commit the file secrets.env', 'linux')
  assert.ok(posix)
  assert.match(posix.command, /^! test -e 'secrets\.env'$/)

  // The same rule must compile to something runnable on Windows rather than to a POSIX
  // command that could never execute there.
  const win = compileGuard('never commit the file secrets.env', 'win32')
  assert.ok(win)
  assert.match(win.command, /^cmd \/c if exist "secrets\.env" exit 1$/)
})

test('compileGuard: omits shapes with no faithful equivalent on the platform', () => {
  assert.equal(compileGuard('never use console.log', 'win32'), undefined)
  assert.ok(compileGuard('never use console.log', 'linux'))
})

test('compileGuard: returns undefined rather than inventing a check for unclear text', () => {
  assert.equal(compileGuard('be more careful with deployments'), undefined)
})

test('recurrence: an ongoing violation counts once, however many runs observe it', () => {
  const rule = makeRule()
  const violated = () => ({
    ruleId: rule.id,
    outcome: 'violated',
    exitCode: 1,
    output: '',
    at: new Date().toISOString(),
  })

  foldOutcome(rule, violated())
  assert.equal(rule.recurrences, 1)
  foldOutcome(rule, violated())
  foldOutcome(rule, violated())
  assert.equal(rule.recurrences, 1, 'a continuing violation must not inflate the counter')
  assert.equal(rule.openViolation?.observations, 3)
})

test('recurrence: clearing and re-violating opens a new episode and counts it', () => {
  const rule = makeRule()
  const run = (outcome) => ({
    ruleId: rule.id,
    outcome,
    exitCode: outcome === 'passed' ? 0 : 1,
    output: '',
    at: new Date().toISOString(),
  })

  foldOutcome(rule, run('violated'))
  foldOutcome(rule, run('passed'))
  assert.equal(rule.openViolation, undefined)

  foldOutcome(rule, run('violated'))
  assert.equal(rule.recurrences, 2)
})

test('recurrence: a broken guard never counts as a violation', () => {
  const rule = makeRule()
  foldOutcome(rule, { ruleId: rule.id, outcome: 'broken', exitCode: 127, output: '', at: new Date().toISOString() })
  assert.equal(rule.recurrences, 0)
  assert.equal(rule.openViolation, undefined)
  assert.equal(rule.state, 'promoted')
})

test('recurrence: reaching the threshold demotes the rule to ineffective', () => {
  const rule = makeRule()
  const violated = () => ({
    ruleId: rule.id,
    outcome: 'violated',
    exitCode: 1,
    output: '',
    at: new Date().toISOString(),
  })
  const passed = () => ({
    ruleId: rule.id,
    outcome: 'passed',
    exitCode: 0,
    output: '',
    at: new Date().toISOString(),
  })

  for (let i = 0; i < INEFFECTIVE_THRESHOLD; i += 1) {
    foldOutcome(rule, violated())
    foldOutcome(rule, passed())
  }
  assert.equal(rule.recurrences, INEFFECTIVE_THRESHOLD)
  assert.equal(rule.state, 'ineffective')
})

test('promotion: refuses a rule with no runnable guard', () => {
  const plan = planPromotion('# Agents\n', makeRule())
  assert.ok('error' in plan)
})

test('promotion: writes a marker block, and re-promoting rewrites instead of appending', () => {
  const rule = makeRule({ guard: { command: 'test -f x', source: 'template' } })
  const first = planPromotion('# Agents\n', rule)
  assert.ok(!('error' in first))
  assert.ok(first.next.includes(marker(rule.id)))

  const second = planPromotion(first.next, rule)
  assert.ok(!('error' in second))
  assert.equal(second.rewritten, true)
  assert.equal(second.next.split(marker(rule.id)).length - 1, 2, 'exactly one open and one close marker')
})

test('home verification: a promoted rule is only in force while its marker is in the file', () => {
  const root = fixture()
  try {
    mkdirSync(join(root, '.verdict'))
    const rule = makeRule({ guard: { command: 'test -f x', source: 'template' } })
    promote(root, rule)
    assert.equal(verifyHome(root, rule), true)

    writeFileSync(join(root, 'AGENTS.md'), '# Agents\n')
    assert.equal(verifyHome(root, rule), false, 'a removed marker must be detected, not assumed')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('runGuard: a guard that cannot be spawned reports broken, not violated', () => {
  const run = runGuard('x', { command: 'definitely-not-a-real-binary-xyz', source: 'template' }, fixture())
  assert.equal(run.outcome, 'broken')
})

test('runGuard: a passing guard passes and a failing guard is violated', () => {
  const dir = fixture()
  try {
    // Exit codes are exercised through the platform's own shell rather than through
    // `node -e`: quoting a path that contains spaces behaves differently in cmd.exe and
    // in POSIX shells, and that difference is not what this test is about.
    const exitWith = (code) => (process.platform === 'win32' ? `cmd /c exit ${code}` : `exit ${code}`)

    const pass = runGuard('x', { command: exitWith(0), source: 'explicit' }, dir)
    const fail = runGuard('x', { command: exitWith(1), source: 'explicit' }, dir)
    assert.equal(pass.outcome, 'passed')
    assert.equal(fail.outcome, 'violated')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
