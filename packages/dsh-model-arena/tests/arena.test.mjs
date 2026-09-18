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

// --- Arena class tests (require temp dir) ---
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Arena } from '../lib/arena.js';
import { ArenaStore } from '../lib/store.js';

test('saveRun + getRun: round-trips a run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arena-'));
  try {
    const arena = new Arena(dir);
    const results = [
      { model: 'a', output: 'hello', promptTokens: 5, completionTokens: 2, latencyMs: 50 },
      { model: 'b', output: 'world', promptTokens: 5, completionTokens: 2, latencyMs: 60 },
    ];
    const run = arena.saveRun('hi', results);
    assert.ok(run.id);
    assert.equal(run.prompt, 'hi');
    assert.equal(run.results.length, 2);

    const fetched = arena.getRun(run.id);
    assert.ok(fetched);
    assert.equal(fetched.prompt, 'hi');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('listRuns: returns runs sorted by timestamp desc', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arena-'));
  try {
    const arena = new Arena(dir);
    const r = [{ model: 'x', output: 'a', promptTokens: 1, completionTokens: 1, latencyMs: 10 }];
    arena.saveRun('p1', r);
    arena.saveRun('p2', r);
    const list = arena.listRuns();
    assert.equal(list.length, 2);
    assert.ok(list[0].timestamp >= list[1].timestamp);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('compare: diffs two models in a run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arena-'));
  try {
    const arena = new Arena(dir);
    const results = [
      { model: 'a', output: 'hello\nworld', promptTokens: 5, completionTokens: 2, latencyMs: 50 },
      { model: 'b', output: 'hello\nthere', promptTokens: 5, completionTokens: 2, latencyMs: 60 },
    ];
    const run = arena.saveRun('hi', results);
    const cmp = arena.compare(run.id, 'a', 'b');
    assert.ok(cmp);
    assert.equal(cmp.modelA, 'a');
    assert.equal(cmp.modelB, 'b');
    assert.ok(cmp.diff.length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rate: sets userRating on a model', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arena-'));
  try {
    const arena = new Arena(dir);
    const results = [{ model: 'a', output: 'x', promptTokens: 1, completionTokens: 1, latencyMs: 10 }];
    const run = arena.saveRun('p', results);
    const updated = arena.rate(run.id, 'a', 5);
    assert.ok(updated);
    assert.equal(updated.scores['a'].userRating, 5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('saveSuite + getSuite: round-trips a suite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arena-'));
  try {
    const arena = new Arena(dir);
    const suite = { name: 'smoke', prompts: ['p1', 'p2'], models: ['a', 'b'] };
    arena.saveSuite(suite);
    // Verify via store directly (Arena doesn't expose getSuite)
    const store = new ArenaStore(dir);
    const fetched = store.getSuite('smoke');
    assert.ok(fetched);
    assert.equal(fetched.name, 'smoke');
    assert.deepEqual(fetched.prompts, ['p1', 'p2']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('regression: detects changed outputs between runs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arena-'));
  try {
    const arena = new Arena(dir);
    const baselineResults = [
      { model: 'a', output: 'hello world', promptTokens: 5, completionTokens: 2, latencyMs: 50 },
    ];
    const currentResults = [
      { model: 'a', output: 'goodbye world', promptTokens: 5, completionTokens: 2, latencyMs: 50 },
    ];
    const baselineRun = arena.saveRun('hi', baselineResults, 'hello world');
    const currentRun = arena.saveRun('hi', currentResults, 'hello world');

    const report = arena.regression('smoke', baselineRun.id, currentRun.id);
    assert.ok(report);
    assert.equal(report.suiteName, 'smoke');
    assert.equal(report.changes.length, 1);
    assert.equal(report.changes[0].model, 'a');
    // baseline matched reference, current didn't -> not improved
    assert.equal(report.changes[0].improved, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('regression: returns null for missing runs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arena-'));
  try {
    const arena = new Arena(dir);
    const report = arena.regression('smoke', 'nonexistent', 'alsogone');
    assert.equal(report, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
