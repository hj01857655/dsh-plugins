import type { ModelResult, Score } from './types.js';

/** Score outputs automatically based on simple metrics. */
export function autoScore(
  results: ModelResult[],
  reference?: string,
): Record<string, Score> {
  const scores: Record<string, Score> = {};
  const maxLen = Math.max(...results.map((r) => r.output.length), 1);
  const minLatency = Math.min(...results.map((r) => r.latencyMs), 1);

  for (const r of results) {
    const score: Score = {
      lengthScore: r.output.length / maxLen,
      latencyScore: minLatency / r.latencyMs,
    };
    if (reference) {
      score.referenceMatch = similarity(r.output, reference);
    }
    scores[r.model] = score;
  }
  return scores;
}

/** Simple character-level similarity (Jaccard on character bigrams). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));
  const bigramsB = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2));

  let intersection = 0;
  for (const bg of bigramsA) if (bigramsB.has(bg)) intersection++;

  return intersection / (bigramsA.size + bigramsB.size - intersection);
}
