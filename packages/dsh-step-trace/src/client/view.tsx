import type { PanelPayload } from '../types.js';

export function renderPanel(payload: PanelPayload): string {
  const rows = payload.sessions
    .map((s) => `<tr><td>${s.sessionId}</td><td>${s.stepCount}</td><td>${new Date(s.timestamp).toLocaleString()}</td></tr>`)
    .join('');
  return `<div class="replay-panel"><h2>Replay</h2>${rows ? `<table><thead><tr><th>Session</th><th>Steps</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>No recorded sessions.</p>'}</div>`;
}
