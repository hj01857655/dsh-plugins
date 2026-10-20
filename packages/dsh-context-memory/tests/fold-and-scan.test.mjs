/**
 * Two kinds of cost this plugin used to pay silently.
 *
 * The first is identity: the subject a memory is keyed by and the check compiled from
 * its text have to agree about where the statement starts, or a memory ends up filed
 * under one claim and verified against another. The second is the fold: the pre-step asks
 * the same question several times in one pass, and every answer used to re-read and
 * re-parse the whole log.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ContextMemory } from '../lib/memory.js';
import { compileGuard, describeGuard, runGuard } from '../lib/guard.js';
import { normaliseSubject } from '../lib/identity.js';

/** A temp project directory, cleaned up by the caller. */
function tempProject() {
  return mkdtempSync(join(tmpdir(), 'context-memory-'));
}

// ---------------------------------------------------------------- fillers and identity

test('compileGuard: discourse fillers in front of a checkable claim do not hide it', () => {
  // Every guard pattern is anchored at the start of the statement, so a claim the user
  // prefixed with "note that" used to get the subject of a checkable claim and no check
  // at all. The `distill` path strips the verb before it reaches here, which is why the
  // gap only showed up on direct writes: the CLI, the tool, and the panel.
  assert.deepEqual(
    compileGuard('note that the file README.md exists'),
    { kind: 'exists', path: 'README.md', source: 'template' },
  );
  assert.deepEqual(
    compileGuard('remember that package.json depends on tsx'),
    { kind: 'depends', name: 'tsx', source: 'template' },
  );
  // Stacked fillers strip in one pass through the shared helper.
  assert.deepEqual(
    compileGuard('please note that the file package.json contains tsx'),
    { kind: 'contains', path: 'package.json', needle: 'tsx', source: 'template' },
  );
});

test('normaliseSubject and compileGuard agree about where a statement starts', () => {
  // The subject is what a memory is keyed by; a check is what makes it verifiable. If
  // they disagreed, a memory could be filed under one claim and verified against another.
  const padded = 'note that the file README.md exists';
  assert.equal(normaliseSubject(padded), normaliseSubject('the file README.md exists'));
  assert.deepEqual(compileGuard(padded), compileGuard('the file README.md exists'));
});

test('normaliseSubject: negation is part of the claim, not filler', () => {
  // "never" and "always" read like chatter but set polarity and scope. Stripping them
  // made "never commit secrets" and "commit secrets" one subject, so the second statement
  // silently overwrote the first — and for a pitfall that is the worst possible collapse.
  assert.notEqual(normaliseSubject('never commit secrets'), normaliseSubject('commit secrets'));
  assert.notEqual(normaliseSubject('always answer in Chinese'), normaliseSubject('answer in Chinese'));
  assert.equal(normaliseSubject('never commit secrets'), 'never commit secrets');
});

test('remembering the positive form does not overwrite the negated one', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const negated = memory.remember({ text: 'never commit secrets' }, 1000);
    const positive = memory.remember({ text: 'commit secrets' }, 2000);
    assert.notEqual(negated.id, positive.id, 'opposite claims must not share an id');
    const texts = memory.all().map((item) => item.text);
    assert.deepEqual(texts.sort(), ['commit secrets', 'never commit secrets']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- fold reuse

test('fold: repeated reads reuse one parse, and still see another instance\'s append', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    memory.remember({ text: 'the build uses pnpm' }, 1000);

    const first = memory.all();
    const second = memory.all();
    assert.equal(second, first, 'an unchanged log is folded once, not once per question');

    // The point of the reuse is that it must not outlive the events: a second instance
    // writing to the same file is exactly what two processes look like from here.
    const other = new ContextMemory(dir);
    other.remember({ text: 'the deploy target is staging' }, 2000);
    assert.equal(memory.all().length, 2, 'an append by another instance is visible at once');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fold: the reuse is invalidated by this process\'s own appends', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    memory.remember({ text: 'the build uses pnpm' }, 1000);
    assert.equal(memory.all().length, 1);
    memory.remember({ text: 'the deploy target is staging' }, 2000);
    assert.equal(memory.all().length, 2);
    memory.forget(memory.all()[0].id, 'superseded by the deploy note', { now: 3000 });
    assert.equal(memory.active().length, 1, 'a supersede reaches the next fold');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- verify results

test('verify: every result carries the check that produced it', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    writeFileSync(join(dir, 'present.txt'), 'ok');
    memory.remember({ text: 'the file present.txt exists' });
    memory.remember({ text: 'the build uses pnpm' });

    const summary = memory.verify(Date.now(), { record: false });
    const checked = summary.results.find((result) => result.outcome === 'passed');
    assert.deepEqual(checked.guard, { kind: 'exists', path: 'present.txt', source: 'template' });
    // An uncheckable memory has no guard to report, and saying so is the honest answer.
    const unchecked = summary.results.find((result) => result.outcome === 'uncheckable');
    assert.equal(unchecked.guard, undefined);
    assert.match(describeGuard(checked.guard), /present\.txt/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- chunked scanning

test('contains: a match straddling the read window is still found', () => {
  const dir = tempProject();
  try {
    // The scan reads in fixed-size windows, so a needle can be split across two of them.
    // Missing that match would report `violated` for a file that plainly contains it.
    const window = 64 * 1024;
    const needle = 'NEEDLE_ACROSS_THE_SEAM';
    writeFileSync(join(dir, 'seam.txt'), 'x'.repeat(window - 5) + needle + '\n');
    const guard = { kind: 'contains', path: 'seam.txt', needle, source: 'template' };
    assert.equal(runGuard('id', guard, dir).outcome, 'passed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('contains: a multi-byte character split across the window is not mangled', () => {
  const dir = tempProject();
  try {
    const window = 64 * 1024;
    // Three-byte characters placed so their bytes span the boundary.
    writeFileSync(join(dir, 'utf8.txt'), 'a'.repeat(window - 1) + '中文边界测试');
    const guard = { kind: 'contains', path: 'utf8.txt', needle: '文边界', source: 'template' };
    assert.equal(runGuard('id', guard, dir).outcome, 'passed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lineLimit: counting a streamed file matches counting its text', () => {
  const dir = tempProject();
  try {
    writeFileSync(join(dir, 'trailing.txt'), 'a\nb\nc\n');
    writeFileSync(join(dir, 'plain.txt'), 'a\nb\nc');
    writeFileSync(join(dir, 'empty.txt'), '');

    // A trailing newline terminates the last line rather than starting another.
    assert.equal(runGuard('id', { kind: 'lineLimit', path: 'trailing.txt', max: 3, source: 'template' }, dir).outcome, 'passed');
    assert.equal(runGuard('id', { kind: 'lineLimit', path: 'plain.txt', max: 3, source: 'template' }, dir).outcome, 'passed');
    assert.equal(runGuard('id', { kind: 'lineLimit', path: 'trailing.txt', min: 4, source: 'template' }, dir).outcome, 'violated');
    assert.equal(runGuard('id', { kind: 'lineLimit', path: 'empty.txt', min: 1, source: 'template' }, dir).outcome, 'violated');
    assert.equal(runGuard('id', { kind: 'lineLimit', path: 'empty.txt', max: 0, source: 'template' }, dir).outcome, 'passed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
