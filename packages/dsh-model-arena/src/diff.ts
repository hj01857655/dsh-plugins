/** Simple line-level diff for comparing model outputs. */
export interface DiffLine {
  type: 'same' | 'added' | 'removed';
  text: string;
}

export function lineDiff(a: string, b: string): DiffLine[] {
  const linesA = a.split('\n');
  const linesB = b.split('\n');
  const result: DiffLine[] = [];
  const maxLen = Math.max(linesA.length, linesB.length);

  for (let i = 0; i < maxLen; i++) {
    const la = linesA[i];
    const lb = linesB[i];
    if (la === lb) {
      result.push({ type: 'same', text: la ?? '' });
    } else {
      if (la !== undefined) result.push({ type: 'removed', text: la });
      if (lb !== undefined) result.push({ type: 'added', text: lb });
    }
  }
  return result;
}

export function diffSummary(a: string, b: string): { added: number; removed: number; changed: number } {
  const diff = lineDiff(a, b);
  let added = 0;
  let removed = 0;
  for (const d of diff) {
    if (d.type === 'added') added++;
    if (d.type === 'removed') removed++;
  }
  return { added, removed, changed: added + removed };
}
