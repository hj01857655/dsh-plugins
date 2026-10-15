import { parseArgs } from 'node:util';
import { PromptVcs } from './vcs.js';

export function run(argv: string[]): number {
  const { positionals } = parseArgs({ args: argv, allowPositionals: true });
  const vcs = new PromptVcs(process.cwd());
  const cmd = positionals[0] ?? 'log';

  switch (cmd) {
    case 'log': {
      const tl = vcs.timeline();
      if (tl.length === 0) { console.log('No changes recorded.'); return 0; }
      for (const e of tl) {
        console.log(`${e.hash}  ${new Date(e.timestamp).toLocaleString()}  ${e.changedBy}  ${e.file}  +${e.addedLines} -${e.removedLines}`);
      }
      return 0;
    }
    case 'diff': {
      const hash = positionals[1] ?? '';
      const diff = vcs.getDiff(hash);
      if (diff === null) { console.log('Change not found.'); return 1; }
      console.log(diff);
      return 0;
    }
    case 'rollback': {
      const hash = positionals[1] ?? '';
      const ok = vcs.rollback(hash);
      if (!ok) { console.log('Change not found.'); return 1; }
      console.log(`Rolled back ${hash}.`);
      return 0;
    }
    case 'help':
    default:
      console.log('Usage: dsh-prompt-vcs <command>');
      console.log('Commands: log, diff <hash>, rollback <hash>');
      return 0;
  }
}
