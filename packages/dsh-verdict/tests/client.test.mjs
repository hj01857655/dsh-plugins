/**
 * Tests for the client view model, diagnostics, and inventory.
 *
 * The client tests pin down what "the rule is fine" may mean: `verified` must reflect a
 * guard that actually ran and passed, never merely that the rule was promoted. The
 * comparison tests pin down the plugin's central question — did this change help — and
 * that it refuses to answer from a single side.
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { compare, panelState, readSnapshot, ruleRows, saveSnapshot, snapshot } from '../lib/client.js'
import { allOk, diagnose, renderDiagnostics } from '../lib/diagnose.js'
import { audit, inventory } from '../lib/inventory.js'
import { learn } from '../lib/pipeline.js'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'verdict-client-'))
  return { root, dataDir: join(root, '.verdict'), cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

test('panelState counts rules by state and separates broken from violated', () => {
  const { root, dataDir, cleanup } = fixture()
  try {
    learn(root, dataDir, 'never commit the file secrets.env')
    learn(root, dataDir, 'be more careful with deployments')

    const state = panelState(root, dataDir)
    assert.equal(state.counts.promoted, 1)
    assert.equal(state.counts.candidate, 1)
    assert.deepEqual(state.violated, [])
    assert.deepEqual(state.broken, [])
  } finally {
    cleanup()
  }
})

test('panels report an unhomed rule rather than assuming it is in force', () => {
  const { root, dataDir, cleanup } = fixture()
  try {
    learn(root, dataDir, 'never commit the file secrets.env')
    writeFileSync(join(root, 'AGENTS.md'), '# Agents\n')

    const state = panelState(root, dataDir)
    assert.deepEqual(state.unhomed, state.unhomed.length > 0 ? state.unhomed : [])
    assert.equal(state.unhomed.length, 1)
  } finally {
    cleanup()
  }
})

test('a promoted rule whose guard currently fails is not shown as verified', () => {
  const { root, dataDir, cleanup } = fixture()
  try {
    const result = learn(root, dataDir, 'a guarded rule', { guard: 'definitely-not-a-real-binary-xyz' })
    const { rows } = ruleRows(root, dataDir)
    const row = rows.find((r) => r.id === result.rule.id)
    assert.ok(row)
    assert.equal(row.state, 'promoted')
    assert.equal(row.verified, false, 'promoted is not the same as verified')
    assert.equal(row.broken, true)
  } finally {
    cleanup()
  }
})

test('comparing with a missing side reports insufficient instead of an improvement', () => {
  const { root, dataDir, cleanup } = fixture()
  try {
    const before = snapshot('before', root, dataDir)
    const result = compare(before, null)
    assert.equal(result.sufficient, false)
    assert.match(result.reason ?? '', /two snapshots/)
    assert.deepEqual(result.improved, [])
  } finally {
    cleanup()
  }
})

test('a rule that stopped failing counts as improved, not as a silent pass', () => {
  const { root, dataDir, cleanup } = fixture()
  try {
    const before = { label: 'b', at: 't', passed: [], violated: ['abc'], broken: [], exitCode: 1 }
    const after = { label: 'a', at: 't', passed: ['abc'], violated: [], broken: [], exitCode: 0 }
    const result = compare(before, after)
    assert.deepEqual(result.improved, ['abc'])
    assert.deepEqual(result.regressed, [])
  } finally {
    cleanup()
  }
})

test('a newly failing rule counts as regressed', () => {
  const before = { label: 'b', at: 't', passed: ['abc'], violated: [], broken: [], exitCode: 0 }
  const after = { label: 'a', at: 't', passed: [], violated: ['abc'], broken: [], exitCode: 1 }
  const result = compare(before, after)
  assert.deepEqual(result.regressed, ['abc'])
  assert.deepEqual(result.improved, [])
})

test('a guard that stops running is a guard change, never a verdict about the rule', () => {
  const before = { label: 'b', at: 't', passed: ['abc'], violated: [], broken: [], exitCode: 0 }
  const after = { label: 'a', at: 't', passed: [], violated: [], broken: ['abc'], exitCode: 0 }
  const result = compare(before, after)
  assert.deepEqual(result.regressed, [])
  assert.deepEqual(result.improved, [])
  assert.deepEqual(result.guardChanges, ['abc: guard stopped running'])
})

test('broken or missing evidence never counts as improvement or regression', () => {
  const snap = (passed, violated, broken) => ({ label: 'test', at: 't', passed, violated, broken, exitCode: violated.length ? 1 : 0 })
  for (const [before, after] of [
    [snap([], ['abc'], []), snap([], [], ['abc'])],
    [snap([], [], ['abc']), snap([], ['abc'], [])],
    [snap([], ['abc'], []), snap([], [], [])],
    [snap([], [], []), snap([], ['abc'], [])],
  ]) {
    const result = compare(before, after)
    assert.deepEqual(result.improved, [])
    assert.deepEqual(result.regressed, [])
  }
})

test('panel counts reflect demotion performed by that same check', () => {
  const { root, dataDir, cleanup } = fixture()
  try {
    learn(root, dataDir, 'never commit the file secrets.env')
    for (let episode = 0; episode < 2; episode++) {
      writeFileSync(join(root, 'secrets.env'), 'fixture')
      panelState(root, dataDir)
      rmSync(join(root, 'secrets.env'))
      panelState(root, dataDir)
    }
    writeFileSync(join(root, 'secrets.env'), 'fixture')
    const state = panelState(root, dataDir)
    assert.equal(state.counts.ineffective, 1)
    assert.equal(state.counts.promoted, 0)
    assert.equal(state.rules[0].state, 'ineffective')
  } finally {
    cleanup()
  }
})

test('snapshots persist and read back', () => {
  const { root, dataDir, cleanup } = fixture()
  try {
    assert.equal(readSnapshot(dataDir, 'before'), null)
    saveSnapshot(dataDir, 'before', snapshot('before', root, dataDir))
    const read = readSnapshot(dataDir, 'before')
    assert.ok(read)
    assert.equal(read.label, 'before')
  } finally {
    cleanup()
  }
})

test('doctor passes this package', () => {
  const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
  const results = diagnose(pkgRoot)
  const rendered = renderDiagnostics(results)
  assert.match(rendered, /patch id/)
  assert.equal(allOk(results), true, rendered)
})

test('doctor flags a missing patch file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdict-doc-'))
  try {
    mkdirSync(join(dir, 'lib'), { recursive: true })
    writeFileSync(join(dir, 'lib', 'index.js'), '')
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0', main: 'lib/index.js' }))
    const results = diagnose(dir)
    assert.equal(allOk(results), false)
    assert.ok(results.some((r) => r.name === 'cordis.patch.yml' && !r.ok))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('doctor flags a host-reserved package kept in dependencies', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdict-doc2-'))
  try {
    mkdirSync(join(dir, 'lib'), { recursive: true })
    writeFileSync(join(dir, 'lib', 'index.js'), '')
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'x', main: 'lib/index.js', dependencies: { '@deepseek-ai/cordis': '^4.0.0' } }),
    )
    const results = diagnose(dir)
    assert.ok(results.some((r) => !r.ok && r.detail.includes('peerDependencies')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('inventory finds a plugin and audit reports what would stop it loading', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdict-inv-'))
  try {
    const pluginDir = join(dir, 'plugins', 'broken-plugin')
    mkdirSync(join(pluginDir, 'lib'), { recursive: true })
    writeFileSync(join(pluginDir, 'lib', 'index.js'), '')
    writeFileSync(join(pluginDir, 'package.json'), JSON.stringify({ name: 'broken-plugin', version: '1.0.0', main: 'lib/index.js' }))

    const entries = inventory(dir)
    assert.equal(entries.length, 1)
    assert.equal(entries[0]?.registered, false)

    const findings = audit(dir)
    assert.ok(findings.some((f) => f.problem.includes('cordis.patch.yml')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('inventory ignores directories without a readable manifest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verdict-inv2-'))
  try {
    mkdirSync(join(dir, 'plugins', 'scratch'), { recursive: true })
    assert.deepEqual(inventory(dir), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
