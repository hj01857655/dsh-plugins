// Types for dsh-prompt-vcs

export interface Change {
  hash: string;
  timestamp: number;
  file: string;
  changedBy: 'user' | 'plugin' | 'agent';
  pluginId?: string;
  addedLines: number;
  removedLines: number;
  diff: string;
  oldContent: string;
  newContent: string;
}

export interface TimelineEntry {
  hash: string;
  timestamp: number;
  file: string;
  changedBy: string;
  addedLines: number;
  removedLines: number;
}

export interface FileStat {
  file: string;
  changes: number;
  lastChanged: number;
  currentSize: number;
}

export interface PanelPayload {
  timeline: TimelineEntry[];
  files: FileStat[];
  totalChanges: number;
  watchedFiles: string[];
}
