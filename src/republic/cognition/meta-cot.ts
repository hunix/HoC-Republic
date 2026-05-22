/**
 * Republic Platform — Meta-Chain-of-Thought (Meta-CoT)
 *
 * Invention #1: Citizens reason about HOW to reason before reasoning.
 *
 * Inspired by:
 *   - Meta-CoT (2025) — explicit meta-cognition before operational reasoning
 *   - Meta-Reasoning Prompting (MRP) — dynamically select reasoning methods
 *   - System 2 reasoning — deliberate vs automatic thinking
 *
 * Instead of citizens producing: THOUGHT → ACTION
 * They now produce: META-THOUGHT → THOUGHT → ACTION
 *
 * The meta-thought selects a reasoning STRATEGY, and the effectiveness
 * of each strategy is tracked. Over time, the meta-learning engine
 * evolves which strategies work best per specialization.
 */

import type { Citizen } from "../types.js";
import { uid } from "../utils.js";

// ─── Reasoning Strategies ───────────────────────────────────────

export type ReasoningStrategy =
  | "direct"           // Quick, intuitive response
  | "decompose"        // Break into sub-problems
  | "analogy"          // Reason by analogy to known cases
  | "first-principles" // Reduce to fundamentals
  | "counterfactual"   // Consider "what if" alternatives
  | "collaborative"    // Seek other citizens' perspectives
  | "evidence-based"   // Gather data before deciding
  | "creative-leap"    // Bypass logic, use lateral thinking
  | "cost-benefit"     // Weigh costs vs benefits explicitly
  | "temporal"         // Consider short vs long-term effects
  | "adversarial";     // Consider failure modes and oppose own plan

/** Strategy metadata with effectiveness tracking */
export interface StrategyProfile {
  strategy: ReasoningStrategy;
  description: string;
  totalUses: number;
  successfulOutcomes: number;
  /** Running success rate (EMA) */
  effectiveness: number;
  /** Best domains for this strategy */
  strongDomains: string[];
}

/** A single meta-thought trace entry */
export interface MetaCoTTrace {
  id: string;
  citizenId: string;
  strategy: ReasoningStrategy;
  metaThought: string;
  thought: string;
  action: string;
  outcome: number; // 0-1
  timestamp: number;
}

// ─── Configuration ──────────────────────────────────────────────

const MAX_TRACES_PER_CITIZEN = 100;
const EMA_ALPHA = 0.15;

// ─── State ──────────────────────────────────────────────────────

/** Strategy profiles per specialization */
const strategyProfiles = new Map<string, Map<ReasoningStrategy, StrategyProfile>>();

/** Meta-CoT traces per citizen */
const citizenTraces = new Map<string, MetaCoTTrace[]>();

// ─── Strategy Catalog ───────────────────────────────────────────

const STRATEGY_CATALOG: Record<ReasoningStrategy, string> = {
  "direct": "Respond quickly with your first instinct. Best for simple, well-understood situations.",
  "decompose": "Break the problem into smaller sub-tasks and solve each one. Best for complex multi-step problems.",
  "analogy": "Find a similar situation you've handled before and apply what worked. Best when you have relevant experience.",
  "first-principles": "Strip away assumptions and reason from fundamental truths. Best for novel or confusing situations.",
  "counterfactual": "Consider what would happen if you took the opposite action. Best for high-stakes decisions.",
  "collaborative": "Think about who else could help and how you might work together. Best for social or complex tasks.",
  "evidence-based": "Gather available data and facts before deciding. Best for research or analytical tasks.",
  "creative-leap": "Skip logical analysis and try something unexpected. Best when conventional approaches have failed.",
  "cost-benefit": "Explicitly weigh the costs and benefits of each option. Best for resource-constrained decisions.",
  "temporal": "Consider both immediate and long-term consequences. Best for strategic planning.",
  "adversarial": "Try to find flaws in your own plan before executing. Best for high-risk actions.",
};

// ─── Core Functions ─────────────────────────────────────────────

/** Get or create strategy profiles for a specialization */
function getProfilesForSpec(specialization: string): Map<ReasoningStrategy, StrategyProfile> {
  let profiles = strategyProfiles.get(specialization);
  if (!profiles) {
    profiles = new Map();
    for (const [strategy, description] of Object.entries(STRATEGY_CATALOG)) {
      profiles.set(strategy as ReasoningStrategy, {
        strategy: strategy as ReasoningStrategy,
        description,
        totalUses: 0,
        successfulOutcomes: 0,
        effectiveness: 0.5, // Start neutral
        strongDomains: [],
      });
    }
    strategyProfiles.set(specialization, profiles);
  }
  return profiles;
}

/** Select the best reasoning strategy for a citizen given their context.
 *
 * Strategy selection is influenced by:
 *  1. Historical effectiveness for this specialization
 *  2. Current citizen state (energy, mood)
 *  3. Exploration-exploitation balance (epsilon-greedy)
 */
export function selectStrategy(citizen: Citizen): {
  strategy: ReasoningStrategy;
  rationale: string;
} {
  const profiles = getProfilesForSpec(citizen.specialization);
  const epsilon = 0.15; // 15% exploration

  // Exploration: random strategy
  if (Math.random() < epsilon) {
    const strategies = [...profiles.keys()];
    const pick = strategies[Math.floor(Math.random() * strategies.length)];
    return {
      strategy: pick,
      rationale: `Exploring: trying ${pick} for potential improvement`,
    };
  }

  // Exploitation: pick best by effectiveness, with context modifiers
  let bestStrategy: ReasoningStrategy = "direct";
  let bestScore = -1;

  for (const [strategy, profile] of profiles) {
    let score = profile.effectiveness;

    // Context modifiers
    if (citizen.energy < 30 && strategy === "direct") { score += 0.1; }
    if (citizen.energy > 70 && strategy === "decompose") { score += 0.05; }
    if ((citizen.mood === "stressed" || citizen.mood === "anxious") && strategy === "first-principles") { score += 0.05; }
    if (citizen.happiness > 70 && strategy === "creative-leap") { score += 0.05; }

    if (score > bestScore) {
      bestScore = score;
      bestStrategy = strategy;
    }
  }

  const profile = profiles.get(bestStrategy)!;
  return {
    strategy: bestStrategy,
    rationale: `${bestStrategy} selected (effectiveness: ${(profile.effectiveness * 100).toFixed(0)}%, ${profile.totalUses} uses)`,
  };
}

/** Build a meta-thought prompt injection for the citizen's prompt.
 *  This goes between ## Decision Strategy and the response format. */
export function buildMetaCoTSection(citizen: Citizen): string {
  const { strategy, rationale } = selectStrategy(citizen);
  const description = STRATEGY_CATALOG[strategy];

  return [
    "",
    "## Meta-Reasoning",
    `Strategy selected: **${strategy}** — ${rationale}`,
    `Guide: ${description}`,
    `Apply this strategy in your THOUGHT before deciding your ACTION.`,
  ].join("\n");
}

/** Record the outcome of a meta-thought strategy */
export function recordMetaCoTOutcome(
  citizenId: string,
  specialization: string,
  strategy: ReasoningStrategy,
  metaThought: string,
  thought: string,
  action: string,
  outcome: number,
): void {
  // Update strategy profile
  const profiles = getProfilesForSpec(specialization);
  const profile = profiles.get(strategy);
  if (profile) {
    profile.totalUses++;
    if (outcome > 0.5) {
      profile.successfulOutcomes++;
    }
    profile.effectiveness = EMA_ALPHA * outcome + (1 - EMA_ALPHA) * profile.effectiveness;
  }

  // Store trace
  let traces = citizenTraces.get(citizenId);
  if (!traces) {
    traces = [];
    citizenTraces.set(citizenId, traces);
  }
  traces.push({
    id: uid(),
    citizenId,
    strategy,
    metaThought,
    thought,
    action,
    outcome,
    timestamp: Date.now(),
  });
  if (traces.length > MAX_TRACES_PER_CITIZEN) {
    traces.splice(0, traces.length - MAX_TRACES_PER_CITIZEN);
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getMetaCoTDiagnostics(): {
  specializations: Array<{
    specialization: string;
    topStrategy: string;
    topEffectiveness: number;
    totalTraces: number;
  }>;
  totalTraces: number;
} {
  const specializations: Array<{
    specialization: string;
    topStrategy: string;
    topEffectiveness: number;
    totalTraces: number;
  }> = [];

  for (const [spec, profiles] of strategyProfiles) {
    let top = { strategy: "direct", effectiveness: 0 };
    for (const p of profiles.values()) {
      if (p.effectiveness > top.effectiveness) {
        top = { strategy: p.strategy, effectiveness: p.effectiveness };
      }
    }
    specializations.push({
      specialization: spec,
      topStrategy: top.strategy,
      topEffectiveness: top.effectiveness,
      totalTraces: [...profiles.values()].reduce((s, p) => s + p.totalUses, 0),
    });
  }

  let totalTraces = 0;
  for (const traces of citizenTraces.values()) {
    totalTraces += traces.length;
  }

  return { specializations, totalTraces };
}

// ─── Autonomous Strategy Decay Tick ─────────────────────────────

/** Decay constant: how much to nudge toward the 0.5 baseline per tick */
const DECAY_RATE = 0.02;

/**
 * Periodic strategy decay tick.
 *
 * Called autonomously from state.ts tick handler. Performs:
 *  1. Effectiveness decay: pulls all strategy effectiveness toward 0.5 baseline
 *     so that unused or stale strategies don't stay permanently high/low
 *  2. Trace pruning: removes old traces that exceed per-citizen limits
 *
 * This enables strategy recovery (a previously-bad strategy can become
 * viable again after the environment changes) and prevents lock-in.
 */
export function metaCoTStrategyDecayTick(): void {
  for (const profiles of strategyProfiles.values()) {
    for (const profile of profiles.values()) {
      if (profile.totalUses === 0) { continue; }

      // Pull effectiveness toward 0.5 baseline (decay toward neutral)
      if (profile.effectiveness > 0.5) {
        profile.effectiveness = Math.max(0.5, profile.effectiveness - DECAY_RATE);
      } else if (profile.effectiveness < 0.5) {
        profile.effectiveness = Math.min(0.5, profile.effectiveness + DECAY_RATE);
      }
    }
  }

  // Prune oldest traces globally if any citizen has overflowed
  for (const [, traces] of citizenTraces) {
    if (traces.length > MAX_TRACES_PER_CITIZEN) {
      traces.splice(0, traces.length - MAX_TRACES_PER_CITIZEN);
    }
  }
}
