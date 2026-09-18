import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Replay } from '../lib/replay.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const tmpDir = mkdtempSync(join(tmpdir(), 'replay-test-'));

test('record: appends steps with incrementing step number', () => {
  const r = new Replay(tmpDir);
  const s1 = r.record('s1', { type: 'model', input: 'hello', output: 'world', latencyMs: 100, timestamp: Date.now() });
  const s2 = r.record('s1', { type: 'tool', input: { cmd: 'ls' }, output: 'files', latencyMs: 50, timestamp: Date.now() });
  assert.equal(s1.step, 0);
  assert.equal(s2.step, 1);
});

test('getTrace: returns all steps', () => {
  const r = new Replay(tmpDir);
  r.record('s2', { type: 'model', input: 'a', output: 'b', latencyMs: 10, timestamp: Date.now() });
  r.record('s2', { type: 'tool', input: 'c', output: 'd', latencyMs: 20, timestamp: Date.now() });
  const trace = r.getTrace('s2');
  assert.equal(trace.length, 2);
});

test('step: returns step at index', () => {
  const r = new Replay(tmpDir);
  r.record('s3', { type: 'model', input: 'x', output: 'y', latencyMs: 10, timestamp: Date.now() });
  r.record('s3', { type: 'tool', input: 'z', output: 'w', latencyMs: 20, timestamp: Date.now() });
  const step0 = r.step('s3', 0);
  const step1 = r.step('s3', 1);
  const step2 = r.step('s3', 2);
  assert.ok(step0 !== null);
  assert.equal(step0.type, 'model');
  assert.ok(step1 !== null);
  assert.equal(step1.type, 'tool');
  assert.equal(step2, null);
});

test('branch: creates new session with trace prefix', () => {
  const r = new Replay(tmpDir);
  r.record('s4', { type: 'model', input: 'a', output: 'b', latencyMs: 10, timestamp: Date.now() });
  r.record('s4', { type: 'tool', input: 'c', output: 'd', latencyMs: 20, timestamp: Date.now() });
  r.record('s4', { type: 'model', input: 'e', output: 'f', latencyMs: 30, timestamp: Date.now() });
  const prefix = r.branch('s4', 1, 's4-branch');
  assert.ok(prefix !== null);
  assert.equal(prefix.length, 2);
  const branched = r.getTrace('s4-branch');
  assert.equal(branched.length, 2);
});

test('divergence: finds first different step', () => {
  const r = new Replay(tmpDir);
  r.record('s5', { type: 'model', input: 'a', output: 'b', latencyMs: 10, timestamp: 1000 });
  r.record('s5', { type: 'tool', input: 'c', output: 'd', latencyMs: 20, timestamp: 1001 });
  r.record('s6', { type: 'model', input: 'a', output: 'b', latencyMs: 10, timestamp: 1000 });
  r.record('s6', { type: 'tool', input: 'DIFFERENT', output: 'd', latencyMs: 20, timestamp: 1001 });
  const d = r.divergence('s5', 's6');
  assert.ok(d !== null);
  assert.equal(d.step, 1);
});

test('divergence: identical sessions return null', () => {
  const r = new Replay(tmpDir);
  r.record('s7', { type: 'model', input: 'a', output: 'b', latencyMs: 10, timestamp: 1000 });
  r.record('s8', { type: 'model', input: 'a', output: 'b', latencyMs: 10, timestamp: 1000 });
  const d = r.divergence('s7', 's8');
  assert.equal(d, null);
});

test('divergence: different lengths', () => {
  const r = new Replay(tmpDir);
  r.record('s9', { type: 'model', input: 'a', output: 'b', latencyMs: 10, timestamp: 1000 });
  r.record('s9', { type: 'tool', input: 'c', output: 'd', latencyMs: 20, timestamp: 1001 });
  r.record('s10', { type: 'model', input: 'a', output: 'b', latencyMs: 10, timestamp: 1000 });
  const d = r.divergence('s9', 's10');
  assert.ok(d !== null);
  assert.equal(d.step, 1);
});

// Cleanup
test('cleanup', () => {
  rmSync(tmpDir, { recursive: true, force: true });
  assert.ok(true);
});
