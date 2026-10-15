import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelPricing } from './types.js';

/**
 * Built-in pricing per million tokens (USD).
 *
 * Snapshot from https://models.dev (2026-09) + vendor docs.
 * Use `cost pricing update` to refresh from models.dev,
 * or drop a `.cost/pricing.json` to override per-project.
 */
export const DEFAULT_PRICING: Record<string, ModelPricing> = {
  /* ── DeepSeek ─────────────────────────────────────────────── */
  'deepseek-chat':             { promptPerMillion: 0.14,   completionPerMillion: 0.28 },
  'deepseek-coder':            { promptPerMillion: 0.14,   completionPerMillion: 0.28 },
  'deepseek-reasoner':         { promptPerMillion: 0.55,   completionPerMillion: 2.19 },
  'deepseek-v3':               { promptPerMillion: 0.14,   completionPerMillion: 0.28 },
  'deepseek-v4':               { promptPerMillion: 0.20,   completionPerMillion: 0.60 },
  'deepseek-v4-0324':          { promptPerMillion: 0.20,   completionPerMillion: 0.60 },
  'deepseek-v4.1':             { promptPerMillion: 0.20,   completionPerMillion: 0.60 },
  'deepseek-v4.1-flash':       { promptPerMillion: 0.15,   completionPerMillion: 0.60 },
  'deepseek-r1':               { promptPerMillion: 0.55,   completionPerMillion: 2.19 },

  /* ── OpenAI ───────────────────────────────────────────────── */
  'gpt-5.6-luna':              { promptPerMillion: 0.00,   completionPerMillion: 0.00 },
  'gpt-5.6-sol':               { promptPerMillion: 0.00,   completionPerMillion: 0.00 },
  'gpt-5.6-terra':             { promptPerMillion: 0.00,   completionPerMillion: 0.00 },
  'gpt-5.5':                   { promptPerMillion: 0.00,   completionPerMillion: 0.00 },
  'gpt-5.5-instant':           { promptPerMillion: 5.00,   completionPerMillion: 30.00 },
  'gpt-5.5-pro':               { promptPerMillion: 27.27,  completionPerMillion: 163.64 },
  'gpt-5.4':                   { promptPerMillion: 0.00,   completionPerMillion: 0.00 },
  'gpt-5.4-mini':              { promptPerMillion: 0.00,   completionPerMillion: 0.00 },
  'gpt-5.4-nano':              { promptPerMillion: 0.18,   completionPerMillion: 1.10 },
  'gpt-5.4-pro':               { promptPerMillion: 27.00,  completionPerMillion: 160.00 },
  'gpt-5.3-codex':             { promptPerMillion: 1.60,   completionPerMillion: 13.00 },
  'gpt-5.2':                   { promptPerMillion: 1.05,   completionPerMillion: 8.40 },
  'gpt-5.2-codex':             { promptPerMillion: 1.60,   completionPerMillion: 13.00 },
  'gpt-5.2-pro':               { promptPerMillion: 19.00,  completionPerMillion: 150.00 },
  'gpt-5.1':                   { promptPerMillion: 1.10,   completionPerMillion: 9.00 },
  'gpt-5.1-codex':             { promptPerMillion: 1.10,   completionPerMillion: 9.00 },
  'gpt-5.1-codex-mini':        { promptPerMillion: 0.22,   completionPerMillion: 1.80 },
  'gpt-5':                     { promptPerMillion: 1.10,   completionPerMillion: 9.00 },
  'gpt-5-mini':                { promptPerMillion: 0.22,   completionPerMillion: 1.80 },
  'gpt-5-nano':                { promptPerMillion: 0.04,   completionPerMillion: 0.36 },
  'gpt-5-pro':                 { promptPerMillion: 14.00,  completionPerMillion: 110.00 },
  'gpt-5-codex':               { promptPerMillion: 1.10,   completionPerMillion: 9.00 },
  'gpt-4.1':                   { promptPerMillion: 1.80,   completionPerMillion: 7.20 },
  'gpt-4.1-mini':              { promptPerMillion: 0.36,   completionPerMillion: 1.40 },
  'gpt-4.1-nano':              { promptPerMillion: 0.08,   completionPerMillion: 0.26 },
  'gpt-4o':                    { promptPerMillion: 1.25,   completionPerMillion: 5.00 },
  'gpt-4o-mini':               { promptPerMillion: 0.07,   completionPerMillion: 0.30 },
  'gpt-4-turbo':               { promptPerMillion: 9.00,   completionPerMillion: 27.00 },
  'gpt-4':                     { promptPerMillion: 30.00,  completionPerMillion: 60.00 },
  'gpt-3.5-turbo':             { promptPerMillion: 0.45,   completionPerMillion: 1.40 },
  'o1':                        { promptPerMillion: 14.00,  completionPerMillion: 54.00 },
  'o1-pro':                    { promptPerMillion: 140.00, completionPerMillion: 540.00 },
  'o3':                        { promptPerMillion: 1.80,   completionPerMillion: 7.20 },
  'o3-mini':                   { promptPerMillion: 0.99,   completionPerMillion: 4.00 },
  'o3-pro':                    { promptPerMillion: 18.00,  completionPerMillion: 40.00 },
  'o4-mini':                   { promptPerMillion: 0.99,   completionPerMillion: 4.00 },

  /* ── Anthropic ────────────────────────────────────────────── */
  'claude-4-opus':             { promptPerMillion: 15.00,  completionPerMillion: 75.00 },
  'claude-4-sonnet':           { promptPerMillion: 3.00,   completionPerMillion: 15.00 },
  'claude-opus-4':             { promptPerMillion: 15.00,  completionPerMillion: 75.00 },
  'claude-sonnet-4':           { promptPerMillion: 3.00,   completionPerMillion: 15.00 },
  'claude-3.7-sonnet':         { promptPerMillion: 3.00,   completionPerMillion: 15.00 },
  'claude-3.5-sonnet':         { promptPerMillion: 3.00,   completionPerMillion: 15.00 },
  'claude-3.5-haiku':          { promptPerMillion: 0.80,   completionPerMillion: 4.00 },
  'claude-3-opus':             { promptPerMillion: 15.00,  completionPerMillion: 75.00 },
  'claude-3-haiku':            { promptPerMillion: 0.25,   completionPerMillion: 1.25 },

  /* ── Google ───────────────────────────────────────────────── */
  'gemini-2.5-pro':            { promptPerMillion: 1.25,   completionPerMillion: 10.00 },
  'gemini-2.5-flash':          { promptPerMillion: 0.15,   completionPerMillion: 0.60 },
  'gemini-2.0-flash':          { promptPerMillion: 0.10,   completionPerMillion: 0.40 },
  'gemini-1.5-pro':            { promptPerMillion: 1.25,   completionPerMillion: 5.00 },
  'gemini-1.5-flash':          { promptPerMillion: 0.075,  completionPerMillion: 0.30 },

  /* ── Meta Llama ───────────────────────────────────────────── */
  'llama-4-maverick':          { promptPerMillion: 0.20,   completionPerMillion: 0.60 },
  'llama-4-scout':             { promptPerMillion: 0.12,   completionPerMillion: 0.36 },
  'llama-3.3-70b':             { promptPerMillion: 0.18,   completionPerMillion: 0.36 },
  'llama-3.1-405b':            { promptPerMillion: 2.00,   completionPerMillion: 2.00 },
  'llama-3.1-70b':             { promptPerMillion: 0.18,   completionPerMillion: 0.18 },
  'llama-3.1-8b':              { promptPerMillion: 0.03,   completionPerMillion: 0.05 },

  /* ── Mistral ──────────────────────────────────────────────── */
  'mistral-large':             { promptPerMillion: 2.00,   completionPerMillion: 6.00 },
  'mistral-medium':            { promptPerMillion: 1.00,   completionPerMillion: 3.00 },
  'mistral-small':             { promptPerMillion: 0.10,   completionPerMillion: 0.30 },
  'codestral':                 { promptPerMillion: 0.30,   completionPerMillion: 0.90 },

  /* ── Qwen ─────────────────────────────────────────────────── */
  'qwen-3':                    { promptPerMillion: 0.14,   completionPerMillion: 0.28 },
  'qwen-2.5-coder-32b':       { promptPerMillion: 0.07,   completionPerMillion: 0.14 },
  'qwen-2.5-72b':             { promptPerMillion: 0.18,   completionPerMillion: 0.36 },

  /* ── xAI Grok ─────────────────────────────────────────────── */
  'grok-3':                    { promptPerMillion: 3.00,   completionPerMillion: 15.00 },
  'grok-3-mini':               { promptPerMillion: 0.30,   completionPerMillion: 0.50 },
  'grok-2':                    { promptPerMillion: 2.00,   completionPerMillion: 10.00 },
};

/** Timestamp of the built-in snapshot for staleness indication. */
export const BUILTIN_SNAPSHOT_DATE = '2026-09';

/**
 * Load pricing: built-in → models.dev cache → user overrides (highest priority).
 * Each layer merges on top of the previous one.
 */
export function loadPricing(projectDir: string): Record<string, ModelPricing> {
  const merged = { ...DEFAULT_PRICING };

  // Layer 2: models.dev cache (written by `cost pricing update`)
  const cachePath = join(projectDir, '.cost', 'models-dev-cache.json');
  mergeFromFile(merged, cachePath);

  // Layer 3: user overrides (highest priority)
  const customPath = join(projectDir, '.cost', 'pricing.json');
  mergeFromFile(merged, customPath);

  return merged;
}

function mergeFromFile(target: Record<string, ModelPricing>, filePath: string): void {
  if (!existsSync(filePath)) return;
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    for (const [model, price] of Object.entries(raw)) {
      const p = price as Record<string, unknown>;
      if (typeof p.promptPerMillion === 'number' && typeof p.completionPerMillion === 'number') {
        target[model] = { promptPerMillion: p.promptPerMillion, completionPerMillion: p.completionPerMillion };
      }
    }
  } catch { /* ignore malformed file */ }
}

/**
 * Fetch latest pricing from models.dev and save as local cache.
 * Returns the number of models updated, or throws on network error.
 */
export async function updatePricingFromModels(projectDir: string): Promise<{
  updated: number;
  cached: string;
}> {
  const CATALOG_URL = 'https://models.dev/catalog.json';
  const response = await fetch(CATALOG_URL);
  if (!response.ok) throw new Error(`models.dev returned ${response.status}`);
  const catalog = (await response.json()) as {
    providers?: Record<string, {
      models?: Record<string, {
        pricing?: { prompt?: string; completion?: string };
      }>;
    }>;
  };

  const result: Record<string, ModelPricing> = {};
  let count = 0;

  if (catalog.providers) {
    for (const provider of Object.values(catalog.providers)) {
      if (!provider.models) continue;
      for (const [modelId, model] of Object.entries(provider.models)) {
        if (!model.pricing) continue;
        const prompt = parsePrice(model.pricing.prompt);
        const completion = parsePrice(model.pricing.completion);
        if (prompt !== undefined && completion !== undefined) {
          // Normalize model id: strip provider prefix if present
          const shortId = modelId.includes('/') ? modelId.split('/').pop()! : modelId;
          result[shortId] = { promptPerMillion: prompt, completionPerMillion: completion };
          if (!result[modelId] && modelId.includes('/')) {
            result[modelId] = { promptPerMillion: prompt, completionPerMillion: completion };
          }
          count++;
        }
      }
    }
  }

  const dir = join(projectDir, '.cost');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const cachePath = join(dir, 'models-dev-cache.json');
  writeFileSync(cachePath, JSON.stringify(result, null, 2) + '\n');

  return { updated: count, cached: cachePath };
}

function parsePrice(val: string | number | undefined): number | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'number') return val;
  const n = parseFloat(String(val).replace(/[^0-9.e-]/gi, ''));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Price a single call. Falls back to zero for unknown models.
 */
export function priceCall(
  model: string,
  promptTokens: number,
  completionTokens: number,
  pricing?: Record<string, ModelPricing>,
): number {
  const table = pricing ?? DEFAULT_PRICING;
  // Try exact match, then prefix match (e.g. "gpt-4o-2024-08-06" → "gpt-4o")
  const p = table[model] ?? findByPrefix(table, model);
  if (!p) return 0;
  return (
    (promptTokens / 1_000_000) * p.promptPerMillion +
    (completionTokens / 1_000_000) * p.completionPerMillion
  );
}

function findByPrefix(table: Record<string, ModelPricing>, model: string): ModelPricing | undefined {
  // Sort keys longest first so "gpt-4o-mini" beats "gpt-4o"
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (model.startsWith(key)) return table[key];
  }
  return undefined;
}
