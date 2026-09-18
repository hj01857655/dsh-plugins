import type { PanelPayload } from '../types.js';

export function renderPanel(payload: PanelPayload): string {
  const rows = payload.timeline
    .map((e) => `<tr><td>${e.hash}</td><td>${new Date(e.timestamp).toLocaleString()}</td><td>${e.changedBy}</td><td>${e.file}</td><td>+${e.addedLines}</td><td>-${e.removedLines}</td></tr>`)
    .join('');
  return `<div class="vcs-panel"><h2>Prompt VCS</h2>${rows ? `<table><thead><tr><th>Hash</th><th>Date</th><th>By</th><th>File</th><th>+</th><th>-</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>No changes recorded.</p>'}</div>`;
}
