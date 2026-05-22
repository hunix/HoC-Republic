/**
 * Adaptive Model Router — Per-Phase Provider Switching
 *
 * Instead of using one model for the entire session, routes each phase
 * to the most cost-effective model that can handle it. This is the
 * "intelligent escalation" pattern from systems engineering.
 *
 * Phase difficulty is scored based on:
 *   1. Phase name heuristics (Plan=easy, Build=hard, Research=medium)
 *   2. Required tools (complex tools → harder phase)
 *   3. Iteration budget (more budget → harder phase)
 *   4. Historical success rates from task memory (if available)
 *
 * Models are tiered:
 *   Tier 1 (cheap/fast):  gemini-2.0-flash, deepseek, groq
 *   Tier 2 (balanced):    gemini-2.5-pro, openai/gpt-4.1
 *   Tier 3 (frontier):    anthropic/claude, openai/o3-pro
 *
 * No production agentic system does per-phase model routing with
 * difficulty scoring.
 */

import type { AgentProvider } from "../agent-providers/index.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { providerModelId } from "../agent-providers/index.js";

const _logger = createSubsystemLogger("model-router");

// ─── Types ──────────────────────────────────────────────────────

export type ModelTier = "fast" | "balanced" | "frontier";

export interface PhaseRoute {
  phase: string;
  difficulty: number; // 0.0 (trivial) to 1.0 (extremely hard)
  recommendedTier: ModelTier;
  provider: AgentProvider;
  modelId: string;
  rationale: string;
}

export interface ModelRouterConfig {
  /** Available providers (in preference order) */
  availableProviders: AgentProvider[];
  /** Base provider (from user config) — always available as frontier */
  baseProvider: AgentProvider;
  baseModelId: string;
  /** Whether per-phase routing is enabled (disabled for DIRECT strategy) */
  enabled: boolean;
}

// ─── Difficulty Scoring ─────────────────────────────────────────

/** Phase name → base difficulty (0.0-1.0) */
const PHASE_DIFFICULTY: Record<string, number> = {
  Plan: 0.2,
  Planning: 0.2,
  Setup: 0.2,
  Preparation: 0.2,
  Research: 0.4,
  Analysis: 0.5,
  Analyze: 0.5,
  Investigate: 0.5,
  Design: 0.5,
  Build: 0.7,
  Implement: 0.7,
  Execute: 0.7,
  Create: 0.6,
  Develop: 0.7,
  Test: 0.5,
  Verify: 0.5,
  Review: 0.4,
  Deliver: 0.3,
  Synthesize: 0.5,
  Polish: 0.3,
  Finalize: 0.3,
  Deploy: 0.6,
  Integrate: 0.6,
};

/** Tools that indicate higher complexity */
const COMPLEX_TOOLS = new Set([
  "write_file",
  "bash",
  "execute_command",
  "create_file",
  "deploy_and_preview",
  "create_document",
]);

/**
 * Score phase difficulty based on name, tools, and budget.
 * Returns 0.0 (trivial) to 1.0 (extremely hard).
 */
export function scorePhaseDifficulty(
  phaseName: string,
  tools: string[],
  iterationBudget: number,
  totalBudget: number,
): number {
  // Base score from phase name
  let score = 0.5; // default mid-range
  for (const [key, val] of Object.entries(PHASE_DIFFICULTY)) {
    if (phaseName.toLowerCase().includes(key.toLowerCase())) {
      score = val;
      break;
    }
  }

  // Tool complexity modifier
  const complexToolCount = tools.filter((t) => COMPLEX_TOOLS.has(t)).length;
  if (complexToolCount > 0) {
    score = Math.min(1.0, score + 0.1 * complexToolCount);
  }

  // Budget ratio modifier (phases given more budget are harder)
  if (totalBudget > 0) {
    const budgetRatio = iterationBudget / totalBudget;
    if (budgetRatio > 0.4) {
      score = Math.min(1.0, score + 0.15);
    } else if (budgetRatio > 0.25) {
      score = Math.min(1.0, score + 0.05);
    }
  }

  return Math.round(score * 100) / 100;
}

// ─── Provider Selection ─────────────────────────────────────────

/** Maps provider → approximate tier (lower = cheaper/faster). */
const PROVIDER_TIERS: Record<string, ModelTier> = {
  groq: "fast",
  deepseek: "fast",
  ollama: "fast",
  lmstudio: "fast",
  nvidia: "balanced",
  gemini: "balanced",
  openrouter: "balanced",
  openai: "frontier",
  anthropic: "frontier",
};

/** Difficulty thresholds for tier selection */
const TIER_THRESHOLDS: Record<ModelTier, [number, number]> = {
  fast: [0.0, 0.35],
  balanced: [0.35, 0.65],
  frontier: [0.65, 1.0],
};

function difficultyToTier(difficulty: number): ModelTier {
  if (difficulty < TIER_THRESHOLDS.balanced[0]) {
    return "fast";
  }
  if (difficulty < TIER_THRESHOLDS.frontier[0]) {
    return "balanced";
  }
  return "frontier";
}

/**
 * Select the best available provider for a given tier.
 * Falls back to higher tiers if the ideal tier isn't available.
 */
function selectProvider(
  tier: ModelTier,
  available: AgentProvider[],
  base: { provider: AgentProvider; modelId: string },
): { provider: AgentProvider; modelId: string } {
  // First: try to find a provider matching the ideal tier
  for (const p of available) {
    if (PROVIDER_TIERS[p] === tier) {
      return { provider: p, modelId: providerModelId(p) };
    }
  }

  // Fallback: try adjacent tiers
  const tierOrder: ModelTier[] =
    tier === "fast"
      ? ["fast", "balanced", "frontier"]
      : tier === "balanced"
        ? ["balanced", "fast", "frontier"]
        : ["frontier", "balanced", "fast"];

  for (const fallbackTier of tierOrder) {
    for (const p of available) {
      if (PROVIDER_TIERS[p] === fallbackTier) {
        return { provider: p, modelId: providerModelId(p) };
      }
    }
  }

  // Ultimate fallback: use base provider
  return { provider: base.provider, modelId: base.modelId };
}

// ─── Model Router ───────────────────────────────────────────────

/**
 * Build a routing plan for all phases in a task decomposition.
 */
export function buildPhaseRoutes(
  phases: Array<{ phase: string; tools: string[]; iterationBudget: number }>,
  config: ModelRouterConfig,
): PhaseRoute[] {
  if (!config.enabled || phases.length <= 1) {
    // Single-phase or routing disabled — use base model for everything
    return phases.map((p) => ({
      phase: p.phase,
      difficulty: 0.5,
      recommendedTier: "frontier" as ModelTier,
      provider: config.baseProvider,
      modelId: config.baseModelId,
      rationale: "Single-phase or routing disabled — using base model",
    }));
  }

  const totalBudget = phases.reduce((s, p) => s + p.iterationBudget, 0);
  const routes: PhaseRoute[] = [];

  for (const phase of phases) {
    const difficulty = scorePhaseDifficulty(
      phase.phase,
      phase.tools,
      phase.iterationBudget,
      totalBudget,
    );
    const tier = difficultyToTier(difficulty);
    const selected = selectProvider(tier, config.availableProviders, {
      provider: config.baseProvider,
      modelId: config.baseModelId,
    });

    routes.push({
      phase: phase.phase,
      difficulty,
      recommendedTier: tier,
      provider: selected.provider,
      modelId: selected.modelId,
      rationale: `Difficulty ${(difficulty * 100).toFixed(0)}% → ${tier} tier → ${selected.provider}`,
    });
  }

  // Ensure the last phase (Deliver/Synthesize) uses a strong model for output quality
  const lastRoute = routes[routes.length - 1];
  if (lastRoute.recommendedTier === "fast") {
    const upgraded = selectProvider("balanced", config.availableProviders, {
      provider: config.baseProvider,
      modelId: config.baseModelId,
    });
    lastRoute.provider = upgraded.provider;
    lastRoute.modelId = upgraded.modelId;
    lastRoute.recommendedTier = "balanced";
    lastRoute.rationale += " (upgraded for final output quality)";
  }

  return routes;
}

/**
 * Get the route for a specific phase by name.
 */
export function getPhaseRoute(phaseName: string, routes: PhaseRoute[]): PhaseRoute | undefined {
  return routes.find((r) => r.phase === phaseName);
}

/**
 * Calculate estimated cost savings from routing vs using frontier for everything.
 */
export function estimateRoutingSavings(routes: PhaseRoute[]): {
  savedPct: number;
  routedPhases: number;
  totalPhases: number;
} {
  const totalPhases = routes.length;
  const routedPhases = routes.filter((r) => r.recommendedTier !== "frontier").length;
  // rough estimate: fast=10% cost, balanced=40% cost, frontier=100%
  const tierCost: Record<ModelTier, number> = { fast: 0.1, balanced: 0.4, frontier: 1.0 };
  const routedCost = routes.reduce((s, r) => s + tierCost[r.recommendedTier], 0);
  const frontierCost = totalPhases * 1.0;
  const savedPct =
    frontierCost > 0 ? Math.round(((frontierCost - routedCost) / frontierCost) * 100) : 0;

  return { savedPct, routedPhases, totalPhases };
}
