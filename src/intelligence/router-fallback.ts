/**
 * Router Fallback — Deterministic Fallback Protocol (2026)
 *
 * Defines the full fallback ladder for every complexity tier.
 * When a model fails validation, this module determines what to try next.
 *
 * Protocol:
 *   1. Retry same model (max 2x, for transient errors)
 *   2. Advance to next fallback model in chain
 *   3. Escalate to max-capability model
 *   4. Return partial result with explicit gap markers
 *
 * Fallback ladders are defined per complexity tier (0–1 score):
 *   - Simple   [0–0.3]: cheap+fast models
 *   - Medium   [0.3–0.6]: balanced models
 *   - High     [0.6–0.8]: frontier models
 *   - Maximum  [0.8–1.0]: top-tier only
 */

import type { ThinkLevel } from "../agents/context-engineer.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ModelAssignment {
  provider: string;
  modelId: string;
  thinkLevel: ThinkLevel;
  maxTokens?: number;
  temperature?: number;
}

export interface FallbackStep {
  assignment: ModelAssignment;
  /** How many retries to allow on this model before advancing */
  maxRetries: number;
  /** Whether this step should be used only as an escalation target */
  escalationOnly: boolean;
}

export interface FallbackChain {
  tier: ComplexityTier;
  primary: ModelAssignment;
  /** Fallback steps in priority order */
  fallbacks: FallbackStep[];
  /** Maximum total attempts across all fallbacks */
  maxTotalAttempts: number;
}

export type ComplexityTier = "simple" | "medium" | "high" | "maximum";

export interface FallbackDecision {
  action: "retry" | "next_fallback" | "escalate" | "partial";
  nextAssignment?: ModelAssignment;
  retryCount: number;
  reason: string;
}

// ── Fallback Ladders ──────────────────────────────────────────────────────────

// Max capability escalation target used across all tiers
const ESCALATION_TARGET: ModelAssignment = {
  provider: "anthropic",
  modelId: "claude-opus-4-6",
  thinkLevel: "high",
  maxTokens: 16000,
};

// ── Local Model Assignments (Tier 1 — free inference) ─────────────────────
// These are the first-try entries in simple/medium ladders.
// At runtime, resolveLocalAssignment() picks the actual running model.

const LOCAL_LMSTUDIO: ModelAssignment = {
  provider: "lmstudio",
  modelId: "local-lmstudio-default",
  thinkLevel: "off",
  temperature: 0.7,
};

const LOCAL_OLLAMA: ModelAssignment = {
  provider: "ollama",
  modelId: "local-ollama-default",
  thinkLevel: "off",
  temperature: 0.7,
};

const LADDERS: Record<ComplexityTier, FallbackChain> = {
  /**
   * Simple [0–0.3]: Light factual, short conversational
   * Primary: Gemini 3.1 Flash Lite (fastest, cheapest)
   * Falls back through progressively capable models
   */
  simple: {
    tier: "simple",
    primary: {
      provider: "google",
      modelId: "gemini-3.1-flash-lite",
      thinkLevel: "off",
      temperature: 0.7,
    },
    fallbacks: [
      // ── Local-first: try free local inference before cloud ──
      {
        assignment: LOCAL_LMSTUDIO,
        maxRetries: 1,
        escalationOnly: false,
      },
      {
        assignment: LOCAL_OLLAMA,
        maxRetries: 1,
        escalationOnly: false,
      },
      {
        assignment: {
          provider: "openai",
          modelId: "gpt-5.2-instant",
          thinkLevel: "off",
        },
        maxRetries: 2,
        escalationOnly: false,
      },
      {
        assignment: {
          provider: "google",
          modelId: "gemini-3-flash",
          thinkLevel: "minimal",
        },
        maxRetries: 1,
        escalationOnly: false,
      },
      {
        assignment: {
          provider: "anthropic",
          modelId: "claude-haiku-4-6",
          thinkLevel: "low",
        },
        maxRetries: 1,
        escalationOnly: false,
      },
      {
        assignment: ESCALATION_TARGET,
        maxRetries: 1,
        escalationOnly: true,
      },
    ],
    maxTotalAttempts: 6,
  },

  /**
   * Medium [0.3–0.6]: Reasoning + coding + multi-step
   * Primary: Gemini 3 Flash (best balance of speed + quality)
   */
  medium: {
    tier: "medium",
    primary: {
      provider: "google",
      modelId: "gemini-3-flash",
      thinkLevel: "medium",
    },
    fallbacks: [
      // ── Local-first: try free local inference before cloud ──
      {
        assignment: LOCAL_LMSTUDIO,
        maxRetries: 1,
        escalationOnly: false,
      },
      {
        assignment: {
          provider: "openai",
          modelId: "gpt-5.2",
          thinkLevel: "medium",
        },
        maxRetries: 2,
        escalationOnly: false,
      },
      {
        assignment: {
          provider: "anthropic",
          modelId: "claude-sonnet-4-6",
          thinkLevel: "medium",
        },
        maxRetries: 1,
        escalationOnly: false,
      },
      {
        assignment: {
          provider: "google",
          modelId: "gemini-3.1-pro",
          thinkLevel: "high",
        },
        maxRetries: 1,
        escalationOnly: false,
      },
      {
        assignment: ESCALATION_TARGET,
        maxRetries: 1,
        escalationOnly: true,
      },
    ],
    maxTotalAttempts: 8,
  },

  /**
   * High [0.6–0.8]: Complex analysis, architecture, long-form
   * Primary: GPT-5.2 with high reasoning effort
   */
  high: {
    tier: "high",
    primary: {
      provider: "openai",
      modelId: "gpt-5.2",
      thinkLevel: "high",
    },
    fallbacks: [
      {
        assignment: {
          provider: "anthropic",
          modelId: "claude-sonnet-4-6",
          thinkLevel: "high",
        },
        maxRetries: 2,
        escalationOnly: false,
      },
      {
        assignment: {
          provider: "google",
          modelId: "gemini-3.1-pro",
          thinkLevel: "high",
        },
        maxRetries: 1,
        escalationOnly: false,
      },
      {
        assignment: ESCALATION_TARGET,
        maxRetries: 2,
        escalationOnly: false,
      },
    ],
    maxTotalAttempts: 7,
  },

  /**
   * Maximum [0.8–1.0]: PhD-level reasoning, complex multi-system
   * Primary: Claude Opus 4.6 (max effort, highest capability)
   */
  maximum: {
    tier: "maximum",
    primary: ESCALATION_TARGET,
    fallbacks: [
      {
        assignment: {
          provider: "openai",
          modelId: "gpt-5.4",
          thinkLevel: "high",
        },
        maxRetries: 2,
        escalationOnly: false,
      },
      {
        assignment: {
          provider: "google",
          modelId: "gemini-3-pro",
          thinkLevel: "high",
        },
        maxRetries: 1,
        escalationOnly: false,
      },
      {
        // Final escalation: retry Opus with max effort
        assignment: {
          provider: "anthropic",
          modelId: "claude-opus-4-6",
          thinkLevel: "xhigh",
        },
        maxRetries: 1,
        escalationOnly: true,
      },
    ],
    maxTotalAttempts: 6,
  },
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Map a complexity score (0–1) to a tier.
 */
export function resolveComplexityTier(complexityScore: number): ComplexityTier {
  if (complexityScore < 0.3) {
    return "simple";
  }
  if (complexityScore < 0.6) {
    return "medium";
  }
  if (complexityScore < 0.8) {
    return "high";
  }
  return "maximum";
}

/**
 * Get the full fallback chain for a given complexity score.
 * An optional list of providers to exclude can be provided.
 */
export function getFallbackChain(
  complexityScore: number,
  excludeProviders?: string[],
): FallbackChain {
  const tier = resolveComplexityTier(complexityScore);
  const chain = LADDERS[tier];

  if (!excludeProviders || excludeProviders.length === 0) {
    return chain;
  }

  return filterFallbackChain(chain, excludeProviders);
}

/**
 * Filter a fallback chain to remove specific providers.
 * If the primary assignment is excluded, it promotes the first valid fallback.
 */
export function filterFallbackChain(chain: FallbackChain, excludeProviders: string[]): FallbackChain {
  const fallbacks = chain.fallbacks.filter(
    (f) => !excludeProviders.includes(f.assignment.provider)
  );

  let primary = chain.primary;
  if (excludeProviders.includes(primary.provider)) {
    // Promote the first available non-escalation fallback to primary
    const idx = fallbacks.findIndex((f) => !f.escalationOnly);
    if (idx >= 0) {
      primary = fallbacks[idx].assignment;
      fallbacks.splice(idx, 1);
    } else if (fallbacks.length > 0) {
      // If only escalations are left, promote the first one
      primary = fallbacks[0].assignment;
      fallbacks.splice(0, 1);
    } else {
      // If we filtered out literally everything, just use local fallback as a safety
      primary = LOCAL_LMSTUDIO;
    }
  }

  return {
    ...chain,
    primary,
    fallbacks,
    // Adjust maxTotalAttempts in case we removed steps, but don't drop below 1
    maxTotalAttempts: Math.min(chain.maxTotalAttempts, fallbacks.length + 1),
  };
}

/**
 * Decide what to do next after a model call fails validation.
 *
 * @param chain - The fallback chain for this chunk
 * @param attemptNumber - 0-based attempt index (0 = first primary attempt)
 * @param sameModelRetryCount - How many times we've retried the current model
 * @param recommendedAction - The validator's recommendation
 */
export function decideFallback(params: {
  chain: FallbackChain;
  attemptNumber: number;
  sameModelRetryCount: number;
  recommendedAction: "retry" | "fallback" | "escalate" | "partial";
}): FallbackDecision {
  const { chain, attemptNumber, sameModelRetryCount, recommendedAction } = params;

  if (attemptNumber >= chain.maxTotalAttempts) {
    return {
      action: "partial",
      retryCount: sameModelRetryCount,
      reason: "Exhausted all fallback attempts. Returning partial result.",
    };
  }

  // If validator recommends a retry and we haven't exceeded retries on this model
  if (recommendedAction === "retry" && sameModelRetryCount < 2) {
    const currentAssignment = getFallbackStepAssignment(chain, attemptNumber - 1);
    return {
      action: "retry",
      nextAssignment: currentAssignment,
      retryCount: sameModelRetryCount + 1,
      reason: "Validator recommended retry — retrying same model.",
    };
  }

  // Determine next fallback position
  // attemptNumber 0 = primary, 1+ = fallback index (fallback[0] is attempt 1, etc.)
  const fallbackIndex = attemptNumber; // After primary (attempt 0 failed), try fallback[0]
  const fallbacks = chain.fallbacks.filter((f) => !f.escalationOnly);
  const escalations = chain.fallbacks.filter((f) => f.escalationOnly);

  if (recommendedAction === "escalate" || sameModelRetryCount >= 2) {
    // Jump to escalation target
    const escalation = escalations[0];
    if (escalation) {
      return {
        action: "escalate",
        nextAssignment: escalation.assignment,
        retryCount: 0,
        reason: `Escalating to ${escalation.assignment.modelId} after ${sameModelRetryCount} retries.`,
      };
    }
  }

  // Advance to next fallback in chain
  if (fallbackIndex < fallbacks.length) {
    const next = fallbacks[fallbackIndex];
    return {
      action: "next_fallback",
      nextAssignment: next.assignment,
      retryCount: 0,
      reason: `Advancing to fallback ${fallbackIndex + 1}: ${next.assignment.modelId}.`,
    };
  }

  // No more fallbacks — escalate or partial
  const finalEscalation = escalations[0];
  if (finalEscalation && attemptNumber < chain.maxTotalAttempts - 1) {
    return {
      action: "escalate",
      nextAssignment: finalEscalation.assignment,
      retryCount: 0,
      reason: "Exhausted regular fallbacks. Escalating.",
    };
  }

  return {
    action: "partial",
    retryCount: sameModelRetryCount,
    reason: "All fallbacks exhausted. Returning partial result.",
  };
}

/** Retrieve the model assignment for a specific attempt number in a chain */
function getFallbackStepAssignment(chain: FallbackChain, attemptIndex: number): ModelAssignment {
  if (attemptIndex <= 0) {
    return chain.primary;
  }
  const fallbacks = chain.fallbacks.filter((f) => !f.escalationOnly);
  const idx = attemptIndex - 1;
  return fallbacks[idx]?.assignment ?? chain.primary;
}

/**
 * Get a human-readable description of the fallback chain for logging.
 */
export function describeFallbackChain(complexityScore: number, excludeProviders?: string[]): string {
  const chain = getFallbackChain(complexityScore, excludeProviders);
  const steps = [chain.primary, ...chain.fallbacks.map((f) => f.assignment)];
  const stepDesc = steps
    .map(
      (s, i) =>
        `${i === 0 ? "primary" : `fallback${i}`}: ${s.provider}/${s.modelId} (think=${s.thinkLevel})`,
    )
    .join(" → ");
  return `[${chain.tier.toUpperCase()}] ${stepDesc}`;
}
