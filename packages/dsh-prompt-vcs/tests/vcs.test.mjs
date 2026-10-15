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

// --- PromptVcs class tests (require temp dir) ---
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PromptVcs } from '../lib/vcs.js';

test('recordChange: records a change with diff', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vcs-'));
  try {
    const vcs = new PromptVcs(dir);
    const change = vcs.recordChange(join(dir, 'AGENTS.md'), 'old content', 'new content');
    assert.ok(change);
    assert.ok(change.hash);
    assert.equal(change.changedBy, 'user');
    assert.equal(change.addedLines, 1);
    assert.equal(change.removedLines, 1);
    assert.ok(change.diff.includes('-old content'));
    assert.ok(change.diff.includes('+new content'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('recordChange: identical content returns null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vcs-'));
  try {
    const vcs = new PromptVcs(dir);
    const change = vcs.recordChange(join(dir, 'AGENTS.md'), 'same', 'same');
    assert.equal(change, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('recordChange: attributes to plugin with pluginId', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vcs-'));
  try {
    const vcs = new PromptVcs(dir);
    const change = vcs.recordChange(join(dir, 'AGENTS.md'), 'a', 'b', 'plugin', 'dsh-verdict');
    assert.ok(change);
    assert.equal(change.changedBy, 'plugin');
    assert.equal(change.pluginId, 'dsh-verdict');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('timeline: returns entries in order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vcs-'));
  try {
    const vcs = new PromptVcs(dir);
    vcs.recordChange(join(dir, 'AGENTS.md'), 'v1', 'v2');
    vcs.recordChange(join(dir, 'AGENTS.md'), 'v2', 'v3');
    const tl = vcs.timeline();
    assert.equal(tl.length, 2);
    assert.ok(tl[0].timestamp <= tl[1].timestamp);
    assert.equal(tl[0].addedLines, 1);
    assert.equal(tl[1].addedLines, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('getDiff: returns diff for a given hash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vcs-'));
  try {
    const vcs = new PromptVcs(dir);
    const change = vcs.recordChange(join(dir, 'AGENTS.md'), 'old', 'new');
    const diff = vcs.getDiff(change.hash);
    assert.ok(diff);
    assert.ok(diff.includes('+new'));
    assert.ok(diff.includes('-old'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('getDiff: returns null for unknown hash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vcs-'));
  try {
    const vcs = new PromptVcs(dir);
    const diff = vcs.getDiff('nonexistent');
    assert.equal(diff, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rollback: restores file to previous content', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vcs-'));
  try {
    const vcs = new PromptVcs(dir);
    const filePath = join(dir, 'AGENTS.md');
    writeFileSync(filePath, 'v1', 'utf8');
    const change = vcs.recordChange(filePath, 'v1', 'v2');
    writeFileSync(filePath, 'v2', 'utf8');

    const ok = vcs.rollback(change.hash);
    assert.equal(ok, true);
    const content = readFileSync(filePath, 'utf8');
    assert.equal(content, 'v1');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rollback: records the rollback itself in history', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vcs-'));
  try {
    const vcs = new PromptVcs(dir);
    const filePath = join(dir, 'AGENTS.md');
    writeFileSync(filePath, 'v1', 'utf8');
    const change = vcs.recordChange(filePath, 'v1', 'v2');
    writeFileSync(filePath, 'v2', 'utf8');
    vcs.rollback(change.hash);

    const tl = vcs.timeline();
    // Original change + rollback change
    assert.equal(tl.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rollback: returns false for unknown hash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vcs-'));
  try {
    const vcs = new PromptVcs(dir);
    const ok = vcs.rollback('nonexistent');
    assert.equal(ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkFile: detects file changes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vcs-'));
  try {
    const vcs = new PromptVcs(dir);
    const filePath = join(dir, 'AGENTS.md');
    writeFileSync(filePath, 'initial', 'utf8');

    // First check — detects content from null
    const change1 = vcs.checkFile('AGENTS.md', null);
    assert.ok(change1);

    // No change since last check
    const change2 = vcs.checkFile('AGENTS.md', 'initial');
    assert.equal(change2, null);

    // File modified
    writeFileSync(filePath, 'updated', 'utf8');
    const change3 = vcs.checkFile('AGENTS.md', 'initial');
    assert.ok(change3);
    assert.ok(change3.addedLines > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
