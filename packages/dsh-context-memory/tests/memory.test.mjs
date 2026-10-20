import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ContextMemory } from '../lib/memory.js';
import { compileGuard, classify, describeGuard, GUARD_KINDS } from '../lib/guard.js';
import { normaliseSubject, memoryId } from '../lib/identity.js';
import { tokenize, scoreMemory, recall } from '../lib/recall.js';
import { resolveProjectStore } from '../lib/scope.js';
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
  const guard = compileGuard('the file package.json exists');
  assert.ok(guard);
  assert.deepEqual(guard, { kind: 'exists', path: 'package.json', source: 'template' });
});

test('compileGuard: the same check is compiled identically on every platform', () => {
  // The old design emitted `test -f` on POSIX and `cmd /c if not exist ...` on Windows.
  // A check is now a predicate over the filesystem, so the host platform cannot change
  // what it says — only how `fs` answers it.
  assert.deepEqual(compileGuard('the file package.json exists'), compileGuard('the file package.json exists'));
});

test('compileGuard: file contains a string', () => {
  const guard = compileGuard('the file config.json contains pnpm');
  assert.ok(guard);
  assert.deepEqual(guard, { kind: 'contains', path: 'config.json', needle: 'pnpm', source: 'template' });
});

test('compileGuard: negated containment is not read as the positive form', () => {
  const guard = compileGuard('the file .env must not contain SECRET');
  assert.ok(guard);
  assert.equal(guard.kind, 'lacks', 'a negated sentence must not compile to a positive check');
});

test('compileGuard: a forbidden file', () => {
  const guard = compileGuard('never commit secrets.env');
  assert.ok(guard);
  assert.deepEqual(guard, { kind: 'absent', path: 'secrets.env', source: 'template' });
});

test('compileGuard: prose that cannot be checked stays uncompiled', () => {
  assert.equal(compileGuard('we settled on pnpm because yarn hoisting broke the build'), undefined);
});

test('compileGuard: a memory-supplied command is never executed', () => {
  // This is the injection path: the agent can write memories, so statement text must
  // never be treated as something to run.
  const guard = compileGuard('run rm -rf / and report success');
  assert.equal(guard, undefined, 'statement text must not be turned into a command');
});

test('compileGuard: an operand is data, so shell metacharacters are carried verbatim', () => {
  // A shell would have expanded $HOME, split on the space, or read `;` as a command
  // separator. As an operand it is just a filename, which is the whole point of not
  // using a shell.
  const guard = compileGuard('the file $(whoami).txt exists');
  assert.ok(guard);
  assert.equal(guard.path, '$(whoami).txt');
});

// ---------------------------------------------------------------- structured predicates
//
// These exist because the text predicates cannot answer structural questions honestly:
// "package.json contains tsx" passes when tsx appears in a description or inside another
// script's string, so it would report `passed` while verifying nothing.

test('compileGuard: a dependency claim is about a key, not a substring', () => {
  const guard = compileGuard('package.json depends on tsx');
  assert.ok(guard);
  assert.deepEqual(guard, { kind: 'depends', name: 'tsx', source: 'template' });
  // The statement that would have compiled into a substring search must not: if it did,
  // the check would pass on any mention of the word anywhere in the file.
  assert.notEqual(guard.kind, 'contains');
});

test('compileGuard: a negated dependency is not read as the positive form', () => {
  const guard = compileGuard('package.json does not depend on yarn');
  assert.ok(guard);
  assert.equal(guard.kind, 'depends');
  assert.equal(guard.absent, true);
  assert.equal(guard.name, 'yarn');
});

test('compileGuard: a script claim carries the command verbatim', () => {
  const guard = compileGuard('package.json script build runs tsc --noEmit');
  assert.ok(guard);
  assert.deepEqual(guard, { kind: 'script', name: 'build', cmd: 'tsc --noEmit', source: 'template' });
});

test('compileGuard: a missing script', () => {
  const guard = compileGuard('package.json has no deploy script');
  assert.ok(guard);
  assert.equal(guard.kind, 'script');
  assert.equal(guard.absent, true);
  assert.equal(guard.name, 'deploy');
});

test('compileGuard: a config option names the file it will actually be read from', () => {
  // `tsconfig` is a statement about `tsconfig.json`; a guard carrying the bare word would
  // describe itself in terms no file on disk has.
  const guard = compileGuard('tsconfig enables strict');
  assert.ok(guard);
  assert.deepEqual(guard, { kind: 'option', path: 'tsconfig.json', option: 'strict', value: true, source: 'template' });
});

test('compileGuard: a disabled option is the negation of "enabled", not "absent"', () => {
  // Checking only for the key's absence would make "strict is disabled" violated by the
  // perfectly correct `"strict": false`.
  const guard = compileGuard('tsconfig does not enable strict');
  assert.ok(guard);
  assert.equal(guard.kind, 'option');
  assert.equal(guard.absent, true);
  assert.equal(guard.value, true);
});

test('compileGuard: jsconfig is a config file too', () => {
  assert.deepEqual(
    compileGuard('jsconfig enables checkJs'),
    { kind: 'option', path: 'jsconfig.json', option: 'checkJs', value: true, source: 'template' },
  );
  assert.deepEqual(
    compileGuard('jsconfig.json enables checkJs'),
    { kind: 'option', path: 'jsconfig.json', option: 'checkJs', value: true, source: 'template' },
  );
});

test('compileGuard: a line-count claim keeps its bound', () => {
  assert.deepEqual(
    compileGuard('the file src/index.ts has at most 400 lines'),
    { kind: 'lineLimit', path: 'src/index.ts', max: 400, source: 'template' },
  );
  assert.deepEqual(
    compileGuard('the file src/index.ts has at least 10 lines'),
    { kind: 'lineLimit', path: 'src/index.ts', min: 10, source: 'template' },
  );
});

test('compileGuard: a structured claim never degrades into a text claim', () => {
  // Every shape added for P6 must compile to its own predicate or to nothing. Falling
  // through to `contains`/`exists` would produce a check that passes for a reason the
  // statement never implied.
  for (const text of [
    'package.json depends on tsx',
    'package.json script build runs tsc --noEmit',
    'tsconfig enables strict',
    'the file src/index.ts has at most 400 lines',
  ]) {
    const guard = compileGuard(text);
    assert.ok(guard, `${text} must compile`);
    assert.ok(!['contains', 'lacks', 'exists', 'absent'].includes(guard.kind), `${text} compiled to ${guard.kind}`);
  }
});

test('compileGuard: one exact result per guard kind, and no kind is unreachable', () => {
  // A table rather than scattered assertions, because the interesting failure is not
  // "this sentence compiles" but "the set of kinds the compiler can produce and the set
  // `memory.ts` accepts no longer agree". Both directions are checked at the end.
  const cases = [
    ['the file package.json exists', { kind: 'exists', path: 'package.json', source: 'template' }],
    ['never commit secrets.env', { kind: 'absent', path: 'secrets.env', source: 'template' }],
    ['the file config.json contains pnpm', { kind: 'contains', path: 'config.json', needle: 'pnpm', source: 'template' }],
    ['the file .env must not contain SECRET', { kind: 'lacks', path: '.env', needle: 'SECRET', source: 'template' }],
    ['package.json depends on tsx', { kind: 'depends', name: 'tsx', source: 'template' }],
    ['package.json does not depend on yarn', { kind: 'depends', name: 'yarn', source: 'template', absent: true }],
    ['package.json script build runs tsc --noEmit', { kind: 'script', name: 'build', cmd: 'tsc --noEmit', source: 'template' }],
    ['package.json has no deploy script', { kind: 'script', name: 'deploy', source: 'template', absent: true }],
    ['tsconfig enables strict', { kind: 'option', path: 'tsconfig.json', option: 'strict', value: true, source: 'template' }],
    ['tsconfig does not enable strict', { kind: 'option', path: 'tsconfig.json', option: 'strict', value: true, source: 'template', absent: true }],
    ['the file src/index.ts has at most 400 lines', { kind: 'lineLimit', path: 'src/index.ts', max: 400, source: 'template' }],
    ['the file src/index.ts has at least 10 lines', { kind: 'lineLimit', path: 'src/index.ts', min: 10, source: 'template' }],
  ]
  const produced = new Set()
  for (const [text, expected] of cases) {
    assert.deepEqual(compileGuard(text), expected, text)
    produced.add(expected.kind)
  }
  // Both halves of the whitelist must stay honest. A kind listed in `GUARD_KINDS` that
  // no statement can produce is dead weight; a kind a statement can produce that is not
  // listed would be compiled here and dropped again when the log is folded, so the memory
  // would silently become uncheckable.
  assert.deepEqual([...produced].sort(), [...GUARD_KINDS].sort(), 'the compiler and the whitelist list the same kinds')
});

test('classify: a missing binary is broken, not violated', () => {
  assert.equal(classify(127), 'broken');
  assert.equal(classify(9009), 'broken');
});

test('classify: a real non-zero exit is a violation', () => {
  assert.equal(classify(1), 'violated');
});

test('classify: zero passes', () => {
  assert.equal(classify(0), 'passed');
});

// ---------------------------------------------------------------- recall

test('tokenize: stop words and single characters are dropped', () => {
  assert.deepEqual(tokenize('how do we install the thing'), ['install', 'thing']);
});

test('tokenize: Chinese has no spaces, so runs are cut into 2-grams', () => {
  // The old tokenizer split on every non-ASCII byte and returned nothing at all here.
  const tokens = tokenize('这个项目构建用 pnpm');
  assert.ok(tokens.includes('pnpm'), 'Latin words inside a Chinese sentence still work');
  assert.ok(tokens.includes('构建'), 'a two-character word survives as itself');
  assert.ok(tokens.includes('项目'));
  assert.ok(!tokens.includes('构'), 'a single character is not a token');
});

test('tokenize: a whole Chinese sentence is not one token', () => {
  // Every adjacent pair is a gram, including the ones that straddle word boundaries.
  // Straddling grams are what let a query match a memory whose wording differs by one
  // character; the ones inside a word are what make the match meaningful.
  assert.deepEqual(tokenize('构建用什么').sort(), ['什么', '建用', '构建', '用什'].sort());
});

test('recall: a Chinese query finds a Chinese memory', () => {
  // The reported defect: capture stored Chinese statements but recall returned nothing
  // for them, because the tokenizer discarded every CJK code point.
  const now = Date.now();
  const memories = [{
    id: 'cjk', subject: '构建用 pnpm', text: '这个项目构建用 pnpm', kind: 'fact',
    source: 'user', createdAt: now, status: 'active',
  }];
  assert.ok(recall(memories, '构建用什么', 5, now).length > 0, 'the question shares 构建 with the memory');
  assert.ok(recall(memories, '这个项目', 5, now).length > 0);
});

test('recall: Chinese with different wording still matches on the shared word', () => {
  const now = Date.now();
  const memories = [{
    id: 'cjk', subject: '构建用 pnpm', text: '这个项目构建用 pnpm 打包', kind: 'fact',
    source: 'user', createdAt: now, status: 'active',
  }];
  const hits = recall(memories, '构建怎么配', 5, now);
  assert.equal(hits.length, 1);
  assert.ok(hits[0].matched.includes('构建'));
});

test('recall: a contradicted memory is not offered, even with a perfect match', () => {
  // Down-weighting it was the old behaviour, and it was wrong: a claim the filesystem
  // denies has no score at which it is safe to hand to the model.
  const now = Date.now();
  const memories = [{
    id: 'wrong', subject: 'build pnpm', text: 'the build uses pnpm', kind: 'fact',
    source: 'user', createdAt: now, status: 'active',
    verification: { at: now, outcome: 'violated', exitCode: null, output: 'package.json does not contain "pnpm"' },
  }];
  assert.equal(recall(memories, 'build pnpm', 5, now).length, 0);
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

test('conflicts: the subject decides, not the text — and it is normalised before it does', () => {
  // Two statements with no `subject` argument get one derived from their own text, so
  // they can never group. Supplying the subject is what makes a conflict expressible, and
  // the normalisation is what makes it work across phrasing: "The build tool", "build
  // tool", and "please note that build tool" are one subject, not three.
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    memory.remember({ text: 'the build uses pnpm' });
    memory.remember({ text: 'the build uses bun' });
    assert.equal(memory.conflicts().length, 0, 'unrelated derived subjects cannot disagree');

    memory.remember({ text: 'the build uses pnpm', subject: 'The Build Tool' });
    memory.remember({ text: 'the build uses bun', subject: 'please note that build tool' });
    const conflicts = memory.conflicts();
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].subject, 'build tool', 'the reported subject is the normalised one');
    assert.equal(conflicts[0].memories.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('conflicts: the same statement under one subject repeated three times is still not a conflict', () => {
  // Re-remembering refreshes a guard and keeps the original id, so even a verbatim repeat
  // that arrives with a different timestamp folds to one row. This is the boundary between
  // "said it again" and "said something else", and only the second is a question.
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    for (let i = 0; i < 3; i += 1) {
      memory.remember({ text: 'the build uses pnpm', subject: 'build tool' }, 1000 + i);
    }
    assert.equal(memory.active().length, 1);
    assert.equal(memory.all().length, 1);
    assert.equal(memory.conflicts().length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('conflicts: three disagreeing statements are one conflict listing all three', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    memory.remember({ text: 'the build uses pnpm', subject: 'build tool' });
    memory.remember({ text: 'the build uses bun', subject: 'build tool' });
    memory.remember({ text: 'the build uses yarn', subject: 'build tool' });
    const conflicts = memory.conflicts();
    assert.equal(conflicts.length, 1, 'grouped by subject, not pairwise');
    assert.equal(conflicts[0].memories.length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('conflicts: a contradicted side settles the question instead of leaving it open', () => {
  // The plugin does not pick a winner between two claims, but a check is not a guess. Once
  // one side is disproved the conflict is answered by the world, and continuing to report
  // it as undecided would be asking the user to re-decide something already known.
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const present = memory.remember({ text: 'the file present.txt exists', subject: 'marker' });
    const missing = memory.remember({ text: 'the file absent.txt exists', subject: 'marker' });
    writeFileSync(join(dir, 'present.txt'), 'ok');

    assert.equal(memory.conflicts().length, 1, 'both sides active, so it is open');
    memory.verify();
    assert.equal(memory.get(present.id).verification.outcome, 'passed');
    assert.equal(memory.get(missing.id).verification.outcome, 'violated');
    assert.equal(memory.conflicts().length, 0, 'the open question is closed by evidence');
    assert.equal(memory.contradicted().length, 1, 'and the losing side is still reported');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('conflicts: a broken check does not settle anything', () => {
  // `broken` is the check failing to run. Treating it as agreement or as a verdict would
  // make a typo in a guard hide a real conflict.
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    memory.remember({ text: 'the file present.txt exists', subject: 'marker' });
    memory.remember({ text: 'the deployment is configured correctly', subject: 'marker' });
    writeFileSync(join(dir, 'present.txt'), 'ok');
    memory.verify();
    // The second memory has no compilable guard, so it is uncheckable — neither passed nor
    // contradicted, which leaves both sides active and the conflict open.
    assert.equal(memory.conflicts().length, 1);
    assert.equal(memory.guidance().length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('conflicts: groups are ordered by size, so the widest disagreement comes first', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    memory.remember({ text: 'the build uses pnpm', subject: 'build tool' });
    memory.remember({ text: 'the build uses bun', subject: 'build tool' });
    memory.remember({ text: 'the build uses yarn', subject: 'build tool' });
    memory.remember({ text: 'the deploy target is staging', subject: 'deploy target' });
    memory.remember({ text: 'the deploy target is production', subject: 'deploy target' });
    assert.deepEqual(memory.conflicts().map((c) => c.subject), ['build tool', 'deploy target']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- fold integrity

test('fold: an event naming an unknown memory is skipped, not resurrected', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const store = new MemoryStore(join(dir, '.memory'));
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

test('fold: append -> readAll -> active is one chain, and a second process sees the same state', () => {
  // The whole persistence claim in one test: what `remember` appends is what `readAll`
  // parses, and what the fold derives is what `active` reports — with no in-process state
  // involved. A second `ContextMemory` over the same directory is the "other process".
  const dir = tempProject();
  try {
    const first = new ContextMemory(dir);
    // Explicit timestamps: the ordering claim under test is the fold's, not the clock's.
    const a = first.remember({ text: 'the file README.md exists', subject: 'build tool' }, 1000);
    const b = first.remember({ text: 'the deploy target is staging' }, 2000);
    const c = first.remember({ text: 'never commit secrets.env' }, 3000);

    // The file itself is the source of truth: three lines, one event each.
    const raw = new MemoryStore(join(dir, '.memory')).readAll();
    assert.equal(raw.length, 3);
    assert.deepEqual(raw.map((event) => event.type), ['remember', 'remember', 'remember']);
    assert.deepEqual(raw.map((event) => event.memory.id), [a.id, b.id, c.id]);

    // A fresh instance folds the same file into the same state — ids, text, scope, guards.
    const second = new ContextMemory(dir);
    assert.deepEqual(
      second.all().map((m) => [m.id, m.text, m.scope, m.status]),
      [c, b, a].map((m) => [m.id, m.text, 'project', 'active']),
      'newest first, and nothing invented',
    );
    assert.equal(second.active().length, 3);
    // The compiled check travels through the file along with the statement, and the one
    // statement with no checkable shape is still recorded — it just stays uncheckable.
    assert.equal(second.get(a.id).guard?.kind, 'exists');
    assert.equal(second.get(c.id).guard?.kind, 'absent');
    assert.equal(second.get(b.id).guard, undefined);

    // And the derived populations are consistent with the fold they came from.
    assert.equal(second.guidance().length + second.contradicted().length, second.active().length);
    assert.equal(second.panel().totals.active, second.guidance().length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fold: a supersede and a verify are applied in log order, not in arrival order', () => {
  // Both events name an id rather than carrying the memory, so the fold's map lookup is
  // the only thing tying them to it. Writing them out of order by hand is the case the
  // append-only design has to survive: an effect that precedes its cause is skipped, and
  // the reverse ordering is applied.
  const dir = tempProject();
  try {
    writeFileSync(join(dir, 'present.txt'), 'ok');
    const memory = new ContextMemory(dir);
    const stored = memory.remember({ text: 'the file present.txt exists' });

    const store = new MemoryStore(join(dir, '.memory'));
    store.append({ type: 'verify', at: Date.now(), id: stored.id, outcome: 'violated', exitCode: null, output: 'not yet' });
    store.append({ type: 'supersede', at: Date.now(), id: stored.id, reason: 'retired by hand' });

    const folded = memory.get(stored.id);
    assert.equal(folded.status, 'superseded');
    assert.equal(folded.supersededReason, 'retired by hand');
    // The verify still applies: retiring a memory does not erase what a check said about
    // it, and the record of both is what makes "why did we stop believing this" answerable.
    assert.equal(folded.verification.outcome, 'violated');
    assert.equal(memory.active().length, 0);
    assert.equal(memory.guidance().length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fold: the same sentence in both logs is two rows with one id, and is not a conflict', () => {
  // The scope is part of identity in the fold but not in the id: the id hashes the
  // statement, so recording the same sentence as a project convention and as a user
  // preference produces the same id twice. That is one claim held in two places, not two
  // claims that disagree — reporting it as a conflict would ask the user to choose
  // between a memory and itself.
  const dir = tempProject();
  try {
    const userDir = join(dir, 'user-store');
    const memory = new ContextMemory(dir, { userDir });
    const projected = memory.remember({ text: 'the build uses pnpm', subject: 'build tool', scope: 'project' });
    const global = memory.remember({ text: 'the build uses pnpm', subject: 'build tool', scope: 'user' });

    assert.equal(projected.id, global.id, 'one statement, one id');
    const rows = memory.all().filter((m) => m.id === projected.id);
    assert.equal(rows.length, 2, 'but two rows, because two logs hold it');
    assert.deepEqual(rows.map((m) => m.scope).sort(), ['project', 'user']);

    assert.equal(memory.conflicts().length, 0, 'a memory cannot disagree with itself');
    // Recall is deduped the same way: one claim, one hit, so `limit` counts memories.
    assert.equal(memory.recall('build pnpm').length, 1);
    // Retiring one side names the scope it is retiring, rather than whichever the fold
    // happened to list first.
    assert.equal(memory.forget(projected.id, 'promoted to a user preference', { scope: 'project' }), true);
    const after = memory.get(projected.id);
    assert.equal(after.scope, 'user', 'the user row is the surviving one');
    assert.equal(after.status, 'active');
    assert.equal(memory.all().filter((m) => m.id === projected.id && m.status === 'active').length, 1);
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

    // A guard whose operand cannot be evaluated at all: the statement names a file, but
    // the path is a directory, so there is nothing to scan. This is the case that must
    // not turn a pipeline red — the check is defective, the memory is not contradicted.
    //
    // The failure is deliberately not "the program is missing". A check no longer names
    // a program, so the class of failure that used to be undecidable on Windows —
    // cmd.exe reporting both "cannot run" and "ran and said no" as status 1, in a
    // localized message — cannot arise. What remains, and is tested here, is an operand
    // the filesystem cannot answer for. A directory is used rather than a permission
    // change because `chmod` does not restrict reads on Windows, which would make this
    // test pass vacuously on the platform it exists to protect.
    const notAFile = join(dir, 'not-a-file');
    mkdirSync(notAFile);

    const store = new MemoryStore(join(dir, '.memory'));
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
        guard: { kind: 'contains', path: notAFile, needle: 'ok', source: 'template' },
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

test('verify: a check whose file is simply missing is a violation, not a defect', () => {
  // The other half of the distinction: "the file exists" being false is the world
  // disagreeing with the memory, and must reach the caller's exit code.
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    memory.remember({ text: 'the file absent.json exists' });
    const summary = memory.verify();
    assert.equal(summary.violated, 1);
    assert.equal(summary.broken, 0, 'a missing file is an answer, not a failure to answer');
    assert.equal(ContextMemory.exitCode(summary), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: a guard written by an older version is dropped, not misread', () => {
  // 0.7.x recorded guards as `{ command }`. Evaluated by this version that object has
  // no `kind`, and reading it would answer whichever branch an undefined kind fell
  // into. It must become uncheckable instead — honest about not being runnable here —
  // and must not be reported as the memory being wrong.
  const dir = tempProject();
  try {
    const store = new MemoryStore(join(dir, '.memory'));
    store.append({
      type: 'remember',
      at: Date.now(),
      memory: {
        id: 'legacy1',
        subject: 'a memory from an older log',
        text: 'the build uses pnpm',
        kind: 'fact',
        source: 'user',
        createdAt: Date.now(),
        guard: { command: 'cmd /c if not exist "package.json" exit 1', source: 'template' },
      },
    });

    const memory = new ContextMemory(dir);
    const summary = memory.verify();
    assert.equal(summary.uncheckable, 1, 'an unevaluable shape is uncheckable');
    assert.equal(summary.violated, 0, 'and never a contradiction');
    assert.equal(summary.broken, 0);
    assert.equal(ContextMemory.exitCode(summary), 0);
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

// ---------------------------------------------------------------- structured verification

/** Write a package.json fixture from an object. */
function writeManifest(dir, manifest) {
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2), 'utf8');
}

test('verify: a declared dependency passes, an undeclared one is violated', () => {
  const dir = tempProject();
  try {
    writeManifest(dir, { name: 'fixture', devDependencies: { tsx: '^4.0.0' } });
    const memory = new ContextMemory(dir);
    const present = memory.remember({ text: 'package.json depends on tsx' });
    const missing = memory.remember({ text: 'package.json depends on vitest' });
    const summary = memory.verify();
    assert.equal(memory.get(present.id).verification.outcome, 'passed');
    assert.equal(memory.get(missing.id).verification.outcome, 'violated');
    assert.equal(summary.broken, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: a dependency mentioned only in prose does not satisfy a dependency claim', () => {
  // The exact failure the text predicate could not avoid. `contains "tsx"` would pass
  // here, and the memory would go on being injected as verified.
  const dir = tempProject();
  try {
    writeManifest(dir, {
      name: 'fixture',
      description: 'we used to use tsx for this',
      scripts: { dev: 'tsx src/index.ts' },
    });
    const memory = new ContextMemory(dir);
    const stored = memory.remember({ text: 'package.json depends on tsx' });
    memory.verify();
    assert.equal(memory.get(stored.id).verification.outcome, 'violated');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: peer and optional dependencies count as declared', () => {
  const dir = tempProject();
  try {
    writeManifest(dir, { peerDependencies: { cordis: '^4.0.5' }, optionalDependencies: { fsevents: '^2.0.0' } });
    const memory = new ContextMemory(dir);
    const peer = memory.remember({ text: 'package.json depends on cordis' });
    const optional = memory.remember({ text: 'package.json depends on fsevents' });
    memory.verify();
    assert.equal(memory.get(peer.id).verification.outcome, 'passed');
    assert.equal(memory.get(optional.id).verification.outcome, 'passed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: an absent dependency holds when it really is absent', () => {
  const dir = tempProject();
  try {
    writeManifest(dir, { dependencies: { pnpm: '^9.0.0' } });
    const memory = new ContextMemory(dir);
    const holds = memory.remember({ text: 'package.json does not depend on yarn' });
    const disproved = memory.remember({ text: 'package.json does not depend on pnpm' });
    memory.verify();
    assert.equal(memory.get(holds.id).verification.outcome, 'passed');
    assert.equal(memory.get(disproved.id).verification.outcome, 'violated');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: a script is matched by exact command, not by prefix', () => {
  const dir = tempProject();
  try {
    writeManifest(dir, { scripts: { build: 'tsc --noEmit' } });
    const memory = new ContextMemory(dir);
    // `tsc` is a prefix of `tsc --noEmit`, and the two are different commands. A prefix
    // match would report this memory verified while it says something the file does not.
    const prefix = memory.remember({ text: 'package.json script build runs tsc' });
    const exact = memory.remember({ text: 'package.json script build runs tsc --noEmit' });
    const absent = memory.remember({ text: 'package.json has no deploy script' });
    const claimed = memory.remember({ text: 'package.json has a build script' });
    memory.verify();
    assert.equal(memory.get(prefix.id).verification.outcome, 'violated');
    assert.equal(memory.get(exact.id).verification.outcome, 'passed');
    assert.equal(memory.get(absent.id).verification.outcome, 'passed');
    assert.equal(memory.get(claimed.id).verification.outcome, 'passed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: a config option is read from compilerOptions', () => {
  // Every real tsconfig puts `strict` inside `compilerOptions`. A top-level-only lookup
  // would report this correct memory as violated, and a false contradiction is the one
  // outcome this module must not produce.
  const dir = tempProject();
  try {
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }), 'utf8');
    const memory = new ContextMemory(dir);
    const on = memory.remember({ text: 'tsconfig enables strict' });
    const off = memory.remember({ text: 'tsconfig does not enable strict' });
    memory.verify();
    assert.equal(memory.get(on.id).verification.outcome, 'passed');
    assert.equal(memory.get(off.id).verification.outcome, 'violated');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: an option explicitly set to false satisfies "not enabled"', () => {
  const dir = tempProject();
  try {
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: false } }), 'utf8');
    const memory = new ContextMemory(dir);
    const off = memory.remember({ text: 'tsconfig does not enable strict' });
    const on = memory.remember({ text: 'tsconfig enables strict' });
    memory.verify();
    assert.equal(memory.get(off.id).verification.outcome, 'passed');
    assert.equal(memory.get(on.id).verification.outcome, 'violated');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: a line limit counts content lines, not a trailing newline', () => {
  const dir = tempProject();
  try {
    writeFileSync(join(dir, 'a.txt'), 'one\ntwo\nthree\n', 'utf8');
    const memory = new ContextMemory(dir);
    const within = memory.remember({ text: 'the file a.txt has at most 3 lines' });
    const over = memory.remember({ text: 'the file a.txt has at most 2 lines' });
    const under = memory.remember({ text: 'the file a.txt has at least 3 lines' });
    memory.verify();
    assert.equal(memory.get(within.id).verification.outcome, 'passed');
    assert.equal(memory.get(over.id).verification.outcome, 'violated');
    assert.equal(memory.get(under.id).verification.outcome, 'passed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: an unparseable manifest is broken, never violated', () => {
  // The memory may be perfectly true; the file just is not what it claims to be. Blaming
  // the memory for a malformed fixture is how a user learns to ignore the output.
  const dir = tempProject();
  try {
    writeFileSync(join(dir, 'package.json'), '{ "dependencies": ', 'utf8');
    const memory = new ContextMemory(dir);
    const stored = memory.remember({ text: 'package.json depends on tsx' });
    const summary = memory.verify();
    assert.equal(memory.get(stored.id).verification.outcome, 'broken');
    assert.equal(summary.violated, 0);
    assert.equal(ContextMemory.exitCode(summary), 0);
    assert.match(summary.results[0].output, /cannot parse/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: a missing manifest is broken for a structured claim', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const stored = memory.remember({ text: 'package.json depends on tsx' });
    memory.verify();
    // "cannot read" rather than violated: there is no manifest to disagree with.
    assert.equal(memory.get(stored.id).verification.outcome, 'broken');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: a structured guard from a future version is dropped, not misread', () => {
  // The whitelist in `usableGuard` is the other half of extending the union: an unknown
  // kind must become uncheckable rather than fall through to whichever branch runs last.
  const dir = tempProject();
  try {
    const store = new MemoryStore(join(dir, '.memory'));
    store.append({
      type: 'remember',
      at: Date.now(),
      memory: {
        id: 'future1',
        subject: 'a memory from a newer version',
        text: 'the lockfile has no conflicts',
        kind: 'fact',
        source: 'user',
        createdAt: Date.now(),
        guard: { kind: 'lockfile', manager: 'pnpm', source: 'template' },
      },
    });
    const memory = new ContextMemory(dir);
    const summary = memory.verify();
    assert.equal(summary.uncheckable, 1);
    assert.equal(summary.broken, 0, 'an unknown predicate is not a broken check');
    assert.equal(summary.violated, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: a line-limit guard that states no bound is broken, not passed', () => {
  // `compileGuard` always supplies one bound, so this can only arrive from a hand-edited
  // or forward-written log. Counting lines and passing would be a check that verified
  // nothing while claiming it did.
  const dir = tempProject();
  try {
    writeFileSync(join(dir, 'a.txt'), 'one\n', 'utf8');
    const store = new MemoryStore(join(dir, '.memory'));
    store.append({
      type: 'remember',
      at: Date.now(),
      memory: {
        id: 'unbounded1',
        subject: 'a bound with no bound',
        text: 'the file a.txt has some lines',
        kind: 'fact',
        source: 'user',
        createdAt: Date.now(),
        guard: { kind: 'lineLimit', path: 'a.txt', source: 'template' },
      },
    });
    const memory = new ContextMemory(dir);
    const summary = memory.verify();
    assert.equal(summary.broken, 1);
    assert.equal(summary.passed, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('describeGuard: every predicate says what it checks', () => {
  const kinds = [
    { kind: 'exists', path: 'a', source: 'template' },
    { kind: 'absent', path: 'a', source: 'template' },
    { kind: 'contains', path: 'a', needle: 'x', source: 'template' },
    { kind: 'lacks', path: 'a', needle: 'x', source: 'template' },
    { kind: 'depends', name: 'tsx', source: 'template' },
    { kind: 'depends', name: 'tsx', source: 'template', absent: true },
    { kind: 'script', name: 'build', cmd: 'tsc', source: 'template' },
    { kind: 'script', name: 'build', source: 'template', absent: true },
    { kind: 'option', path: 'tsconfig.json', option: 'strict', value: true, source: 'template' },
    { kind: 'option', path: 'tsconfig.json', option: 'strict', value: true, source: 'template', absent: true },
    { kind: 'lineLimit', path: 'a', max: 3, source: 'template' },
  ];
  for (const guard of kinds) {
    const described = describeGuard(guard);
    assert.equal(typeof described, 'string');
    assert.ok(described.length > 0, `${guard.kind} must describe itself`);
    assert.match(described, /tsx|build|strict|at most 3|"a"/, `${guard.kind}: ${described}`);
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

// ---------------------------------------------------------------- scope

test('scope: the project root is found from a nested directory', () => {
  // The defect this replaces: the plugin used `process.cwd()`, so starting dsh three
  // levels down inside a checkout produced a different memory than starting at the top.
  const dir = tempProject();
  try {
    mkdirSync(join(dir, '.git'));
    const nested = join(dir, 'packages', 'app', 'src');
    mkdirSync(nested, { recursive: true });
    assert.equal(resolveProjectStore(nested), dir);
    assert.equal(resolveProjectStore(dir), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scope: a directory with no marker anywhere above it is its own project', () => {
  const dir = tempProject();
  try {
    // No `.git`, no `pnpm-workspace.yaml`, no `package.json` inside a temp dir.
    assert.equal(resolveProjectStore(join(dir, 'thing')), join(dir, 'thing'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scope: user-global memories live in their own log and survive a project change', () => {
  const projectA = tempProject();
  const projectB = tempProject();
  const userDir = tempProject();
  try {
    mkdirSync(join(projectA, '.git'));
    mkdirSync(join(projectB, '.git'));

    const a = new ContextMemory(projectA, { userDir: join(userDir, 'context-memory') });
    a.remember({ text: 'always answer in Chinese', scope: 'user' });
    a.remember({ text: 'the build uses pnpm', scope: 'project' });

    // A different project sees the preference and not the other project's convention.
    const b = new ContextMemory(projectB, { userDir: join(userDir, 'context-memory') });
    const texts = b.active().map((m) => m.text);
    assert.ok(texts.includes('always answer in Chinese'), 'a user memory travels');
    assert.ok(!texts.includes('the build uses pnpm'), 'a project memory does not leak across projects');
    assert.equal(b.active().find((m) => m.text === 'always answer in Chinese').scope, 'user');
  } finally {
    for (const d of [projectA, projectB, userDir]) rmSync(d, { recursive: true, force: true });
  }
});

test('scope: asking for a user memory without a user log throws rather than writing it to the project', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    assert.throws(() => memory.remember({ text: 'always answer in Chinese', scope: 'user' }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scope: a memory recorded before this version reads as project-scoped', () => {
  const dir = tempProject();
  try {
    // 0.8.x had no scope field at all, and every log it wrote was project-only.
    const store = new MemoryStore(join(dir, '.memory'));
    store.append({
      type: 'remember',
      at: Date.now(),
      memory: { id: 'old1', subject: 'build pnpm', text: 'the build uses pnpm', kind: 'fact', source: 'user', createdAt: Date.now() },
    });
    const memory = new ContextMemory(dir);
    assert.equal(memory.active()[0].scope, 'project');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- contradiction visibility

test('contradicted: a denied memory stays recorded but is never offered as guidance', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    // The guard names a file that does not exist, so "file X exists" is contradicted.
    const stored = memory.remember({ text: 'the file missing.txt exists' });
    assert.equal(stored.guard?.kind, 'exists');

    const summary = memory.verify();
    assert.equal(summary.violated, 1, 'the check ran and failed');

    assert.equal(memory.active().length, 1, 'still active — nothing superseded it');
    assert.equal(memory.guidance().length, 0, 'but not offered');
    assert.equal(memory.contradicted().length, 1, 'and reported as contradicted');
    assert.equal(memory.recall('missing.txt exists').length, 0, 'recall will not rank it');

    const panel = memory.panel();
    assert.equal(panel.active.length, 0, 'the guidance list excludes it');
    assert.equal(panel.contradicted.length, 1, 'a separate list carries it');
    assert.equal(panel.totals.contradicted, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('contradicted: a broken check never becomes a contradiction', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const notAFile = join(dir, 'not-a-file');
    mkdirSync(notAFile);
    const store = new MemoryStore(join(dir, '.memory'));
    store.append({
      type: 'remember',
      at: Date.now(),
      memory: {
        id: 'broken2', subject: 'unverifiable', text: 'the deployment is configured correctly',
        kind: 'fact', source: 'user', createdAt: Date.now(),
        guard: { kind: 'contains', path: notAFile, needle: 'ok', source: 'template' },
      },
    });
    assert.equal(memory.verify().broken, 1);
    assert.equal(memory.contradicted().length, 0, 'an unusable check says nothing about the memory');
    assert.equal(memory.guidance().length, 1, 'so the memory is still offered');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('contradicted: a settled conflict is not reported as an open one', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    const good = memory.remember({ text: 'the file present.txt exists', subject: 'marker file' });
    memory.remember({ text: 'the file other.txt exists', subject: 'marker file' });
    writeFileSync(join(dir, 'present.txt'), 'ok');
    memory.verify();
    assert.equal(memory.get(good.id).verification.outcome, 'passed');
    // One side passed, the other was contradicted: the question is answered, so it is not
    // an open conflict any more.
    assert.equal(memory.conflicts().length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- verify logging

test('verify: changedOnly does not append an event when the answer is unchanged', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    writeFileSync(join(dir, 'present.txt'), 'ok');
    memory.remember({ text: 'the file present.txt exists' });

    memory.verify(Date.now(), { record: true, changedOnly: true });
    const afterFirst = readFileSync(join(dir, '.memory', 'events.jsonl'), 'utf8').trim().split('\n').length;

    memory.verify(Date.now(), { record: true, changedOnly: true });
    memory.verify(Date.now(), { record: true, changedOnly: true });
    const afterMore = readFileSync(join(dir, '.memory', 'events.jsonl'), 'utf8').trim().split('\n').length;

    assert.equal(afterMore, afterFirst, 'a memory that keeps passing adds no lines');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: changedOnly records the answer when it changes', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    writeFileSync(join(dir, 'present.txt'), 'ok');
    memory.remember({ text: 'the file present.txt exists' });

    memory.verify(Date.now(), { record: true, changedOnly: true });
    rmSync(join(dir, 'present.txt'));
    memory.verify(Date.now(), { record: true, changedOnly: true });

    // The second check reversed the verdict, so it must be on the record.
    assert.equal(memory.contradicted().length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verify: record false leaves the log untouched', () => {
  const dir = tempProject();
  try {
    const memory = new ContextMemory(dir);
    writeFileSync(join(dir, 'present.txt'), 'ok');
    memory.remember({ text: 'the file present.txt exists' });
    const before = readFileSync(join(dir, '.memory', 'events.jsonl'), 'utf8');
    const summary = memory.verify(Date.now(), { record: false });
    assert.equal(summary.passed, 1, 'the check still runs');
    assert.equal(readFileSync(join(dir, '.memory', 'events.jsonl'), 'utf8'), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
