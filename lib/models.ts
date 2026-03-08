export const MODEL_CONFIGS = {
  "claude-opus-4-6": {
    tierName: "Powerful",
    tierDescription: "Deep reasoning, complex analysis, nuanced writing",
    modelName: "Claude Opus 4.6",
    costTier: "Premium",
    inputPrice: 5,    // $ per million tokens
    outputPrice: 25,
    costSymbol: "$$$",
    recommended: false,
    dot: "bg-indigo-500",
    text: "text-indigo-600",
    border: "border-indigo-400",
    bg: "bg-indigo-50",
  },
  "claude-sonnet-4-6": {
    tierName: "Balanced",
    tierDescription: "Smart and fast — great for most everyday tasks",
    modelName: "Claude Sonnet 4.6",
    costTier: "Standard",
    inputPrice: 3,
    outputPrice: 15,
    costSymbol: "$$",
    recommended: true,
    dot: "bg-blue-500",
    text: "text-blue-600",
    border: "border-blue-400",
    bg: "bg-blue-50",
  },
  "claude-haiku-4-5-20251001": {
    tierName: "Fast",
    tierDescription: "Quick answers, lookups, and simple questions",
    modelName: "Claude Haiku 4.5",
    costTier: "Economy",
    inputPrice: 1,
    outputPrice: 5,
    costSymbol: "$",
    recommended: false,
    dot: "bg-emerald-500",
    text: "text-emerald-600",
    border: "border-emerald-400",
    bg: "bg-emerald-50",
  },
} as const;

export type ModelId = keyof typeof MODEL_CONFIGS;

export const MODEL_ORDER: ModelId[] = [
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
];

export const DEFAULT_MODEL: ModelId = "claude-sonnet-4-6";

export function calculateRequestCost(
  modelId: ModelId,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheCreationTokens = 0,
): number {
  const { inputPrice, outputPrice } = MODEL_CONFIGS[modelId];
  return (
    inputTokens       * inputPrice         +
    outputTokens      * outputPrice        +
    cacheReadTokens   * inputPrice * 0.1   +  // cache reads = 10% of input price
    cacheCreationTokens * inputPrice * 1.25    // cache writes = 125% of input price
  ) / 1_000_000;
}

export function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.001) return "< $0.001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
