/**
 * Republic Platform — Counterfactual Reasoning Engine
 *
 * Implements the CoIn (Counterfactual Inference) pattern from 2025 research.
 *
 * Citizens generate "what if I had done X instead" scenarios during reflection
 * cycles. Counterfactual outcomes are stored as hypothetical memories and used
 * by the planning module to steer future decisions.
 *
 * The CoIn process:
 *   1. Identify the decision point (action taken + alternatives not taken)
 *   2. Iterative reasoning: simulate each alternative path forward
 *   3. Backtrack to the best alternative outcome
 *   4. Extract the "lesson delta" — what the citizen should do differently
 *   5. Store as `CounterfactualMemory` in the citizen's sovereign memory
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import { ts, uid } from "../../republic/utils.js";

const logger = createSubsystemLogger("republic:counterfactual");

// ─── Types ─────────────────────────────────────────────────────────

export interface DecisionPoint {
  id: string;
  citizenId: string;
  /** What was actually done */
  actualAction: string;
  /** Outcome of the actual action (0 = bad, 1 = great) */
  actualOutcome: number;
  /** Alternative actions not taken */
  alternatives: string[];
  /** Context at the time of decision */
  context: string;
  timestamp: string;
}

export interface CounterfactualScenario {
  alternativeAction: string;
  /** Simulated outcome (estimated) */
  estimatedOutcome: number;
  /** Reasoning chain for this alternative */
  reasoning: string;
  /** Delta vs actual outcome (positive = would have been better) */
  outcomeDelta: number;
}

export interface CounterfactualMemory {
  id: string;
  citizenId: string;
  decisionPointId: string;
  actualAction: string;
  actualOutcome: number;
  bestAlternative: CounterfactualScenario | null;
  lessonDelta: string;
  /** Should this lesson be applied in future similar contexts? */
  actionable: boolean;
  context: string;
  timestamp: string;
  /** Simulation tick when this memory was recorded — used for decay weighting */
  tick?: number;
}

// ─── Store ─────────────────────────────────────────────────────────

const counterfactualStore = new Map<string, CounterfactualMemory[]>();
const MAX_PER_CITIZEN = 30;

// ─── Outcome Estimator ─────────────────────────────────────────────

/**
 * Heuristic outcome estimator for an alternative action given context.
 *
 * In production: replace with an LLM call using the 5-step metacognitive
 * prompt template to simulate the counterfactual chain.
 *
 * Here we use a deterministic heuristic based on learned lessons.
 */
function estimateAlternativeOutcome(
  alternative: string,
  context: string,
  lessons: string[],
): { estimated: number; reasoning: string } {
  const alt = alternative.toLowerCase();
  const ctx = context.toLowerCase();

  let score = 0.5; // Neutral baseline
  const reasons: string[] = [];

  // Domain-specific heuristics
  if (alt.includes("research") || alt.includes("analyse")) {
    score += 0.15;
    reasons.push("Research-first approaches tend to yield better outcomes");
  }
  if (alt.includes("collaborate") || alt.includes("partner")) {
    score += 0.1;
    reasons.push("Collaboration reduces failure risk");
  }
  if (alt.includes("rush") || alt.includes("skip")) {
    score -= 0.2;
    reasons.push("Shortcuts historically produce poor quality");
  }
  if (alt.includes("test") || alt.includes("verify")) {
    score += 0.12;
    reasons.push("Verification steps prevent downstream failures");
  }

  // Check if any stored lessons apply
  for (const lesson of lessons) {
    if (lesson.toLowerCase().includes(alt.substring(0, 10))) {
      score += 0.05;
      reasons.push(`Lesson alignment: "${lesson.substring(0, 50)}..."`);
    }
  }

  // Context pressure: high-stakes context makes alternatives riskier
  if (ctx.includes("critical") || ctx.includes("deadline")) {
    score = Math.max(0.3, score - 0.1);
    reasons.push("High-stakes context reduces alternative outcome confidence");
  }

  return {
    estimated: parseFloat(Math.max(0, Math.min(1, score)).toFixed(3)),
    reasoning: reasons.join("; ") || "Neutral heuristic estimate applied",
  };
}

// ─── Main Counterfactual Engine ────────────────────────────────────

/**
 * Run counterfactual inference on a completed decision point.
 *
 * @param decision   The decision that was actually made
 * @param lessons    Retrieved lessons from citizen's long-term memory
 * @returns          Stored CounterfactualMemory
 */
export function runCounterfactualInference(
  decision: DecisionPoint,
  lessons: string[] = [],
): CounterfactualMemory {
  const scenarios: CounterfactualScenario[] = [];

  // Evaluate each alternative (CoIn iterative simulation)
  for (const alternative of decision.alternatives) {
    const { estimated, reasoning } = estimateAlternativeOutcome(
      alternative,
      decision.context,
      lessons,
    );

    scenarios.push({
      alternativeAction: alternative,
      estimatedOutcome: estimated,
      reasoning,
      outcomeDelta: parseFloat((estimated - decision.actualOutcome).toFixed(3)),
    });
  }

  // Find best alternative
  const bestAlternative =
    scenarios.length > 0
      ? scenarios.reduce((best, s) => (s.estimatedOutcome > best.estimatedOutcome ? s : best))
      : null;

  // Generate lesson delta
  let lessonDelta: string;
  const actionable = bestAlternative !== null && bestAlternative.outcomeDelta > 0.1;

  if (!bestAlternative) {
    lessonDelta = `No alternatives were available to evaluate for: "${decision.actualAction}"`;
  } else if (bestAlternative.outcomeDelta <= 0) {
    lessonDelta = `The chosen action "${decision.actualAction}" was already optimal (or near-optimal) for this context.`;
  } else if (bestAlternative.outcomeDelta > 0.1) {
    lessonDelta =
      `In "${decision.context}", "${bestAlternative.alternativeAction}" would have yielded ` +
      `${(bestAlternative.outcomeDelta * 100).toFixed(0)}% better outcome than "${decision.actualAction}". ` +
      `Reason: ${bestAlternative.reasoning}`;
  } else {
    lessonDelta = `Marginal improvement possible via "${bestAlternative.alternativeAction}" (Δ=${bestAlternative.outcomeDelta}).`;
  }

  const memory: CounterfactualMemory = {
    id: `cf-${uid()}`,
    citizenId: decision.citizenId,
    decisionPointId: decision.id,
    actualAction: decision.actualAction,
    actualOutcome: decision.actualOutcome,
    bestAlternative,
    lessonDelta,
    actionable,
    context: decision.context,
    timestamp: ts(),
  };

  // Store
  const existing = counterfactualStore.get(decision.citizenId) ?? [];
  existing.unshift(memory);
  if (existing.length > MAX_PER_CITIZEN) {
    existing.length = MAX_PER_CITIZEN;
  }
  counterfactualStore.set(decision.citizenId, existing);

  if (actionable) {
    logger.debug(
      `Citizen ${decision.citizenId}: actionable counterfactual — ` +
        `"${bestAlternative?.alternativeAction}" would have improved outcome by ${((bestAlternative?.outcomeDelta ?? 0) * 100).toFixed(0)}%`,
    );
  }

  return memory;
}

// ─── Query API ─────────────────────────────────────────────────────

export function getCounterfactualHistory(citizenId: string, limit = 10): CounterfactualMemory[] {
  return (counterfactualStore.get(citizenId) ?? []).slice(0, limit);
}

/**
 * Retrieve actionable lessons from a citizen's counterfactual history.
 * Recent lessons are weighted higher via exponential decay: weight = 1 / (1 + ageTicks / 1000).
 * This ensures stale lessons from hundreds of ticks ago don't dominate decision-making.
 */
export function getActionableLessons(
  citizenId: string,
  limit = 5,
  currentTick = 0,
): string[] {
  const memories = counterfactualStore.get(citizenId) ?? [];
  return memories
    .filter((m) => m.actionable)
    .map((m) => {
      const ageTicks = currentTick > 0 && m.tick !== undefined ? currentTick - m.tick : 0;
      const weight = 1 / (1 + ageTicks / 1000);
      return { lesson: m.lessonDelta, weight };
    })
    .toSorted((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((x) => x.lesson);
}

/**
 * Build a short counterfactual lesson suffix for injection into a citizen's LLM system prompt.
 *
 * Format:
 *   ## Lessons From Your Experience
 *   - In "X context", doing Y would have yielded 30% better outcome than Z. Reason: ...
 *   - The chosen action "A" was already optimal for context "B".
 *
 * Returns an empty string if the citizen has no actionable lessons.
 */
export function buildCounterfactualPromptSuffix(
  citizenId: string,
  currentTick = 0,
  limit = 3,
): string {
  const lessons = getActionableLessons(citizenId, limit, currentTick);
  if (lessons.length === 0) {
    return "";
  }
  const lines = lessons.map((l) => `- ${l}`).join("\n");
  return `## 🧠 Lessons From Your Experience\nThese are lessons you have personally learned from past decisions. Apply them:\n${lines}`;
}

/**
 * Record a new decision point for future counterfactual analysis.
 */
export function recordDecisionPoint(
  decision: Omit<DecisionPoint, "id" | "timestamp">,
): DecisionPoint {
  return {
    id: `dp-${uid()}`,
    timestamp: ts(),
    ...decision,
  };
}

export function getCounterfactualStats(): {
  totalDecisions: number;
  actionableRate: number;
  avgOutcomeDelta: number;
} {
  let total = 0;
  let actionable = 0;
  let totalDelta = 0;

  for (const memories of counterfactualStore.values()) {
    for (const m of memories) {
      total++;
      if (m.actionable) {
        actionable++;
        totalDelta += m.bestAlternative?.outcomeDelta ?? 0;
      }
    }
  }

  return {
    totalDecisions: total,
    actionableRate: total > 0 ? parseFloat((actionable / total).toFixed(3)) : 0,
    avgOutcomeDelta: actionable > 0 ? parseFloat((totalDelta / actionable).toFixed(3)) : 0,
  };
}
