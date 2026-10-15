import { ArenaStore } from './store.js';
import { autoScore, buildLeaderboard } from './scoring.js';
import { lineDiff, diffSummary } from './diff.js';
import type { ArenaRun, ModelResult, Suite, RegressionReport, Score, LeaderboardEntry, ArenaStats, RunSummary, ComparePayload } from './types.js';

export class Arena {
  private store: ArenaStore;

  constructor(private projectDir: string) {
    this.store = new ArenaStore(projectDir);
  }

  /** Save a completed run (results already collected from model calls). */
  saveRun(prompt: string, results: ModelResult[], reference?: string): ArenaRun {
    const models = results.map((r) => r.model);
    const id = ArenaStore.generateId(prompt, models);
    const scores = autoScore(results, reference);
    const run: ArenaRun = { id, prompt, timestamp: Date.now(), results, scores, reference };
    this.store.saveRun(run);
    return run;
  }

  getRun(id: string): ArenaRun | null {
    return this.store.getRun(id);
  }

  listRuns(): RunSummary[] {
    return this.store.listRuns().map((r) => {
      const winner = this.pickWinner(r);
      return {
        id: r.id,
        prompt: r.prompt,
        timestamp: r.timestamp,
        modelCount: r.results.length,
        winner,
      };
    });
  }

  /** Compare two models' outputs within a run. */
  compare(runId: string, modelA: string, modelB: string): ComparePayload | null {
    const run = this.store.getRun(runId);
    if (!run) return null;
    const a = run.results.find((r) => r.model === modelA);
    const b = run.results.find((r) => r.model === modelB);
    if (!a || !b) return null;
    return {
      runId,
      modelA: a.model,
      modelB: b.model,
      outputA: a.output,
      outputB: b.output,
      diff: lineDiff(a.output, b.output),
      summary: diffSummary(a.output, b.output),
      scoreA: run.scores[modelA] ?? {},
      scoreB: run.scores[modelB] ?? {},
    };
  }

  /** Set a user rating for a model in a run. */
  rate(runId: string, model: string, rating: number): ArenaRun | null {
    const run = this.store.getRun(runId);
    if (!run) return null;
    if (!run.scores[model]) run.scores[model] = {};
    run.scores[model].userRating = rating;
    this.store.saveRun(run);
    return run;
  }

  /** Delete a run. */
  deleteRun(runId: string): boolean {
    return this.store.deleteRun(runId);
  }

  /** Save a benchmark suite. */
  saveSuite(suite: Suite): void {
    this.store.saveSuite(suite);
  }

  /** Generate a regression report between two runs of the same suite. */
  regression(suiteName: string, baselineRunId: string, currentRunId: string): RegressionReport | null {
    const baseline = this.store.getRun(baselineRunId);
    const current = this.store.getRun(currentRunId);
    if (!baseline || !current) return null;

    const changes: RegressionReport['changes'] = [];
    for (const cr of current.results) {
      const br = baseline.results.find((r) => r.model === cr.model);
      if (br && br.output !== cr.output) {
        changes.push({
          model: cr.model,
          prompt: current.prompt,
          improved: (current.scores[cr.model]?.referenceMatch ?? 0) > (baseline.scores[cr.model]?.referenceMatch ?? 0),
          baselineOutput: br.output,
          currentOutput: cr.output,
        });
      }
    }

    return { suiteName, baselineRunId, currentRunId, changes };
  }

  /** Elo leaderboard from all runs. */
  leaderboard(): LeaderboardEntry[] {
    const allRuns = this.store.listRuns();
    return buildLeaderboard(allRuns);
  }

  /** Aggregate stats. */
  stats(): ArenaStats {
    const allRuns = this.store.listRuns();
    const allModels = new Set<string>();
    const allPrompts = new Set<string>();
    for (const run of allRuns) {
      allPrompts.add(run.prompt);
      for (const r of run.results) allModels.add(r.model);
    }
    let totalRatings = 0;
    for (const run of allRuns) {
      for (const [, score] of Object.entries(run.scores)) {
        if (score.userRating !== undefined) totalRatings++;
      }
    }
    return {
      totalRuns: allRuns.length,
      totalModels: allModels.size,
      uniqueModels: allModels.size,
      uniquePrompts: allPrompts.size,
      totalRatings,
      avgModelsPerRun: allRuns.length > 0
        ? Math.round((allRuns.reduce((s, r) => s + r.results.length, 0) / allRuns.length) * 10) / 10
        : 0,
    };
  }

  /** Pick the best model in a run by composite score. */
  private pickWinner(run: ArenaRun): string | undefined {
    let best: string | undefined;
    let bestScore = -Infinity;
    for (const [model, score] of Object.entries(run.scores)) {
      const s = (score.userRating !== undefined ? score.userRating / 5 : 0)
        + (score.referenceMatch ?? 0) + (score.latencyScore ?? 0);
      if (s > bestScore) { bestScore = s; best = model; }
    }
    return best;
  }
}
