import { writeFileSync, readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CostEntry, Budget, BudgetConfig } from './types.js';

export class CostStore {
  private readonly ledgerPath: string;
  private readonly budgetPath: string;

  constructor(private readonly projectDir: string) {
    const costDir = join(projectDir, '.cost');
    this.ledgerPath = join(costDir, 'ledger.jsonl');
    this.budgetPath = join(costDir, 'budget.json');
  }

  private ensureDir(): void {
    const dir = join(this.projectDir, '.cost');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  append(entry: CostEntry): void {
    this.ensureDir();
    appendFileSync(this.ledgerPath, JSON.stringify(entry) + '\n', 'utf8');
  }

  readAll(): CostEntry[] {
    if (!existsSync(this.ledgerPath)) return [];
    return readFileSync(this.ledgerPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CostEntry);
  }

  readBudget(): Budget | null {
    if (!existsSync(this.budgetPath)) return null;
    return JSON.parse(readFileSync(this.budgetPath, 'utf8')) as Budget;
  }

  writeBudget(config: BudgetConfig): Budget {
    this.ensureDir();
    const existing = this.readBudget();
    const budget: Budget = {
      monthly: config.monthly ?? existing?.monthly ?? 50,
      enforce: config.enforce ?? existing?.enforce ?? false,
      periodStart: existing?.periodStart ?? Date.now(),
    };
    writeFileSync(this.budgetPath, JSON.stringify(budget, null, 2), 'utf8');
    return budget;
  }
}
