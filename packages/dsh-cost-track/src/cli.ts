import { parseArgs } from 'node:util';
import { Cost } from './cost.js';

export function run(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      'monthly': { type: 'string' },
      'enforce': { type: 'boolean' },
      'model': { type: 'string' },
      'prompt-tokens': { type: 'string' },
      'completion-tokens': { type: 'string' },
      'session': { type: 'string' },
    },
    allowPositionals: true,
  });

  const projectDir = process.cwd();
  const cost = new Cost(projectDir);
  const cmd = positionals[0] ?? 'summary';

  switch (cmd) {
    case 'summary': {
      const s = cost.summary();
      console.log(`Today: $${s.todaySpend.toFixed(4)}`);
      console.log(`This month: $${s.monthSpend.toFixed(4)}`);
      if (s.budget) {
        console.log(`Budget: $${s.budget.spent.toFixed(4)} / $${(s.budget.spent + s.budget.remaining).toFixed(2)}${s.budget.exceeded ? ' (EXCEEDED)' : ''}`);
      }
      if (s.perModel.length > 0) {
        console.log('\nPer model (this month):');
        for (const m of s.perModel) {
          console.log(`  ${m.model}: $${m.spend.toFixed(4)} (${m.calls} calls)`);
        }
      }
      return 0;
    }
    case 'budget': {
      const monthly = values.monthly ? parseFloat(values.monthly) : undefined;
      const enforce = values.enforce ?? undefined;
      const b = cost.setBudget(monthly, enforce);
      console.log(`Budget set: $${b.monthly}/month, enforce=${b.enforce}`);
      return 0;
    }
    case 'record': {
      const model = values.model ?? '';
      const promptTokens = parseInt(values['prompt-tokens'] ?? '0', 10);
      const completionTokens = parseInt(values['completion-tokens'] ?? '0', 10);
      const session = values.session ?? 'cli';
      const entry = cost.record(model, promptTokens, completionTokens, session);
      console.log(`Recorded: $${entry.cost.toFixed(6)} for ${model}`);
      return 0;
    }
    case 'help':
    default:
      console.log('Usage: dsh-cost <command> [options]');
      console.log('');
      console.log('Commands:');
      console.log('  summary              Show spend summary');
      console.log('  budget               Set budget (--monthly N --enforce)');
      console.log('  record               Record a call (--model M --prompt-tokens N --completion-tokens N --session S)');
      return 0;
  }
}
