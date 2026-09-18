import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ContextMemory } from '../lib/memory.js';
import { compileGuard, classify, shellQuote } from '../lib/guard.js';
import { normaliseSubject, memoryId } from '../lib/identity.js';
import { tokenize, scoreMemory, recall } from '../lib/recall.js';
import { MemoryStore } from '../lib/store.js';

/** A temp project directory, cleaned up by the caller. */
function tempProject() {
  return mkdtempSync(join(tmpdir(), 'context-memory-'));
}

// ---------------------------------------------------------------- identity

test('normaliseSubject: articles and filler do not change the subject', () => {
  assert.equal(normaliseSubject('The build uses pnpm'), normaliseSubject('build uses pnpm'));
  assert.equal(normaliseSubject('please note that the build uses pnpm'), 'build uses pnpm');
});

test('memoryId: same subject and text folds to one id', () => {
  assert.equal(memoryId('build uses pnpm', 'The build uses pnpm.'), memoryId('build uses pnpm', 'build uses pnpm'));
});

test('memoryId: a different statement about one subject gets a different id', () => {
  // This is what makes conflict detection possible: two disagreeing statements about
  // one subject must not collapse into each other.
  assert.notEqual(memoryId('build tool', 'the build uses pnpm'), memoryId('build tool', 'the build uses bun'));
});

test('memoryId: different subjects get different ids', () => {
  assert.notEqual(memoryId('build uses pnpm', 'x'), memoryId('build uses bun', 'x'));
});

// ---------------------------------------------------------------- guard compilation

test('compileGuard: file existence, POSIX', () => {
  const guard = compileGuard('the file package.json exists', 'linux');
  assert.ok(guard);
  assert.equal(guard.command, "test -f 'package.json'");
});

test('compileGuard: file existence, Windows uses cmd not test', () => {
  const guard = compileGuard('the file package.json exists', 'win32');
  assert.ok(guard);
  assert.equal(guard.command, 'cmd /c if not exist "package.json" exit 1');
  assert.ok(!guard.command.includes('test -f'), 'a POSIX command on Windows would never run');
});

test('compileGuard: file contains a string', () => {
  const guard = compileGuard('the file config.json contains pnpm', 'linux');
  assert.ok(guard);
  assert.equal(guard.command, "grep -qF 'pnpm' 'config.json'");
});

test('compileGuard: negated containment is not read as the positive form', () => {
  const guard = compileGuard('the file .env must not contain SECRET', 'linux');
  assert.ok(guard);
  assert.ok(guard.command.startsWith('! '), `expected a negated check, got ${guard.command}`);
});

test('compileGuard: negative containment on Windows uses findstr', () => {
  const guard = compileGuard('the file .env must not contain SECRET', 'win32');
  assert.ok(guard);
  assert.ok(guard.command.startsWith('findstr'), guard.command);
});

test('compileGuard: a forbidden file', () => {
  const guard = compileGuard('never commit secrets.env', 'linux');
  assert.ok(guard);
  assert.equal(guard.command, "! test -e 'secrets.env'");
});

test('compileGuard: prose that cannot be checked stays uncompiled', () => {
  assert.equal(compileGuard('we settled on pnpm because yarn hoisting broke the build'), undefined);
});

test('compileGuard: a quote in a Windows operand is refused rather than misquoted', () => {
  assert.equal(compileGuard('the file a.txt contains "quoted"', 'win32'), undefined);
});

test('compileGuard: a memory-supplied command is never executed', () => {
  // This is the injection path: the agent can write memories, so statement text must
  // never be treated as something to run.
  const guard = compileGuard('run rm -rf / and report success', 'linux');
  assert.equal(guard, undefined, 'statement text must not be turned into a command');
});

test('shellQuote: a single quote is escaped, not lost', () => {
  assert.equal(shellQuote("it's"), `'it'\\''s'`);
});

test('classify: a missing binary is broken, not violated', () => {
  assert.equal(classify(127), 'broken');
  assert.equal(classify(9009), 'broken');
  assert.equal(classify(1, 'bash: foo: command not found'), 'broken');
});

test('classify: a real non-zero exit is a violation', () => {
  assert.equal(classify(1, ''), 'violated');
});

test('classify: zero passes', () => {
  assert.equal(classify(0), 'passed');
});

// ---------------------------------------------------------------- recall

test('tokenize: stop words and single characters are dropped', () => {
  assert.deepEqual(tokenize('how do we install the thing'), ['install', 'thing']);
});

test('scoreMemory: overlap with the query drives the score', () => {
  const memory = {
    id: 'x', subject: 'build uses pnpm', text: 'the build uses pnpm', kind: 'fact',
    source: 'user', createdAt: Date.now(), status: 'active',
  };
  const hit = scoreMemory(memory, tokenize('build pnpm'), Date.now());
  assert.equal(hit.matched.length, 2);
  assert.ok(hit.score > 0.5);
  assert.ok(hit.why.includes('overlap 2/2'));
});

test('scoreMemory: a verified memory outranks an identical unverified one', () => {
  const base = {
    id: 'x', subject: 'build uses pnpm', text: 'the build uses pnpm', kind: 'fact',
    source: 'user', createdAt: Date.now(), status: 'active',
  };
  const tokens = tokenize('build pnpm');
  const plain = scoreMemory(base, tokens, Date.now());
  const checked = scoreMemory({ ...base, verification: { at: Date.now(), outcome: 'passed', exitCode: 0, output: '' } }, tokens, Date.now());
  assert.ok(checked.score > plain.score, 'verification strength must count for something');
});

test('recall: a superseded memory is excluded entirely', () => {
  const now = Date.now();
  const memories = [
    { id: 'live', subject: 'build pnpm', text: 'the build uses pnpm', kind: 'fact', source: 'user', createdAt: now, status: 'active' },
    { id: 'dead', subject: 'build pnpm', text: 'the build uses pnpm', kind: 'fact', source: 'user', createdAt: now, status: 'superseded', supersededReason: 'moved to bun' },
  ];
  const hits = recall(memories, 'build pnpm', 5, now);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].memory.id, 'live');
});

test('recall: a query matching nothing returns nothing', () => {
  const memories = [
    { id: 'x', subject: 'build pnpm', text: 'the build uses pnpm', kind: 'fact', source: 'user', createdAt: Date.now(), status: 'active' },
  ];
  assert.equal(recall(memories, 'kubernetes ingress', 5).length, 0);
});

// ---------------------------------------------------------------- remember / fold

test('remember: appends to an append-only log', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const stored = memory.remember({ text: 'the file package.json exists' });
    assert.ok(stored.id);
    assert.ok(stored.guard, 'a checkable statement gets a guard');

    const lines = readFileSync(memory.logPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).type, 'remember');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('remember: an empty statement is rejected', () => {
  const dir = tempProject();
  try {
    assert.throws(() => new ContextMemory(dir).remember({ text: '   ' }), /empty statement/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('remember: re-stating keeps the original creation time', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const first = memory.remember({ text: 'the build uses pnpm' }, 1000);
    const again = memory.remember({ text: 'the build uses pnpm' }, 5000);
    assert.equal(again.id, first.id);
    assert.equal(again.createdAt, 1000, 'a repeat is not the memory being new');
    assert.equal(memory.active().length, 1, 'a repeat is one memory');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('remember: provenance is preserved', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    memory.remember({ text: 'we settled on pnpm', kind: 'decision', source: 'agent', sessionId: 's1', step: 4 });
    const [stored] = memory.active();
    assert.equal(stored.source, 'agent');
    assert.equal(stored.kind, 'decision');
    assert.equal(stored.sessionId, 's1');
    assert.equal(stored.step, 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- supersede

test('forget: supersedes and keeps the reason', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const stored = memory.remember({ text: 'the build uses pnpm' });
    assert.equal(memory.forget(stored.id, 'moved to bun'), true);

    const [state] = memory.all();
    assert.equal(state.status, 'superseded');
    assert.equal(state.supersededReason, 'moved to bun');
    assert.equal(memory.active().length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('forget: a reason is required', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const stored = memory.remember({ text: 'the build uses pnpm' });
    assert.throws(() => memory.forget(stored.id, '   '), /reason/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('forget: superseding an unknown id reports false rather than inventing a record', () => {
  const dir = tempProject();
  try {
    assert.equal(new ContextMemory(dir).forget('nope', 'because'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('forget: the memory itself is never deleted', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const stored = memory.remember({ text: 'the build uses pnpm' });
    memory.forget(stored.id, 'moved to bun');
    const state = memory.get(stored.id);
    assert.ok(state, 'a superseded memory is the record of why it stopped being true');
    assert.equal(state.text, 'the build uses pnpm');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- conflicts

test('conflicts: two disagreeing statements about one subject are reported together', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    memory.remember({ text: 'the build uses pnpm', subject: 'build tool' });
    memory.remember({ text: 'the build uses bun', subject: 'build tool' });

    const conflicts = memory.conflicts();
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].subject, 'build tool');
    assert.equal(conflicts[0].memories.length, 2, 'both sides are kept so the user can decide');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('conflicts: the same statement repeated is one memory, not a conflict', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    memory.remember({ text: 'the build uses pnpm', subject: 'build tool' });
    memory.remember({ text: 'the build uses pnpm', subject: 'build tool' });
    assert.equal(memory.active().length, 1);
    assert.equal(memory.conflicts().length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('conflicts: a superseded side does not keep the conflict open', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const pnpm = memory.remember({ text: 'the build uses pnpm', subject: 'build tool' });
    memory.remember({ text: 'the build uses bun', subject: 'build tool' });
    assert.equal(memory.conflicts().length, 1);

    memory.forget(pnpm.id, 'moved to bun');
    assert.equal(memory.conflicts().length, 0, 'only active memories can conflict');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('conflicts: no conflict when nothing disagrees', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    memory.remember({ text: 'the build uses pnpm' });
    memory.remember({ text: 'the deploy target is staging' });
    assert.equal(memory.conflicts().length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- fold integrity

test('fold: an event naming an unknown memory is skipped, not resurrected', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const store = new MemoryStore(dir);
    store.append({ type: 'supersede', at: 1, id: 'ghost', reason: 'x' });
    assert.equal(memory.all().length, 0, 'a log that lost its remember line must not resurrect from its effects');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fold: a torn trailing line is dropped, the rest of the log is kept', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    memory.remember({ text: 'the build uses pnpm' });
    writeFileSync(memory.logPath, `${readFileSync(memory.logPath, 'utf8')}{"type":"remem`, 'utf8');
    assert.equal(memory.all().length, 1, 'a crash mid-write must not cost the whole history');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fold: damage that is not the final line is reported, not skipped', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    memory.remember({ text: 'the build uses pnpm' });
    memory.remember({ text: 'the deploy target is staging' });
    const lines = readFileSync(memory.logPath, 'utf8').trim().split('\n');
    lines[0] = '{not json';
    writeFileSync(memory.logPath, `${lines.join('\n')}\n`, 'utf8');
    assert.throws(() => memory.all(), /not valid JSON/, 'silently ignoring a damaged record is how a log stops being evidence');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- verification

test('verify: a true checkable memory passes and is recorded', () => {
  const dir = tempProject();
  try {
    writeFileSync(join(dir, 'package.json'), '{}', 'utf8');
    const memory = new ContextMemory(dir);
    const stored = memory.remember({ text: 'the file package.json exists' });
    const summary = memory.verify();
    assert.equal(summary.passed, 1);
    assert.equal(summary.violated, 0);
    assert.equal(memory.get(stored.id).verification.outcome, 'passed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: a false checkable memory is violated', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    memory.remember({ text: 'the file package.json exists' });
    const summary = memory.verify();
    assert.equal(summary.violated, 1);
    assert.equal(ContextMemory.exitCode(summary), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: an uncheckable memory is counted, not failed', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    memory.remember({ text: 'we settled on pnpm because yarn hoisting broke the build' });
    const summary = memory.verify();
    assert.equal(summary.uncheckable, 1);
    assert.equal(summary.violated, 0);
    assert.equal(ContextMemory.exitCode(summary), 0);
    assert.equal(summary.results[0].outcome, 'uncheckable');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: a broken guard does not fail the command', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const stored = memory.remember({ text: 'the build uses pnpm' });
    // Retire the real memory first, so the only thing under test is the broken guard.
    memory.forget(stored.id, 'replaced by the broken-guard fixture below');

    // Force a guard that cannot run at all. This is the case that must not turn a
    // pipeline red: the check is defective, the memory is not contradicted.
    const store = new MemoryStore(dir);
    store.append({
      type: 'remember',
      at: Date.now(),
      memory: {
        id: 'broken1',
        subject: 'a memory whose check cannot run',
        text: 'the deployment is configured correctly',
        kind: 'fact',
        source: 'user',
        createdAt: Date.now(),
        guard: { command: 'definitely-not-a-real-binary-xyz --check', source: 'template' },
      },
    });

    const summary = memory.verify();
    assert.equal(summary.broken, 1, 'a guard that cannot run is reported as broken');
    assert.equal(summary.violated, 0, 'and never as a violation');
    assert.equal(ContextMemory.exitCode(summary), 0, 'so it cannot fail a build');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: an unverified memory is not counted as verified', () => {
  const dir = tempProject();
  try {
    writeFileSync(join(dir, 'package.json'), '{}', 'utf8');
    const memory = new ContextMemory(dir);
    memory.remember({ text: 'the file package.json exists' });
    assert.equal(memory.panel().totals.verified, 0, 'storing a memory never makes it verified');
    memory.verify();
    assert.equal(memory.panel().totals.verified, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: superseded memories are not re-checked', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const stored = memory.remember({ text: 'the file package.json exists' });
    memory.forget(stored.id, 'not relevant to this repo');
    assert.equal(memory.verify().results.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- panel

test('panel: totals separate verification from mere storage', () => {
  const dir = tempProject();
  try {
    writeFileSync(join(dir, 'package.json'), '{}', 'utf8');
    const memory = new ContextMemory(dir);
    memory.remember({ text: 'the file package.json exists' });
    memory.remember({ text: 'we settled on pnpm' });
    const panel = memory.panel();
    assert.equal(panel.totals.active, 2);
    assert.equal(panel.totals.withGuard, 1);
    assert.equal(panel.totals.verified, 0);
    assert.equal(panel.totals.unverified, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('panel: superseded memories are listed separately', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const stored = memory.remember({ text: 'the build uses pnpm' });
    memory.forget(stored.id, 'moved to bun');
    const panel = memory.panel();
    assert.equal(panel.active.length, 0);
    assert.equal(panel.superseded.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('store: an append-only log survives a re-read', () => {
  const dir = tempProject();
  try {
    const first = new ContextMemory(dir);
    first.remember({ text: 'the build uses pnpm' });
    // A second instance over the same directory is the cross-session case.
    const second = new ContextMemory(dir);
    assert.equal(second.active().length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('store: a missing project directory is created on first write', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(join(dir, 'nested'));
    memory.remember({ text: 'the build uses pnpm' });
    assert.equal(memory.active().length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
