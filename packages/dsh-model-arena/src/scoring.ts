import type { ModelResult, Score, LeaderboardEntry } from './types.js';

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

// ── Elo rating system ────────────────────────────────────────

const INITIAL_ELO = 1200;
const K_FACTOR = 32;

interface EloRecord {
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  games: number;
  totalLatencyMs: number;
  totalTokens: number;
  totalRuns: number;
  totalRating: number;
  ratingCount: number;
}

/** Compute expected score (probability of winning). */
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/** Build a leaderboard from all runs using Elo rating. */
export function buildLeaderboard(
  runs: { results: ModelResult[]; scores: Record<string, Score> }[],
): LeaderboardEntry[] {
  const records = new Map<string, EloRecord>();

  const getOrInit = (model: string): EloRecord => {
    if (!records.has(model)) {
      records.set(model, { elo: INITIAL_ELO, wins: 0, losses: 0, draws: 0, games: 0, totalLatencyMs: 0, totalTokens: 0, totalRuns: 0, totalRating: 0, ratingCount: 0 });
    }
    return records.get(model)!;
  };

  for (const run of runs) {
    // accumulate raw stats
    for (const r of run.results) {
      const rec = getOrInit(r.model);
      rec.totalLatencyMs += r.latencyMs;
      rec.totalTokens += r.promptTokens + r.completionTokens;
      rec.totalRuns++;
      if (r.rating !== undefined) {
        rec.totalRating += r.rating;
        rec.ratingCount++;
      }
    }

    // pairwise Elo updates based on user rating (if any) or composite auto-score
    const models = run.results.map((r) => r.model);
    for (let i = 0; i < models.length; i++) {
      for (let j = i + 1; j < models.length; j++) {
        const a = models[i];
        const b = models[j];
        const recA = getOrInit(a);
        const recB = getOrInit(b);
        const sA = compositeScore(run.scores[a]);
        const sB = compositeScore(run.scores[b]);

        const eA = expectedScore(recA.elo, recB.elo);
        let actualA: number;
        if (Math.abs(sA - sB) < 0.01) {
          // draw
          actualA = 0.5;
          recA.draws++;
          recB.draws++;
        } else if (sA > sB) {
          actualA = 1;
          recA.wins++;
          recB.losses++;
        } else {
          actualA = 0;
          recA.losses++;
          recB.wins++;
        }
        recA.elo += K_FACTOR * (actualA - eA);
        recB.elo += K_FACTOR * ((1 - actualA) - (1 - eA));
        recA.games++;
        recB.games++;
      }
    }
  }

  const entries: LeaderboardEntry[] = [];
  for (const [model, rec] of records) {
    entries.push({
      model,
      elo: Math.round(rec.elo),
      wins: rec.wins,
      losses: rec.losses,
      draws: rec.draws,
      games: rec.games,
      totalRuns: rec.totalRuns,
      avgRating: rec.ratingCount > 0 ? Math.round((rec.totalRating / rec.ratingCount) * 10) / 10 : 0,
      avgLatencyMs: rec.games > 0 ? Math.round(rec.totalLatencyMs / rec.games) : 0,
      avgTokens: rec.games > 0 ? Math.round(rec.totalTokens / rec.games) : 0,
    });
  }
  entries.sort((a, b) => b.elo - a.elo);
  return entries;
}

/** Combine score dimensions into a single number for ranking. */
function compositeScore(s?: Score): number {
  if (!s) return 0;
  // User rating dominates if present (1-5 scale → 0-1)
  if (s.userRating !== undefined) return s.userRating / 5;
  // Otherwise average available auto-scores
  const parts: number[] = [];
  if (s.referenceMatch !== undefined) parts.push(s.referenceMatch);
  if (s.lengthScore !== undefined) parts.push(s.lengthScore);
  if (s.latencyScore !== undefined) parts.push(s.latencyScore);
  return parts.length > 0 ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
}
