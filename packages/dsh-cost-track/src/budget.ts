import type { CostEntry, Budget, BudgetStatus } from './types.js';

export function checkBudget(entries: CostEntry[], budget: Budget): BudgetStatus {
  const periodEntries = entries.filter((e) => e.timestamp >= budget.periodStart);
  const spent = periodEntries.reduce((sum, e) => sum + e.cost, 0);
  return {
    exceeded: spent >= budget.monthly,
    spent,
    remaining: budget.monthly - spent,
  };
}

export function shouldBlock(entries: CostEntry[], budget: Budget): boolean {
  if (!budget.enforce) return false;
  return checkBudget(entries, budget).exceeded;
}
