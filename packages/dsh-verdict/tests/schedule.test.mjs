/**
 * Tests for the scheduled re-check report line.
 *
 * The schedule itself is host wiring (a Cordis interval in `apply`); what is testable
 * here is the report contract: counts are always shown, and anything wrong is named by
 * id, because a bare count would send the user hunting for what broke.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CHECK_INTERVAL_MS, formatCheckReport } from '../lib/schedule.js'

const report = (over = {}) => ({
  runs: [], passed: [], violated: [], broken: [], demoted: [], exitCode: 0, ...over,
})

test('the interval is six hours', () => {
  assert.equal(CHECK_INTERVAL_MS, 6 * 60 * 60 * 1000)
})

test('an all-green pass logs counts only', () => {
  const line = formatCheckReport(report({ passed: ['a', 'b'] }))
  assert.equal(line, 'verdict re-check: 2 passed')
})

test('violations and broken guards are named by id, not counted silently', () => {
  const line = formatCheckReport(report({
    passed: ['a'],
    violated: ['bad-rule'],
    broken: ['typo-guard'],
  }))
  assert.match(line, /1 violated \(bad-rule\)/)
  assert.match(line, /1 broken \(typo-guard\)/)
})

test('demotions are part of the report', () => {
  const line = formatCheckReport(report({ demoted: ['hopeless'] }))
  assert.match(line, /demoted: hopeless/)
})
