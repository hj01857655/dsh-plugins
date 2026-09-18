import type { ModelPricing } from './types.js';

// Default pricing per million tokens (USD).
// Covers DeepSeek's own models; users can override.
export const DEFAULT_PRICING: Record<string, ModelPricing> = {
  'deepseek-chat': { promptPerMillion: 0.14, completionPerMillion: 0.28 },
  'deepseek-reasoner': { promptPerMillion: 0.55, completionPerMillion: 2.19 },
};

export function priceCall(
  model: string,
  promptTokens: number,
  completionTokens: number,
  pricing?: Record<string, ModelPricing>,
): number {
  const table = pricing ?? DEFAULT_PRICING;
  const p = table[model];
  if (!p) return 0;
  return (
    (promptTokens / 1_000_000) * p.promptPerMillion +
    (completionTokens / 1_000_000) * p.completionPerMillion
  );
}
