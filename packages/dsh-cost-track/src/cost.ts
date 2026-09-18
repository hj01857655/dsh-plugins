import { CostStore } from './store.js';
import { priceCall, loadPricing, updatePricingFromModels, DEFAULT_PRICING } from './pricing.js';
import { checkBudget, shouldBlock } from './budget.js';
import { panelState } from './cost-view.js';
import type { CostEntry, BudgetConfig, TimeRange, SessionDetail, PanelPayload } from './types.js';

export class Cost {
  private store: CostStore;
  private pricing: Record<string, import('./types.js').ModelPricing>;

  constructor(private projectDir: string) {
    this.store = new CostStore(projectDir);
    this.pricing = loadPricing(projectDir);
  }

  /** Re-read pricing after an update. */
  reloadPricing(): void {
    this.pricing = loadPricing(this.projectDir);
  }

  record(model: string, promptTokens: number, completionTokens: number, sessionId: string): CostEntry {
    const cost = priceCall(model, promptTokens, completionTokens, this.pricing);
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

  /** Full panel summary with daily trends and token totals. */
  summary(): PanelPayload {
    const entries = this.store.readAll();
    const budget = this.store.readBudget();
    const budgetStatus = budget ? checkBudget(entries, budget) : null;
    return panelState(entries, budgetStatus, Object.keys(this.pricing));
  }

  /** Query entries within a time range. */
  query(range: TimeRange): CostEntry[] {
    return this.store.readAll().filter((e) => {
      if (range.from !== undefined && e.timestamp < range.from) return false;
      if (range.to !== undefined && e.timestamp >= range.to) return false;
      return true;
    });
  }

  /** Expand a session into its individual calls. */
  sessionDetail(sessionId: string): SessionDetail | null {
    const entries = this.store.readAll().filter((e) => e.sessionId === sessionId);
    if (entries.length === 0) return null;
    return {
      sessionId,
      spend: entries.reduce((s, e) => s + e.cost, 0),
      calls: entries.length,
      timestamp: Math.max(...entries.map((e) => e.timestamp)),
      entries: entries.map((e) => ({
        timestamp: e.timestamp,
        model: e.model,
        promptTokens: e.promptTokens,
        completionTokens: e.completionTokens,
        cost: e.cost,
      })),
    };
  }

  /** Export entries as CSV string. */
  exportCSV(range?: TimeRange): string {
    const entries = range ? this.query(range) : this.store.readAll();
    const header = 'timestamp,model,promptTokens,completionTokens,cost,sessionId';
    const rows = entries.map((e) =>
      `${new Date(e.timestamp).toISOString()},${e.model},${e.promptTokens},${e.completionTokens},${e.cost.toFixed(6)},${e.sessionId}`,
    );
    return [header, ...rows].join('\n') + '\n';
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

  /** Supported model count for UI display. */
  get supportedModels(): string[] {
    return Object.keys(this.pricing);
  }

  /** Pull latest prices from models.dev into local cache. */
  async updatePricing(): Promise<{ updated: number; cached: string }> {
    const result = await updatePricingFromModels(this.projectDir);
    this.reloadPricing();
    return result;
  }

  /** Clear all recorded entries (destructive). */
  clearData(): { removed: number } {
    const entries = this.store.readAll();
    this.store.clear();
    return { removed: entries.length };
  }
}
