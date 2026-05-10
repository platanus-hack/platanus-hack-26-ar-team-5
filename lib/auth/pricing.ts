/**
 * Anthropic price book → USD per 1M tokens. Used to attribute cost back to a
 * user when we record a usage_event. Numbers reflect the public Claude pricing
 * page; bump when the rates change. Unknown models fall through to Sonnet.
 */

type Pricing = { input_per_mtok: number; output_per_mtok: number };

const PRICING: Record<string, Pricing> = {
  "claude-opus-4-7": { input_per_mtok: 15, output_per_mtok: 75 },
  "claude-opus-4-6": { input_per_mtok: 15, output_per_mtok: 75 },
  "claude-sonnet-4-6": { input_per_mtok: 3, output_per_mtok: 15 },
  "claude-sonnet-4-5": { input_per_mtok: 3, output_per_mtok: 15 },
  "claude-haiku-4-5": { input_per_mtok: 1, output_per_mtok: 5 },
};

const FALLBACK: Pricing = { input_per_mtok: 3, output_per_mtok: 15 };

function priceFor(model: string | undefined): Pricing {
  if (!model) return FALLBACK;
  const exact = PRICING[model];
  if (exact) return exact;
  // Loose match — strip trailing date suffixes.
  for (const [key, value] of Object.entries(PRICING)) {
    if (model.startsWith(key)) return value;
  }
  return FALLBACK;
}

export function estimateCostUsd(
  model: string | undefined,
  tokensIn: number,
  tokensOut: number,
): number {
  const p = priceFor(model);
  const cost =
    (tokensIn * p.input_per_mtok) / 1_000_000 +
    (tokensOut * p.output_per_mtok) / 1_000_000;
  // Round to 6 decimals — matches the numeric(12,6) column in usage_events.
  return Math.round(cost * 1_000_000) / 1_000_000;
}
