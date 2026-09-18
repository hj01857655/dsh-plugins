import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unifiedDiff } from '../lib/diff.js';

test('unifiedDiff: identical content', () => {
  const result = unifiedDiff('hello\nworld', 'hello\nworld');
  assert.equal(result.added, 0);
  assert.equal(result.removed, 0);
});

test('unifiedDiff: added line', () => {
  const result = unifiedDiff('a\nb', 'a\nb\nc');
  assert.equal(result.added, 1);
  assert.equal(result.removed, 0);
  assert.ok(result.diff.includes('+c'));
});

test('unifiedDiff: removed line', () => {
  const result = unifiedDiff('a\nb\nc', 'a\nb');
  assert.equal(result.added, 0);
  assert.equal(result.removed, 1);
  assert.ok(result.diff.includes('-c'));
});

test('unifiedDiff: modified line', () => {
  const result = unifiedDiff('hello', 'goodbye');
  assert.equal(result.added, 1);
  assert.equal(result.removed, 1);
});

test('unifiedDiff: empty to content', () => {
  const result = unifiedDiff('', 'new\ncontent');
  assert.equal(result.added, 2);
  assert.equal(result.removed, 0);
});

test('unifiedDiff: content to empty', () => {
  const result = unifiedDiff('old\ncontent', '');
  assert.equal(result.added, 0);
  assert.equal(result.removed, 2);
});

test('unifiedDiff: multi-line change', () => {
  const old = 'line1\nline2\nline3\nline4';
  const next = 'line1\nchanged2\nline3\nline4';
  const result = unifiedDiff(old, next);
  assert.equal(result.added, 1);
  assert.equal(result.removed, 1);
  assert.ok(result.diff.includes('-line2'));
  assert.ok(result.diff.includes('+changed2'));
});
