/**
 * The distiller's contract: only explicit memory verbs land in the log, and
 * each capture carries kind + provenance. Everything here is pure — no log, no
 * service — because the policy must be auditable without a harness.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { distill } from '../lib/capture.js'

test('explicit remember verbs are captured with kind and provenance', () => {
  const hits = distill('记住部署用 pnpm 而不是 npm。', 's1')
  assert.equal(hits.length, 1)
  assert.equal(hits[0].text, '部署用 pnpm 而不是 npm')
  assert.equal(hits[0].kind, 'preference')
  assert.equal(hits[0].source, 'user')
  assert.equal(hits[0].sessionId, 's1')
})

test('english remember-that is captured', () => {
  const hits = distill('Remember that the API key rotates every 90 days.', 's2')
  assert.equal(hits.length, 1)
  assert.equal(hits[0].text, 'the API key rotates every 90 days')
})

test('don\'t-forget becomes a must-rule', () => {
  const hits = distill("Don't forget to bump the version before publishing.", 's3')
  assert.equal(hits.length, 1)
  assert.equal(hits[0].text, 'must bump the version before publishing')
  assert.equal(hits[0].kind, 'pitfall')
})

test('ordinary conversation is NOT captured', () => {
  assert.deepEqual(distill('这个 bug 怎么修?', 's4'), [])
  assert.deepEqual(distill('帮我看看这段代码', 's4'), [])
  assert.deepEqual(distill('What time is the meeting?', 's4'), [])
  assert.deepEqual(distill('continue', 's4'), [])
})

test('以后 statements capture as standing preferences', () => {
  const hits = distill('以后都用 bun 跑测试', 's5')
  assert.equal(hits.length, 1)
  assert.equal(hits[0].text, '都用 bun 跑测试')
  assert.equal(hits[0].kind, 'preference')
})

test('one message can carry several statements, deduped', () => {
  const hits = distill('记住A方案被否决了。记住B方案通过。', 's6')
  assert.equal(hits.length, 2)
  const again = distill('记住A方案被否决了。记住B方案通过。记住A方案被否决了。', 's6')
  assert.equal(again.length, 2)
})

test('negative rules classify as pitfalls', () => {
  const hits = distill('记住不要把 secret 提交进仓库', 's7')
  assert.equal(hits.length, 1)
  assert.equal(hits[0].kind, 'pitfall')
})

test('short fragments are dropped', () => {
  assert.deepEqual(distill('记住。', 's8'), [])
  assert.deepEqual(distill('记住 ok', 's8'), [])
})
