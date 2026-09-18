import type { PanelPayload } from '../types.js';

export function renderPanel(payload: PanelPayload): string {
  const runRows = payload.recentRuns
    .map((r) => `<tr><td>${r.id}</td><td>${r.modelCount}</td><td>${new Date(r.timestamp).toLocaleString()}</td><td>${r.prompt.slice(0, 60)}...</td></tr>`)
    .join('');

  return `<div class="arena-panel">
    <h2>Model Arena</h2>
    ${runRows ? `<table class="arena-table"><thead><tr><th>Run</th><th>Models</th><th>Date</th><th>Prompt</th></tr></thead><tbody>${runRows}</tbody></table>` : '<p>No runs yet.</p>'}
  </div>`;
}
