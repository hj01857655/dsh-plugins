import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoScore, similarity } from '../lib/scoring.js';
import { lineDiff, diffSummary } from '../lib/diff.js';

test('similarity: identical strings', () => {
  assert.equal(similarity('hello world', 'hello world'), 1);
});

test('similarity: completely different', () => {
  assert.equal(similarity('abc', 'xyz'), 0);
});

test('similarity: partial overlap', () => {
  const s = similarity('hello world', 'hello there');
  assert.ok(s > 0 && s < 1);
});

test('autoScore: produces scores for each model', () => {
  const results = [
    { model: 'a', output: 'short', promptTokens: 10, completionTokens: 5, latencyMs: 100 },
    { model: 'b', output: 'longer output here', promptTokens: 10, completionTokens: 15, latencyMs: 200 },
  ];
  const scores = autoScore(results);
  assert.ok(scores['a']);
  assert.ok(scores['b']);
  assert.ok(scores['a'].lengthScore !== undefined && scores['a'].lengthScore < scores['b'].lengthScore);
  assert.ok(scores['a'].latencyScore !== undefined && scores['a'].latencyScore > scores['b'].latencyScore);
});

test('autoScore: with reference', () => {
  const results = [
    { model: 'a', output: 'hello world', promptTokens: 10, completionTokens: 5, latencyMs: 100 },
    { model: 'b', output: 'goodbye world', promptTokens: 10, completionTokens: 5, latencyMs: 100 },
  ];
  const scores = autoScore(results, 'hello world');
  assert.ok(scores['a'].referenceMatch !== undefined && scores['b'].referenceMatch !== undefined && scores['a'].referenceMatch > scores['b'].referenceMatch);
});

test('lineDiff: identical lines', () => {
  const diff = lineDiff('a\nb\nc', 'a\nb\nc');
  assert.equal(diff.length, 3);
  assert.equal(diff[0].type, 'same');
});

test('lineDiff: added line', () => {
  const diff = lineDiff('a\nb', 'a\nb\nc');
  assert.equal(diff.length, 3);
  assert.equal(diff[2].type, 'added');
  assert.equal(diff[2].text, 'c');
});

test('lineDiff: removed line', () => {
  const diff = lineDiff('a\nb\nc', 'a\nb');
  assert.equal(diff.length, 3);
  assert.equal(diff[2].type, 'removed');
});

test('diffSummary: counts changes', () => {
  const s = diffSummary('a\nb\nc', 'a\nx\nc');
  assert.equal(s.removed, 1);
  assert.equal(s.added, 1);
  assert.equal(s.changed, 2);
});
