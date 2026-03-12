export const MODEL_CONFIGS = {
  "claude-opus-4-6": {
    provider: "anthropic" as const,
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
    provider: "anthropic" as const,
    tierName: "Capable",
    tierDescription: "For demanding tasks that require deeper reasoning and precision",
    modelName: "Claude Sonnet 4.6",
    costTier: "Standard",
    inputPrice: 3,
    outputPrice: 15,
    costSymbol: "$$$",
    recommended: false,
    badge: "Expensive",
    dot: "bg-blue-500",
    text: "text-blue-600",
    border: "border-blue-400",
    bg: "bg-blue-50",
  },
  "claude-haiku-4-5-20251001": {
    provider: "anthropic" as const,
    tierName: "Everyday",
    tierDescription: "Great for most tasks — fast, reliable, and cost-effective",
    modelName: "Claude Haiku 4.5",
    costTier: "Economy",
    inputPrice: 1,
    outputPrice: 5,
    costSymbol: "$$",
    recommended: true,
    dot: "bg-emerald-500",
    text: "text-emerald-600",
    border: "border-emerald-400",
    bg: "bg-emerald-50",
  },
  "gpt-4o": {
    provider: "openai" as const,
    tierName: "Powerful",
    tierDescription: "OpenAI's flagship — strong reasoning and vision",
    modelName: "GPT-4o",
    costTier: "Standard",
    inputPrice: 2.5,
    outputPrice: 10,
    costSymbol: "$$",
    recommended: false,
    dot: "bg-violet-500",
    text: "text-violet-600",
    border: "border-violet-400",
    bg: "bg-violet-50",
  },
  "gpt-4o-mini": {
    provider: "openai" as const,
    tierName: "Fast",
    tierDescription: "Lightweight GPT — quick and cost-effective",
    modelName: "GPT-4o mini",
    costTier: "Economy",
    inputPrice: 0.15,
    outputPrice: 0.6,
    costSymbol: "$",
    recommended: false,
    dot: "bg-teal-500",
    text: "text-teal-600",
    border: "border-teal-400",
    bg: "bg-teal-50",
  },
  "gpt-5-mini": {
    provider: "openai" as const,
    tierName: "Balanced",
    tierDescription: "GPT-5 mini — next-gen intelligence, everyday speed",
    modelName: "GPT-5 mini",
    costTier: "Standard",
    inputPrice: 0.25,
    outputPrice: 2,
    costSymbol: "$",
    recommended: false,
    dot: "bg-purple-500",
    text: "text-purple-600",
    border: "border-purple-400",
    bg: "bg-purple-50",
  },
  "gpt-5-nano": {
    provider: "openai" as const,
    tierName: "Fast",
    tierDescription: "GPT-5 nano — ultra-lightweight and very affordable",
    modelName: "GPT-5 nano",
    costTier: "Economy",
    inputPrice: 0.05,
    outputPrice: 0.4,
    costSymbol: "$",
    recommended: false,
    dot: "bg-sky-500",
    text: "text-sky-600",
    border: "border-sky-400",
    bg: "bg-sky-50",
  },
} as const;

export type ModelId = keyof typeof MODEL_CONFIGS;

export const MODEL_ORDER: ModelId[] = [
  // "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
];

export const DEFAULT_MODEL: ModelId = "claude-haiku-4-5-20251001";

export function calculateRequestCost(
  modelId: ModelId,
  noCacheInputTokens: number,   // non-cached input tokens only (excludes cache reads/writes)
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): number {
  const { inputPrice, outputPrice } = MODEL_CONFIGS[modelId];
  return (
    noCacheInputTokens  * inputPrice         +   // standard input price for uncached tokens
    outputTokens        * outputPrice        +
    cacheReadTokens     * inputPrice * 0.1   +   // cache reads  = 10%  of input price
    cacheWriteTokens    * inputPrice * 1.25       // cache writes = 125% of input price (5-min ephemeral)
  ) / 1_000_000;
}

export function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.001) return "< $0.001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
