import type { PanelPayload } from '../types.js';

export function renderPanel(payload: PanelPayload): string {
  const budgetBar = payload.budget
    ? `<div class="cost-budget">
         <div class="cost-budget-bar" style="width: ${Math.min(100, (payload.budget.spent / (payload.budget.spent + payload.budget.remaining)) * 100)}%"></div>
         <span>$${payload.budget.spent.toFixed(2)} / $${(payload.budget.spent + payload.budget.remaining).toFixed(2)}${payload.budget.exceeded ? ' ⚠ EXCEEDED' : ''}</span>
       </div>`
    : '';

  const modelRows = payload.perModel
    .map((m) => `<tr><td>${m.model}</td><td>${m.calls}</td><td>$${m.spend.toFixed(4)}</td></tr>`)
    .join('');

  const sessionRows = payload.recentSessions
    .map((s) => `<tr><td>${s.sessionId.slice(0, 8)}</td><td>${s.calls}</td><td>$${s.spend.toFixed(4)}</td><td>${new Date(s.timestamp).toLocaleDateString()}</td></tr>`)
    .join('');

  return `<div class="cost-panel">
    <h2>Cost</h2>
    <div class="cost-summary">
      <div>Today: <strong>$${payload.todaySpend.toFixed(4)}</strong></div>
      <div>This month: <strong>$${payload.monthSpend.toFixed(4)}</strong></div>
    </div>
    ${budgetBar}
    ${modelRows ? `<table class="cost-table"><thead><tr><th>Model</th><th>Calls</th><th>Spend</th></tr></thead><tbody>${modelRows}</tbody></table>` : ''}
    ${sessionRows ? `<h3>Recent sessions</h3><table class="cost-table"><thead><tr><th>Session</th><th>Calls</th><th>Spend</th><th>Date</th></tr></thead><tbody>${sessionRows}</tbody></table>` : ''}
  </div>`;
}
