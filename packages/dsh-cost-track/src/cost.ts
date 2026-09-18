import { CostStore } from './store.js';
import { priceCall } from './pricing.js';
import { checkBudget, shouldBlock } from './budget.js';
import { panelState } from './cost-view.js';
import type { CostEntry, BudgetConfig } from './types.js';

export interface LearnArgs {
  projectDir: string;
}

export class Cost {
  private store: CostStore;

  constructor(private projectDir: string) {
    this.store = new CostStore(projectDir);
  }

  record(model: string, promptTokens: number, completionTokens: number, sessionId: string): CostEntry {
    const cost = priceCall(model, promptTokens, completionTokens);
    const entry: CostEntry = {
      timestamp: Date.now(),
      model,
      promptTokens,
      completionTokens,
      cost,
      sessionId,
    };
    this.store.append(entry);
    return entry;
  }

  summary() {
    const entries = this.store.readAll();
    const budget = this.store.readBudget();
    const budgetStatus = budget ? checkBudget(entries, budget) : null;
    return panelState(entries, budgetStatus);
  }

  isBlocked(): boolean {
    const entries = this.store.readAll();
    const budget = this.store.readBudget();
    if (!budget) return false;
    return shouldBlock(entries, budget);
  }

  setBudget(monthly?: number, enforce?: boolean) {
    const config: BudgetConfig = {};
    if (monthly !== undefined) config.monthly = monthly;
    if (enforce !== undefined) config.enforce = enforce;
    return this.store.writeBudget(config);
  }
}
