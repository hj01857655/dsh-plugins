/**
 * The distiller's contract: only explicit memory verbs land in the log, and
 * each capture carries kind + provenance. Everything here is pure — no log, no
 * service — because the policy must be auditable without a harness.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { distill, candidates } from '../lib/capture.js'

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

// ------------------------------------------------ implicit candidates (P5)
//
// The wide net proposes; it never writes. Everything below is about what it declines to
// propose, because a candidate queue that fills with ordinary conversation is just a
// slower way of making recall useless.

test('candidates: a declarative technical statement is proposed, not remembered', () => {
  const found = candidates('我们用 sqlite 存会话数据', 's9')
  assert.equal(found.length, 1)
  assert.equal(found[0].text, '我们用 sqlite 存会话数据')
  assert.equal(found[0].sessionId, 's9')
  assert.equal(found[0].kind, 'fact')
})

test('candidates: English declarative statements are proposed', () => {
  const found = candidates('We use pnpm for this repo.', 's10')
  assert.equal(found.length, 1)
  assert.equal(found[0].text, 'We use pnpm for this repo')
})

test('candidates: a question is never a candidate', () => {
  assert.deepEqual(candidates('我们用 sqlite 吗？', 's11'), [])
  assert.deepEqual(candidates('Do we use sqlite?', 's11'), [])
  assert.deepEqual(candidates('我们用 sqlite 吗', 's11'), [])
})

test('candidates: a directive is never a candidate', () => {
  // "用 pnpm 装一下" is an instruction for this turn, not a fact about the project.
  assert.deepEqual(candidates('帮我用 pnpm 装一下依赖', 's12'), [])
  assert.deepEqual(candidates('Please use sqlite for the cache.', 's12'), [])
})

test('candidates: prose with no technical token is not proposed', () => {
  // Both are declarative, and only the first names something a future reader could act on.
  assert.deepEqual(candidates('我们用两个队列', 's13'), [])
  assert.deepEqual(candidates('这个方案听起来不错', 's13'), [])
})

test('candidates: a sentence that is already an explicit capture is not proposed twice', () => {
  // The user already said "remember this"; asking them to confirm it again is noise.
  const explicit = distill('记住我们用 pnpm 构建', 's14')
  assert.equal(explicit.length, 1)
  const found = candidates('记住我们用 pnpm 构建', 's14', explicit.map((item) => item.text))
  assert.deepEqual(found, [])
})

test('candidates: at most three are proposed from one message', () => {
  const message = [
    '我们用 pnpm 构建。',
    '我们用 sqlite 存数据。',
    '我们用 vitest 跑测试。',
    '我们用 esbuild 打包。',
  ].join('')
  assert.equal(candidates(message, 's15').length, 3)
})

test('candidates: negative rules keep their kind', () => {
  // Sentences are split on terminal punctuation only, so a comma keeps the two clauses
  // together — the same segmentation `distill` uses, and the leading negation decides
  // the kind for the whole sentence.
  const found = candidates('不要用 yarn，我们统一用 pnpm。', 's16')
  assert.equal(found.length, 1)
  assert.equal(found[0].kind, 'pitfall')
  assert.deepEqual(candidates('我们用 sqlite 存数据。', 's16').map((item) => item.kind), ['fact'])
})

