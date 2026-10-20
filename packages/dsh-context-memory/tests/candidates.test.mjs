/**
 * The candidate queue: proposals are questions, decisions are answers, and neither is a
 * memory until someone accepts.
 *
 * The property worth protecting is the one that made P5 a product decision rather than a
 * regex: nothing the heuristics notice reaches recall on its own. Every test here checks
 * that boundary from one side or the other.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ContextMemory } from '../lib/memory.js';
import { CandidateQueue } from '../lib/candidates.js';

function tempProject() {
  return mkdtempSync(join(tmpdir(), 'context-memory-candidates-'));
}

// ---------------------------------------------------------------- the queue on its own

test('candidates: a proposal is pending until someone decides', () => {
  const dir = tempProject();
  try {
    const queue = new CandidateQueue(dir);
    const proposed = queue.propose({ text: 'we use sqlite' }, { has: () => false });
    assert.ok(proposed);
    assert.equal(queue.pending().length, 1);

    assert.equal(queue.decide(proposed.id, 'dismissed'), true);
    assert.equal(queue.pending().length, 0, 'a decided candidate is no longer a question');
    assert.equal(queue.get(proposed.id).status, 'dismissed', 'and the answer is kept');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('candidates: the same statement is not proposed twice, even after a dismissal', () => {
  // Re-asking every step is how a suggestion becomes nagging. The log holds the answer,
  // so a second process reading the same file reaches the same conclusion.
  const dir = tempProject();
  try {
    const queue = new CandidateQueue(dir);
    const first = queue.propose({ text: 'we use sqlite' }, { has: () => false });
    queue.decide(first.id, 'dismissed');
    assert.equal(queue.propose({ text: 'we use sqlite' }, { has: () => false }), undefined);

    // A fresh instance over the same file must agree — the suppression is on disk.
    const reopened = new CandidateQueue(dir);
    assert.equal(reopened.propose({ text: 'we use sqlite' }, { has: () => false }), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('candidates: a statement already remembered is never proposed', () => {
  const dir = tempProject();
  try {
    const queue = new CandidateQueue(dir);
    assert.equal(queue.propose({ text: 'we use sqlite' }, { has: () => true }), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('candidates: deciding an unknown or already-decided id reports false', () => {
  const dir = tempProject();
  try {
    const queue = new CandidateQueue(dir);
    assert.equal(queue.decide('nope', 'dismissed'), false);
    const proposed = queue.propose({ text: 'we use sqlite' }, { has: () => false });
    queue.decide(proposed.id, 'accepted');
    assert.equal(queue.decide(proposed.id, 'dismissed'), false, 'a settled question cannot be re-answered');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('candidates: a decision naming an unknown candidate is skipped, not invented', () => {
  const dir = tempProject();
  try {
    writeFileSync(join(dir, 'candidates.jsonl'), [
      JSON.stringify({ type: 'propose', at: 1, candidate: { id: 'a', text: 'x', kind: 'fact', proposedAt: 1 } }),
      JSON.stringify({ type: 'decide', at: 2, id: 'ghost', status: 'dismissed' }),
    ].join('\n') + '\n', 'utf8');
    const queue = new CandidateQueue(dir);
    assert.deepEqual(queue.all().map((item) => item.id), ['a']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('candidates: a torn trailing line is dropped, the rest of the queue is kept', () => {
  const dir = tempProject();
  try {
    writeFileSync(join(dir, 'candidates.jsonl'), [
      JSON.stringify({ type: 'propose', at: 1, candidate: { id: 'a', text: 'x', kind: 'fact', proposedAt: 1 } }),
      '{"type":"propose","at":2,"cand',
    ].join('\n'), 'utf8');
    assert.equal(new CandidateQueue(dir).pending().length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- through the service

test('candidates: a proposal does not become a memory, and recall never sees it', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const proposed = memory.propose({ text: 'we use sqlite for sessions', sessionId: 's1' });
    assert.ok(proposed);

    assert.equal(memory.active().length, 0, 'a proposal is not a memory');
    assert.deepEqual(memory.recall('sqlite'), [], 'and it cannot be recalled');
    assert.equal(memory.panel().candidates.length, 1);
    assert.equal(memory.panel().totals.active, 0);
    assert.equal(memory.panel().totals.candidates, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('candidates: accepting writes a memory with the proposed kind and provenance', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const proposed = memory.propose({ text: 'we use sqlite for sessions', kind: 'decision', sessionId: 's1' });
    const stored = memory.accept(proposed.id);
    assert.ok(stored);
    assert.equal(stored.text, 'we use sqlite for sessions');
    assert.equal(stored.kind, 'decision');
    assert.equal(stored.source, 'user', 'a person said yes, so it is the user speaking');
    assert.equal(stored.sessionId, 's1');
    assert.equal(memory.panel().candidates.length, 0, 'the question is settled');
    assert.equal(memory.active().length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('candidates: accepting with an edited text remembers the edit', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const proposed = memory.propose({ text: '我们用 sqlite' });
    const stored = memory.accept(proposed.id, { text: '我们用 sqlite 存会话数据' });
    assert.equal(stored.text, '我们用 sqlite 存会话数据');
    assert.equal(memory.active().length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('candidates: a dismissed proposal stays dismissed and is not re-proposed', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const proposed = memory.propose({ text: 'we use sqlite' });
    assert.equal(memory.dismiss(proposed.id), true);
    assert.equal(memory.candidates().length, 0);
    assert.equal(memory.propose({ text: 'we use sqlite' }), undefined);
    assert.equal(memory.active().length, 0, 'dismissing never writes a memory');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('candidates: accepting an already-remembered statement folds rather than duplicates', () => {
  // The dedupe at propose time is by id, and `accept` re-derives the same id, so a
  // candidate proposed before the memory existed cannot produce a second copy.
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const proposed = memory.propose({ text: 'we use sqlite' });
    memory.remember({ text: 'we use sqlite' });
    const stored = memory.accept(proposed.id);
    assert.equal(stored.id, proposed.id);
    assert.equal(memory.active().length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('candidates: an accepted empty edit is refused rather than storing nothing', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const proposed = memory.propose({ text: 'we use sqlite' });
    assert.equal(memory.accept(proposed.id, { text: '   ' }), undefined);
    assert.equal(memory.active().length, 0);
    // The candidate is still pending: a refused edit is not an answer to the question.
    assert.equal(memory.candidates().length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('candidates: the queue lives beside the project log, not inside it', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    memory.remember({ text: 'the file package.json exists' });
    memory.propose({ text: 'we use sqlite' });
    // Two files, one directory: a candidate is not an event in the memory log, and a
    // reader of `events.jsonl` must never see one.
    const events = readFileSync(join(dir, '.memory', 'events.jsonl'), 'utf8');
    assert.ok(!events.includes('sqlite'));
    assert.ok(existsSync(join(dir, '.memory', 'candidates.jsonl')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
