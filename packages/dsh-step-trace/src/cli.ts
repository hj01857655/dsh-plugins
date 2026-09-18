import { parseArgs } from 'node:util';
import { Replay } from './replay.js';

export function run(argv: string[]): number {
  const { positionals } = parseArgs({ args: argv, allowPositionals: true });
  const replay = new Replay(process.cwd());
  const cmd = positionals[0] ?? 'list';

  switch (cmd) {
    case 'list': {
      const { sessions } = replay.listSessions();
      if (sessions.length === 0) { console.log('No recorded sessions.'); return 0; }
      for (const s of sessions) {
        console.log(`${s.sessionId}  ${s.stepCount} steps  ${new Date(s.timestamp).toLocaleString()}`);
      }
      return 0;
    }
    case 'trace': {
      const id = positionals[1] ?? '';
      const steps = replay.getTrace(id);
      if (steps.length === 0) { console.log('Session not found.'); return 1; }
      for (const s of steps) {
        console.log(`[${s.step}] ${s.type}  ${s.latencyMs}ms  ${JSON.stringify(s.input).slice(0, 60)}...`);
      }
      return 0;
    }
    case 'step': {
      const id = positionals[1] ?? '';
      const idx = parseInt(positionals[2] ?? '0', 10);
      const step = replay.step(id, idx);
      if (!step) { console.log('Step not found.'); return 1; }
      console.log(`Step ${step.step} (${step.type}):`);
      console.log(`  Input:  ${JSON.stringify(step.input)}`);
      console.log(`  Output: ${JSON.stringify(step.output)}`);
      console.log(`  Latency: ${step.latencyMs}ms`);
      return 0;
    }
    case 'diverge': {
      const a = positionals[1] ?? '';
      const b = positionals[2] ?? '';
      const d = replay.divergence(a, b);
      if (!d) { console.log('Sessions are identical.'); return 0; }
      console.log(`Divergence at ${d.description}`);
      return 0;
    }
    case 'help':
    default:
      console.log('Usage: dsh-replay <command>');
      console.log('Commands: list, trace <id>, step <id> <n>, diverge <a> <b>');
      return 0;
  }
}
