import type { CostEntry, PanelPayload, BudgetStatus, DailyTrend, ModelBreakdown } from './types.js';

/** Route paths shared between host and client. */
export const COST_PANEL_PATH = '/api/cost.panel'
export const COST_BUDGET_PATH = '/api/cost.budget.set'
export const COST_SESSION_PATH = '/api/cost.session'
export const COST_EXPORT_PATH = '/api/cost.export'
export const COST_CLEAR_PATH = '/api/cost.clear'
export const COST_PRICING_UPDATE_PATH = '/api/cost.pricing.update'

const DAY = 86_400_000;

function dateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function panelState(
  entries: CostEntry[],
  budget: BudgetStatus | null,
  supportedModels: string[] = [],
): PanelPayload {
  const now = Date.now();
  const todayStart = now - (now % DAY);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthMs = monthStart.getTime();

  const todayEntries = entries.filter((e) => e.timestamp >= todayStart);
  const monthEntries = entries.filter((e) => e.timestamp >= monthMs);

  const todaySpend = todayEntries.reduce((s, e) => s + e.cost, 0);
  const monthSpend = monthEntries.reduce((s, e) => s + e.cost, 0);
  const totalSpend = entries.reduce((s, e) => s + e.cost, 0);
  const totalCalls = entries.length;
  const totalPromptTokens = entries.reduce((s, e) => s + e.promptTokens, 0);
  const totalCompletionTokens = entries.reduce((s, e) => s + e.completionTokens, 0);

  // Per-model breakdown with token counts (this month)
  const modelMap = new Map<string, { spend: number; calls: number; promptTokens: number; completionTokens: number }>();
  for (const e of monthEntries) {
    const m = modelMap.get(e.model) ?? { spend: 0, calls: 0, promptTokens: 0, completionTokens: 0 };
    m.spend += e.cost;
    m.calls += 1;
    m.promptTokens += e.promptTokens;
    m.completionTokens += e.completionTokens;
    modelMap.set(e.model, m);
  }
  const perModel: ModelBreakdown[] = [...modelMap.entries()]
    .map(([model, v]) => ({
      model,
      ...v,
      avgCostPerCall: v.calls > 0 ? v.spend / v.calls : 0,
    }))
    .sort((a, b) => b.spend - a.spend);

  // Daily trend (last 30 days)
  const thirtyDaysAgo = now - 30 * DAY;
  const trendEntries = entries.filter((e) => e.timestamp >= thirtyDaysAgo);
  const trendMap = new Map<string, DailyTrend>();
  for (const e of trendEntries) {
    const dk = dateKey(e.timestamp);
    const t = trendMap.get(dk) ?? { date: dk, spend: 0, promptTokens: 0, completionTokens: 0, calls: 0 };
    t.spend += e.cost;
    t.promptTokens += e.promptTokens;
    t.completionTokens += e.completionTokens;
    t.calls += 1;
    trendMap.set(dk, t);
  }
  const dailyTrend = [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  // Recent sessions (last 20 distinct)
  const sessionMap = new Map<string, { spend: number; calls: number; timestamp: number }>();
  for (const e of entries) {
    const s = sessionMap.get(e.sessionId) ?? { spend: 0, calls: 0, timestamp: 0 };
    s.spend += e.cost;
    s.calls += 1;
    s.timestamp = Math.max(s.timestamp, e.timestamp);
    sessionMap.set(e.sessionId, s);
  }
  const recentSessions = [...sessionMap.entries()]
    .map(([sessionId, v]) => ({ sessionId, ...v }))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20);

  return {
    todaySpend,
    monthSpend,
    totalSpend,
    totalCalls,
    totalPromptTokens,
    totalCompletionTokens,
    perModel,
    recentSessions,
    budget,
    dailyTrend,
    supportedModels,
  };
}
