/**
 * End-to-end smoke: learn -> promote -> check, over a real filesystem.
 *
 * Exercises the invariants that only show up once the whole pipeline runs: a checkable
 * rule gets promoted and then verified, an ongoing violation counts once, a rule whose
 * home lost its marker is reported as unhomed rather than passing, and a rule with no
 * checkable predicate is never promoted.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { check } from '../lib/check.js'
import { learn } from '../lib/pipeline.js'
import { readLedger } from '../lib/store.js'

const root = mkdtempSync(join(tmpdir(), 'verdict-e2e-'))
const dataDir = join(root, '.verdict')

writeFileSync(join(root, 'AGENTS.md'), '# Agents\n')
const a = learn(root, dataDir, 'never commit the file secrets.env')
console.log(`promote: promoted=${a.promoted} state=${a.rule.state} guard=${a.rule.guard?.command}`)

const passReport = check(dataDir, root)
console.log(`holds:   exit=${passReport.exitCode} passed=${passReport.passed.length} violated=${passReport.violated.length} broken=${passReport.broken.length}`)

writeFileSync(join(root, 'secrets.env'), 'x')
const v1 = check(dataDir, root)
console.log(`violate: exit=${v1.exitCode} violated=${v1.violated.length}`)

const v2 = check(dataDir, root)
const r = readLedger(dataDir).rules[a.rule.id]
console.log(`again:   recurrences=${r?.recurrences} observations=${r?.openViolation?.observations} state=${r?.state}`)

rmSync(join(root, 'secrets.env'))
const v3 = check(dataDir, root)
const fixed = readLedger(dataDir).rules[a.rule.id]
console.log(`fixed:   exit=${v3.exitCode} open=${fixed?.openViolation ? 'open' : 'closed'} recurrences=${fixed?.recurrences}`)

writeFileSync(join(root, 'AGENTS.md'), '# Agents\n')
const v4 = check(dataDir, root)
console.log(`unhomed: broken=${v4.broken.length} violated=${v4.violated.length} exit=${v4.exitCode}`)

const b = learn(root, dataDir, 'be more careful with deployments')
console.log(`no-guard: promoted=${b.promoted} state=${b.rule.state} reason=${b.reason}`)

rmSync(root, { recursive: true, force: true })
