import { parseArgs } from 'node:util';
import { Arena } from './arena.js';

export function run(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      'models': { type: 'string' },
      'reference': { type: 'string' },
      'rating': { type: 'string' },
      'model': { type: 'string' },
      'suite': { type: 'string' },
    },
    allowPositionals: true,
  });

  const projectDir = process.cwd();
  const arena = new Arena(projectDir);
  const cmd = positionals[0] ?? 'list';

  switch (cmd) {
    case 'list': {
      const runs = arena.listRuns();
      if (runs.length === 0) {
        console.log('No arena runs found.');
      } else {
        for (const r of runs) {
          console.log(`${r.id}  ${r.modelCount} models  ${new Date(r.timestamp).toLocaleString()}  ${r.prompt.slice(0, 60)}...`);
        }
      }
      return 0;
    }
    case 'compare': {
      const runId = positionals[1] ?? '';
      const modelA = positionals[2] ?? '';
      const modelB = positionals[3] ?? '';
      const result = arena.compare(runId, modelA, modelB);
      if (!result) {
        console.log('Run or models not found.');
        return 1;
      }
      console.log(`Comparing ${result.modelA} vs ${result.modelB}:`);
      console.log(`Diff: +${result.summary.added} -${result.summary.removed} lines`);
      for (const d of result.diff) {
        const prefix = d.type === 'added' ? '+' : d.type === 'removed' ? '-' : ' ';
        console.log(`${prefix} ${d.text}`);
      }
      return 0;
    }
    case 'rate': {
      const runId = positionals[1] ?? '';
      const model = values.model ?? '';
      const rating = values.rating ? parseInt(values.rating, 10) : 0;
      const result = arena.rate(runId, model, rating);
      if (!result) {
        console.log('Run not found.');
        return 1;
      }
      console.log(`Rated ${model} as ${rating}/5 in run ${runId}`);
      return 0;
    }
    case 'help':
    default:
      console.log('Usage: dsh-model-arena <command> [options]');
      console.log('');
      console.log('Commands:');
      console.log('  list                     List recent runs');
      console.log('  compare <run> <modelA> <modelB>  Compare two models in a run');
      console.log('  rate <run> --model M --rating N  Rate a model output (1-5)');
      return 0;
  }
}
