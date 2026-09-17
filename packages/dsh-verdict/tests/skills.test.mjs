/**
 * Tests for session records and skill generation.
 *
 * The invariants here are about what may be distilled into a skill: only procedures that
 * succeeded, repeatedly, and through the same steps. A skill taught from failing runs
 * would encode the failure, so that case is covered explicitly.
 */

import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { recordSession, readSessions, groupByProcedure, procedureKey } from '../lib/session.js'
import { findCandidates, generateSkills, renderSkill, slugify, SKILL_THRESHOLD } from '../lib/skills.js'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'verdict-skill-'))
  const dataDir = join(root, '.verdict')
  return { root, dataDir, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

/** Record `n` successful sessions that all run the same steps. */
function repeatSuccess(dataDir, n, steps = ['run tests', 'commit changes']) {
  for (let i = 0; i < n; i += 1) {
    recordSession(dataDir, { trigger: 'test', intent: 'verify a change', outcome: 'success', steps, rules: [] })
  }
}

test('sessions are append-only and read back in order', () => {
  const { dataDir, cleanup } = fixture()
  try {
    const a = recordSession(dataDir, { trigger: 't', intent: 'first', outcome: 'success', steps: ['a'], rules: [] })
    const b = recordSession(dataDir, { trigger: 't', intent: 'second', outcome: 'failure', steps: ['b'], rules: [] })
    assert.equal(a.seq, 1)
    assert.equal(b.seq, 2)

    const all = readSessions(dataDir)
    assert.equal(all.length, 2)
    assert.equal(all[0]?.intent, 'first')
    assert.equal(all[1]?.outcome, 'failure')
  } finally {
    cleanup()
  }
})

test('procedureKey groups by step shape, not by incidental wording', () => {
  const { dataDir, cleanup } = fixture()
  try {
    const base = { trigger: 't', intent: 'x', outcome: 'success', rules: [] }
    const a = recordSession(dataDir, { ...base, steps: ['run tests', 'commit changes'] })
    const b = recordSession(dataDir, { ...base, steps: ['Run the tests', 'commit things'] })
    const c = recordSession(dataDir, { ...base, steps: ['deploy', 'ship'] })
    assert.equal(procedureKey(a), procedureKey(b))
    assert.notEqual(procedureKey(a), procedureKey(c))
  } finally {
    cleanup()
  }
})

test('a procedure below the threshold is not offered', () => {
  const { dataDir, cleanup } = fixture()
  try {
    repeatSuccess(dataDir, SKILL_THRESHOLD - 1)
    assert.equal(findCandidates(dataDir).length, 0)
  } finally {
    cleanup()
  }
})

test('a procedure at the threshold is offered, with its supporting evidence', () => {
  const { dataDir, cleanup } = fixture()
  try {
    repeatSuccess(dataDir, SKILL_THRESHOLD)
    const candidates = findCandidates(dataDir)
    assert.equal(candidates.length, 1)
    assert.equal(candidates[0]?.occurrences, SKILL_THRESHOLD)
    assert.deepEqual(candidates[0]?.steps, ['run tests', 'commit changes'])
    assert.equal(candidates[0]?.evidence.length, SKILL_THRESHOLD)
  } finally {
    cleanup()
  }
})

test('failed sessions never contribute to a skill', () => {
  const { dataDir, cleanup } = fixture()
  try {
    for (let i = 0; i < 5; i += 1) {
      recordSession(dataDir, {
        trigger: 't',
        intent: 'do the wrong thing',
        outcome: 'failure',
        steps: ['delete database', 'ship it'],
        rules: [],
      })
    }
    assert.equal(findCandidates(dataDir).length, 0, 'a procedure that only failed must not become a skill')
    assert.equal(readSessions(dataDir).length, 5, 'the failures are still recorded as evidence')
  } finally {
    cleanup()
  }
})

test('a mix of success and failure only distils the successes', () => {
  const { dataDir, cleanup } = fixture()
  try {
    for (let i = 0; i < SKILL_THRESHOLD; i += 1) {
      recordSession(dataDir, { trigger: 't', intent: 'x', outcome: 'success', steps: ['run tests'], rules: [] })
    }
    for (let i = 0; i < 4; i += 1) {
      recordSession(dataDir, { trigger: 't', intent: 'x', outcome: 'failure', steps: ['run tests'], rules: [] })
    }
    const candidates = findCandidates(dataDir)
    assert.equal(candidates.length, 1)
    assert.equal(candidates[0]?.occurrences, SKILL_THRESHOLD, 'failures must not inflate the count')
  } finally {
    cleanup()
  }
})

test('steps come from the shortest successful run, so detours are not prescribed', () => {
  const { dataDir, cleanup } = fixture()
  try {
    recordSession(dataDir, { trigger: 't', intent: 'x', outcome: 'success', steps: ['a', 'b'], rules: [] })
    recordSession(dataDir, { trigger: 't', intent: 'x', outcome: 'success', steps: ['a', 'b', 'c', 'd'], rules: [] })
    recordSession(dataDir, { trigger: 't', intent: 'x', outcome: 'success', steps: ['a', 'b'], rules: [] })
    const candidate = findCandidates(dataDir)[0]
    assert.deepEqual(candidate?.steps, ['a', 'b'])
  } finally {
    cleanup()
  }
})

test('intent is only stated when every run agreed', () => {
  const { dataDir, cleanup } = fixture()
  try {
    recordSession(dataDir, { trigger: 't', intent: 'one', outcome: 'success', steps: ['a'], rules: [] })
    recordSession(dataDir, { trigger: 't', intent: 'two', outcome: 'success', steps: ['a'], rules: [] })
    recordSession(dataDir, { trigger: 't', intent: 'one', outcome: 'success', steps: ['a'], rules: [] })
    assert.equal(findCandidates(dataDir)[0]?.intent, undefined)
  } finally {
    cleanup()
  }
})

test('generateSkills writes a readable skill file', () => {
  const { root, dataDir, cleanup } = fixture()
  try {
    repeatSuccess(dataDir, SKILL_THRESHOLD)
    const result = generateSkills(root, dataDir)
    assert.equal(result.written.length, 1)
    const path = result.written[0]?.path
    assert.ok(path)
    assert.ok(existsSync(path))

    const body = readFileSync(path, 'utf8')
    assert.match(body, /^---\nname: /)
    assert.match(body, /## Steps/)
    assert.match(body, /1\. run tests/)
  } finally {
    cleanup()
  }
})

test('renderSkill and slugify produce usable frontmatter', () => {
  const rendered = renderSkill({
    key: 'abc',
    steps: ['do a thing'],
    occurrences: 3,
    intent: 'Verify a change safely',
    evidence: [1, 2, 3],
  })
  assert.match(rendered, /name: verify-a-change-safely/)
  assert.equal(slugify('Hello, World!'), 'hello-world')
  assert.equal(slugify('  '), 'untitled-procedure')
})

test('groupByProcedure ignores partial outcomes', () => {
  const { dataDir, cleanup } = fixture()
  try {
    recordSession(dataDir, { trigger: 't', intent: 'x', outcome: 'partial', steps: ['a'], rules: [] })
    assert.equal(groupByProcedure(readSessions(dataDir)).size, 0)
  } finally {
    cleanup()
  }
})
