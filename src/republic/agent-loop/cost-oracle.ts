/**
 * Cost Oracle — Real-Time Cost Tracking + Budget Enforcement
 *
 * Tracks actual inference costs per provider/model in real-time during
 * an agent session. Enforces configurable budget caps and recommends
 * provider switches when accumulation is too fast.
 *
 * Features:
 *   - Per-token cost tracking by provider and model
 *   - Running total with budget enforcement
 *   - Cost velocity monitoring ($/minute)
 *   - Automatic provider downgrade recommendations
 *   - Session cost summary for transparency
 *
 * This is the "financial controller" of the agent loop. No Manus-class
 * system has real-time cost enforcement with automatic downgrade logic.
 */

import type { AgentProvider } from "../agent-providers/index.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const _logger = createSubsystemLogger("cost-oracle");

// ─── Types ──────────────────────────────────────────────────────

export interface CostEntry {
  provider: AgentProvider;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  timestamp: number;
}

export interface CostSnapshot {
  /** Total cost in USD so far */
  totalUsd: number;
  /** Cost per provider */
  byProvider: Record<string, number>;
  /** Cost velocity: USD per minute */
  velocityUsdPerMin: number;
  /** Projected total cost at current velocity */
  projectedTotalUsd: number;
  /** Whether budget is exceeded */
  budgetExceeded: boolean;
  /** Budget percentage consumed */
  budgetPct: number;
  /** Recommended action */
  action: "continue" | "warn" | "downgrade" | "stop";
  /** Message for broadcaster */
  message: string | null;
}

// ─── Pricing Table (per million tokens, input/output) ───────────

interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

const PRICING: Record<string, ModelPricing> = {
  // Anthropic
  "claude-sonnet-4-20250514": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "claude-3-5-sonnet": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "claude-3-opus": { inputPer1M: 15.0, outputPer1M: 75.0 },
  "claude-3-haiku": { inputPer1M: 0.25, outputPer1M: 1.25 },
  // OpenAI
  "gpt-4.1": { inputPer1M: 2.0, outputPer1M: 8.0 },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10.0 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "o3-pro": { inputPer1M: 20.0, outputPer1M: 80.0 },
  "o3-mini": { inputPer1M: 1.1, outputPer1M: 4.4 },
  // Gemini
  "gemini-2.5-pro": { inputPer1M: 1.25, outputPer1M: 10.0 },
  "gemini-2.0-flash": { inputPer1M: 0.1, outputPer1M: 0.4 },
  "gemini-2.5-flash": { inputPer1M: 0.15, outputPer1M: 0.6 },
  // DeepSeek
  "deepseek-chat": { inputPer1M: 0.27, outputPer1M: 1.1 },
  "deepseek-reasoner": { inputPer1M: 0.55, outputPer1M: 2.19 },
  // Groq
  "llama-3.3-70b": { inputPer1M: 0.59, outputPer1M: 0.79 },
  "llama-4-scout": { inputPer1M: 0.11, outputPer1M: 0.34 },
  // Local
  ollama: { inputPer1M: 0, outputPer1M: 0 },
  lmstudio: { inputPer1M: 0, outputPer1M: 0 },
};

/** Fallback pricing by provider when exact model isn't in the table */
const PROVIDER_FALLBACK_PRICING: Record<string, ModelPricing> = {
  anthropic: { inputPer1M: 3.0, outputPer1M: 15.0 },
  openai: { inputPer1M: 2.5, outputPer1M: 10.0 },
  gemini: { inputPer1M: 0.15, outputPer1M: 0.6 },
  deepseek: { inputPer1M: 0.27, outputPer1M: 1.1 },
  groq: { inputPer1M: 0.05, outputPer1M: 0.1 },
  openrouter: { inputPer1M: 2.0, outputPer1M: 8.0 },
  nvidia: { inputPer1M: 1.0, outputPer1M: 4.0 },
  ollama: { inputPer1M: 0, outputPer1M: 0 },
  lmstudio: { inputPer1M: 0, outputPer1M: 0 },
};

// ─── Default Budget ─────────────────────────────────────────────

const DEFAULT_BUDGET_USD = 2.0; // $2 per session — generous but bounded

// ─── Cost Oracle ────────────────────────────────────────────────

export class CostOracle {
  private entries: CostEntry[] = [];
  private budgetUsd: number;
  private sessionStartMs: number;
  private lastWarningAt = 0;

  constructor(budgetUsd?: number) {
    this.budgetUsd = budgetUsd ?? DEFAULT_BUDGET_USD;
    this.sessionStartMs = Date.now();
  }

  /** Record a cost entry from one LLM call */
  record(
    provider: AgentProvider,
    modelId: string,
    inputTokens: number,
    outputTokens: number,
  ): CostEntry {
    const pricing = this.resolvePricing(provider, modelId);
    const costUsd =
      (inputTokens / 1_000_000) * pricing.inputPer1M +
      (outputTokens / 1_000_000) * pricing.outputPer1M;

    const entry: CostEntry = {
      provider,
      modelId,
      inputTokens,
      outputTokens,
      costUsd,
      timestamp: Date.now(),
    };

    this.entries.push(entry);
    return entry;
  }

  /** Get current cost snapshot with budget analysis */
  snapshot(): CostSnapshot {
    const totalUsd = this.entries.reduce((s, e) => s + e.costUsd, 0);
    const byProvider: Record<string, number> = {};
    for (const e of this.entries) {
      byProvider[e.provider] = (byProvider[e.provider] ?? 0) + e.costUsd;
    }

    // Velocity: cost per minute
    const elapsedMin = Math.max(0.5, (Date.now() - this.sessionStartMs) / 60_000);
    const velocityUsdPerMin = totalUsd / elapsedMin;

    // Project using last 3 entries' rate
    const recent = this.entries.slice(-3);
    const recentCost = recent.reduce((s, e) => s + e.costUsd, 0);
    const recentTime =
      recent.length >= 2
        ? (recent[recent.length - 1].timestamp - recent[0].timestamp) / 60_000
        : elapsedMin / this.entries.length;
    const recentVelocity = recentTime > 0 ? recentCost / recentTime : velocityUsdPerMin;

    // Estimate remaining time: 5 min average session
    const projectedTotalUsd = totalUsd + recentVelocity * 5;

    const budgetPct = this.budgetUsd > 0 ? (totalUsd / this.budgetUsd) * 100 : 0;
    const budgetExceeded = totalUsd >= this.budgetUsd;

    // Determine action
    let action: CostSnapshot["action"] = "continue";
    let message: string | null = null;
    const now = Date.now();

    if (budgetExceeded) {
      action = "stop";
      message = `🛑 **Budget exceeded**: $${totalUsd.toFixed(3)} / $${this.budgetUsd.toFixed(2)} — wrapping up.`;
    } else if (budgetPct >= 80) {
      action = "downgrade";
      if (now - this.lastWarningAt > 30_000) {
        this.lastWarningAt = now;
        message = `⚠️ **Budget warning**: $${totalUsd.toFixed(3)} / $${this.budgetUsd.toFixed(2)} (${Math.round(budgetPct)}%) — switching to cheaper model recommended.`;
      }
    } else if (budgetPct >= 50 && recentVelocity > this.budgetUsd / 10) {
      action = "warn";
      if (now - this.lastWarningAt > 60_000) {
        this.lastWarningAt = now;
        message = `💰 Cost: $${totalUsd.toFixed(3)} (${Math.round(budgetPct)}% of budget), velocity $${velocityUsdPerMin.toFixed(3)}/min`;
      }
    }

    return {
      totalUsd,
      byProvider,
      velocityUsdPerMin,
      projectedTotalUsd,
      budgetExceeded,
      budgetPct,
      action,
      message,
    };
  }

  /** Get a cheaper provider recommendation */
  recommendDowngrade(currentProvider: AgentProvider): {
    provider: string;
    estimatedSaving: string;
  } | null {
    const currentPricing = PROVIDER_FALLBACK_PRICING[currentProvider];
    if (!currentPricing) {
      return null;
    }

    const cheaperOptions = Object.entries(PROVIDER_FALLBACK_PRICING)
      .filter(
        ([p, pricing]) =>
          p !== currentProvider &&
          pricing.inputPer1M + pricing.outputPer1M <
            currentPricing.inputPer1M + currentPricing.outputPer1M &&
          pricing.inputPer1M > 0, // skip free (local)
      )
      .toSorted((a, b) => a[1].inputPer1M - b[1].inputPer1M);

    if (cheaperOptions.length === 0) {
      return null;
    }

    const [provider, pricing] = cheaperOptions[0];
    const currentTotal = currentPricing.inputPer1M + currentPricing.outputPer1M;
    const cheaperTotal = pricing.inputPer1M + pricing.outputPer1M;
    const savingPct = Math.round(((currentTotal - cheaperTotal) / currentTotal) * 100);

    return {
      provider,
      estimatedSaving: `~${savingPct}% cheaper`,
    };
  }

  /** Generate a session cost summary */
  summary(): string {
    const total = this.entries.reduce((s, e) => s + e.costUsd, 0);
    const byProvider: Record<string, { cost: number; tokens: number }> = {};

    for (const e of this.entries) {
      const existing = byProvider[e.provider] ?? { cost: 0, tokens: 0 };
      existing.cost += e.costUsd;
      existing.tokens += e.inputTokens + e.outputTokens;
      byProvider[e.provider] = existing;
    }

    const parts = [`Session cost: $${total.toFixed(4)}`];
    for (const [provider, data] of Object.entries(byProvider)) {
      parts.push(
        `  ${provider}: $${data.cost.toFixed(4)} (${data.tokens.toLocaleString()} tokens)`,
      );
    }
    parts.push(
      `Budget used: ${Math.round((total / this.budgetUsd) * 100)}% of $${this.budgetUsd.toFixed(2)}`,
    );

    return parts.join("\n");
  }

  private resolvePricing(provider: AgentProvider, modelId: string): ModelPricing {
    // Try exact model match first
    const exact = PRICING[modelId];
    if (exact) {
      return exact;
    }

    // Try partial model match
    for (const [key, pricing] of Object.entries(PRICING)) {
      if (modelId.includes(key) || key.includes(modelId)) {
        return pricing;
      }
    }

    // Fall back to provider default
    return PROVIDER_FALLBACK_PRICING[provider] ?? { inputPer1M: 1.0, outputPer1M: 4.0 };
  }

  get totalCost(): number {
    return this.entries.reduce((s, e) => s + e.costUsd, 0);
  }

  get entryCount(): number {
    return this.entries.length;
  }
}
