/**
 * prompt-optimizer.ts — Adaptive Prompt Selection Engine
 *
 * 2026 techniques:
 *   - A/B variant tracking: monitor success rates per prompt template
 *   - Contextual scoring: Select variants based on task type + model capability
 *   - Reinforcement from feedback: Update variant weights based on outcomes
 *   - Token budget awareness: Prefer shorter prompts when model allows
 *
 * This module is a lightweight, persistence-free optimization layer.
 * Variants are defined statically but their runtime performance is tracked
 * in-memory and the best-performing variant is auto-selected.
 */

// ─── Types ──────────────────────────────────────────────────────

export interface PromptVariant {
  /** Unique identifier */
  id: string;
  /** Template string with {{placeholders}} */
  template: string;
  /** Human-readable description */
  description: string;
  /** Which task categories this variant targets */
  targetTasks: string[];
  /** Runtime statistics */
  stats: VariantStats;
}

export interface VariantStats {
  uses: number;
  successes: number;
  failures: number;
  avgTokens: number;
  avgLatencyMs: number;
  /** Bayesian-smoothed success rate */
  successRate: number;
}

export interface PromptOptimizationResult {
  /** Selected variant ID */
  variantId: string;
  /** Assembled prompt string */
  prompt: string;
  /** Estimated token count */
  estimatedTokens: number;
  /** Why this variant was chosen */
  reason: string;
}

// ─── Default Variant Library ────────────────────────────────────

const _variants = new Map<string, PromptVariant>();

// Pre-built variants for common task patterns
const DEFAULT_VARIANTS: PromptVariant[] = [
  {
    id: "concise-cot",
    template: `Think step-by-step, then give a concise answer.\n\nTask: {{task}}\n\nContext:\n{{context}}\n\nAnswer:`,
    description: "Concise chain-of-thought for simple tasks",
    targetTasks: ["simple", "classification", "extraction"],
    stats: { uses: 0, successes: 0, failures: 0, avgTokens: 0, avgLatencyMs: 0, successRate: 0.5 },
  },
  {
    id: "structured-plan",
    template: `You are a {{role}} working on {{task}}.\n\n## Instructions\n1. Analyze the requirements carefully\n2. Create a step-by-step plan\n3. Execute each step\n4. Verify your output\n\n## Context\n{{context}}\n\n## Constraints\n- Only use verified information from the context\n- If uncertain, say "I need more context"\n- Verify each claim against provided data\n\n## Your Response:`,
    description: "Structured plan-then-execute for complex tasks",
    targetTasks: ["complex", "coding", "analysis", "generation"],
    stats: { uses: 0, successes: 0, failures: 0, avgTokens: 0, avgLatencyMs: 0, successRate: 0.5 },
  },
  {
    id: "grounded-rag",
    template: `Answer the question using ONLY the information in the provided sources.\nIf the sources don't contain the answer, say "The provided sources don't contain this information."\n\nSources:\n{{context}}\n\nQuestion: {{task}}\n\nAnswer (cite source numbers):`,
    description: "Grounded RAG response with forced attribution",
    targetTasks: ["rag", "question-answering", "research"],
    stats: { uses: 0, successes: 0, failures: 0, avgTokens: 0, avgLatencyMs: 0, successRate: 0.5 },
  },
  {
    id: "code-generation",
    template: `You are an expert {{role}} developer.\n\n## Task\n{{task}}\n\n## Technical Context\n{{context}}\n\n## Requirements\n1. Write clean, production-quality code\n2. Add error handling for edge cases\n3. Include brief inline comments\n4. Follow the existing project patterns\n\n## Output Format\nProvide the complete code with no explanations outside of code comments.`,
    description: "Focused code generation with quality constraints",
    targetTasks: ["coding", "implementation", "refactoring"],
    stats: { uses: 0, successes: 0, failures: 0, avgTokens: 0, avgLatencyMs: 0, successRate: 0.5 },
  },
  {
    id: "meta-prompt",
    template: `Before answering, first determine the best approach:\n\n1. What type of task is this? (analysis/generation/transformation/classification)\n2. What reasoning strategy fits best? (deductive/inductive/analogical/critical)\n3. What could go wrong? (edge cases/ambiguities/missing info)\n\nTask: {{task}}\nContext: {{context}}\n\nNow execute with your chosen strategy:`,
    description: "Meta-prompting: reason about the reasoning strategy first",
    targetTasks: ["complex", "analysis", "ambiguous"],
    stats: { uses: 0, successes: 0, failures: 0, avgTokens: 0, avgLatencyMs: 0, successRate: 0.5 },
  },
];

// Initialize defaults
for (const v of DEFAULT_VARIANTS) {
  _variants.set(v.id, { ...v, stats: { ...v.stats } });
}

// ─── Variant Selection ──────────────────────────────────────────

/**
 * Select the best prompt variant for a given task.
 *
 * Uses Thompson Sampling (Bayesian bandit) approach:
 * - High success rate → more likely to be selected
 * - Low-use variants get exploration bonus
 * - Task type matching further filters candidates
 */
export function selectVariant(
  taskType: string,
  context: string,
  task: string,
  role = "AI assistant",
): PromptOptimizationResult {
  // Filter candidates by task type
  const candidates = Array.from(_variants.values()).filter(
    v => v.targetTasks.includes(taskType) || v.targetTasks.includes("complex"),
  );

  if (candidates.length === 0) {
    // Fall back to structured-plan
    const fallback = _variants.get("structured-plan") ?? DEFAULT_VARIANTS[1];
    return assembleVariant(fallback, { task, context, role }, "fallback");
  }

  // Thompson Sampling: sample from Beta(successes+1, failures+1)
  let bestScore = -1;
  let bestVariant = candidates[0];

  for (const v of candidates) {
    const alpha = v.stats.successes + 1;
    const beta = v.stats.failures + 1;
    // Simplified Thompson sample: mean + exploration bonus for low-use
    const explorationBonus = v.stats.uses < 5 ? 0.2 : 0;
    const score = alpha / (alpha + beta) + explorationBonus + Math.random() * 0.1;
    if (score > bestScore) {
      bestScore = score;
      bestVariant = v;
    }
  }

  return assembleVariant(bestVariant, { task, context, role }, "thompson-sampling");
}

function assembleVariant(
  variant: PromptVariant,
  vars: Record<string, string>,
  reason: string,
): PromptOptimizationResult {
  let prompt = variant.template;
  for (const [key, val] of Object.entries(vars)) {
    prompt = prompt.replaceAll(`{{${key}}}`, val);
  }

  // Estimate tokens (4 chars per token)
  const estimatedTokens = Math.ceil(prompt.length / 4);

  return {
    variantId: variant.id,
    prompt,
    estimatedTokens,
    reason: `Selected "${variant.id}" via ${reason} (success rate: ${(variant.stats.successRate * 100).toFixed(0)}%, uses: ${variant.stats.uses})`,
  };
}

// ─── Feedback Loop ──────────────────────────────────────────────

/**
 * Record the outcome of a prompt variant execution.
 * This updates the variant's stats for future selection.
 */
export function recordOutcome(
  variantId: string,
  outcome: {
    success: boolean;
    tokens: number;
    latencyMs: number;
  },
): void {
  const variant = _variants.get(variantId);
  if (!variant) { return; }

  variant.stats.uses++;
  if (outcome.success) {
    variant.stats.successes++;
  } else {
    variant.stats.failures++;
  }

  // Running average for tokens and latency
  const n = variant.stats.uses;
  variant.stats.avgTokens = ((variant.stats.avgTokens * (n - 1)) + outcome.tokens) / n;
  variant.stats.avgLatencyMs = ((variant.stats.avgLatencyMs * (n - 1)) + outcome.latencyMs) / n;

  // Bayesian-smoothed success rate (Laplace smoothing)
  variant.stats.successRate = (variant.stats.successes + 1) / (variant.stats.uses + 2);
}

// ─── Custom Variant Registration ────────────────────────────────

/**
 * Register a custom prompt variant at runtime.
 * Used by the self-improvement engine to add discovered templates.
 */
export function registerVariant(variant: PromptVariant): void {
  _variants.set(variant.id, {
    ...variant,
    stats: { ...variant.stats },
  });
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getVariantStats(): Array<{
  id: string;
  description: string;
  stats: VariantStats;
}> {
  return Array.from(_variants.values()).map(v => ({
    id: v.id,
    description: v.description,
    stats: { ...v.stats },
  }));
}

export function resetVariantStats(): void {
  for (const v of _variants.values()) {
    v.stats = { uses: 0, successes: 0, failures: 0, avgTokens: 0, avgLatencyMs: 0, successRate: 0.5 };
  }
}
