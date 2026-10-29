/**
 * The turn-end harvest: what a finished turn's tool results become.
 *
 * The harvest is deliberately shallow — sentence selection over tool-result text with the
 * same classification the capture seam applies to user text — so these tests pin the
 * selection rules rather than an intelligent summarizer: errors first, at most three per
 * turn, deduplicated by the id a memory would use, and never a statement that is already
 * known or already queued.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  collectTurnResults,
  flattenToolResultEvent,
  harvestTurn,
  isKnown,
  toProposeInput,
} from '../lib/harvest.js'
import { candidateId } from '../lib/candidates.js'

/** Build one `tool/result`-shaped event with text content. */
function resultEvent(seq, turn, step, text, isError = false) {
  return {
    type: 'tool/result',
    seq,
    data: {
      turn,
      step,
      message: {
        role: 'tool',
        isError,
        content: [{ type: 'text', text }],
      },
    },
  }
}

test('flatten: a tool result yields its concatenated text and flags', () => {
  const flat = flattenToolResultEvent(resultEvent(3, 1, 1, 'line one\nline two', true))
  assert.equal(flat.turn, 1)
  assert.equal(flat.step, 1)
  assert.equal(flat.isError, true)
  assert.equal(flat.text, 'line one\nline two')
})

test('flatten: a non tool-result event is not harvested', () => {
  assert.equal(flattenToolResultEvent({ type: 'user/message', seq: 1, data: {} }), undefined)
})

test('flatten: non-text blocks are ignored, not stringified', () => {
  const event = {
    type: 'tool/result',
    seq: 1,
    data: {
      turn: 0,
      step: 0,
      message: { content: [{ type: 'reasoning', text: 'secret' }, { type: 'text', text: 'visible' }] },
    },
  }
  const flat = flattenToolResultEvent(event)
  assert.equal(flat.text, 'visible')
})

test('collect: only the requested turn is folded', () => {
  const events = [
    resultEvent(0, 1, 0, 'first turn output'),
    resultEvent(1, 2, 0, 'second turn output'),
    resultEvent(2, 2, 1, 'second turn, step two'),
  ]
  const turnTwo = collectTurnResults(events, 2)
  assert.equal(turnTwo.length, 2)
  assert.ok(turnTwo.every((entry) => entry.turn === 2))
})

test('harvest: a failed command becomes a pitfall and comes first', () => {
  const results = [
    { turn: 1, step: 0, isError: false, text: 'the project uses pnpm as its package manager' },
    { turn: 1, step: 1, isError: true, text: 'error: Cannot find module better-sqlite3' },
  ]
  const harvested = harvestTurn(results, 'session-1', 1)
  assert.equal(harvested.length >= 1, true)
  assert.equal(harvested[0].kind, 'pitfall')
  assert.equal(harvested[0].reason, 'error')
  assert.match(harvested[0].text, /Cannot find module/)
})

test('harvest: at most three candidates per turn', () => {
  const results = [
    {
      turn: 1,
      step: 0,
      isError: false,
      text: [
        'the build uses pnpm for every package in this workspace',
        'the runtime is node v22 and the engines field requires it',
        'the config file lives at config/app.json for the desktop profile',
        'the tests run through node --test without a framework',
        'the plugin registry rejects packages with install scripts',
      ].join('\n'),
    },
  ]
  const harvested = harvestTurn(results, 'session-1', 1)
  assert.equal(harvested.length, 3)
})

test('harvest: short fragments are dropped', () => {
  const results = [{ turn: 1, step: 0, isError: false, text: 'ok\n2 files' }]
  assert.deepEqual(harvestTurn(results, 'session-1', 1), [])
})

test('harvest: the same sentence twice in one turn is proposed once', () => {
  const line = 'the build uses pnpm for every package in this workspace'
  const results = [
    { turn: 1, step: 0, isError: false, text: line },
    { turn: 1, step: 1, isError: false, text: line },
  ]
  const harvested = harvestTurn(results, 'session-1', 1)
  assert.equal(harvested.filter((entry) => entry.text === line).length, 1)
})

test('harvest: the propose input carries the kind and session', () => {
  const harvested = harvestTurn(
    [{ turn: 4, step: 0, isError: true, text: 'error: permission denied writing to /etc/hosts' }],
    'session-9',
    4,
  )
  const input = toProposeInput(harvested[0])
  assert.equal(input.kind, 'pitfall')
  assert.equal(input.sessionId, 'session-9')
  assert.equal(input.text, harvested[0].text)
})

test('known: a statement already in the log is not harvested again', () => {
  const harvested = harvestTurn(
    [{ turn: 1, step: 0, isError: false, text: 'the build uses pnpm for every package here' }],
    'session-1',
    1,
  )
  const candidate = harvested[0]
  // Feed the id back as if a memory with that exact text existed.
  const proposed = toProposeInput(candidate)
  const queuedId = { id: 'whatever' }
  assert.equal(isKnown(candidate, { has: () => false }, []), false)
  assert.equal(isKnown(candidate, { has: () => true }, []), true)
  // A queued candidate with the same id also suppresses it.
  const idOf = candidateId(proposed.text)
  assert.equal(isKnown(candidate, { has: () => false }, [{ id: idOf }]), true)
  assert.equal(isKnown(candidate, { has: () => false }, [queuedId]), false)
})
