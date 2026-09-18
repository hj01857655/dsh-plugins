import type { CostEntry, PanelPayload, BudgetStatus } from './types.js';

/** Route paths shared between host and client. */
export const COST_PANEL_PATH = '/api/cost.panel'
export const COST_BUDGET_PATH = '/api/cost.budget.set'

const DAY = 86_400_000;

export function panelState(
  entries: CostEntry[],
  budget: BudgetStatus | null,
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

  // Per-model breakdown (this month)
  const modelMap = new Map<string, { spend: number; calls: number }>();
  for (const e of monthEntries) {
    const m = modelMap.get(e.model) ?? { spend: 0, calls: 0 };
    m.spend += e.cost;
    m.calls += 1;
    modelMap.set(e.model, m);
  }
  const perModel = [...modelMap.entries()]
    .map(([model, v]) => ({ model, ...v }))
    .sort((a, b) => b.spend - a.spend);

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

  return { todaySpend, monthSpend, perModel, recentSessions, budget };
}
