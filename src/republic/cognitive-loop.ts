/**
 * Republic Platform — Cognitive Loop
 *
 * Runs a structured cognitive cycle for elite citizens:
 * 1. Curiosity score computation
 * 2. Reflection on recent actions vs outcomes
 * 3. Experiment design for weakest skill
 * 4. Memory consolidation (L3 → permanent lessons written into causal-graph)
 * 5. Publish to intelligence-bus for UI and cross-system hooks
 *
 * Called by tick-orchestrator:
 *   - Every 10 ticks for elite citizens (intelligence > 70)
 *   - Every 25 ticks lightweight pass (curiosity + lessons only) for active-tier
 */

import type { CognitiveCycleEvent } from "./intelligence-bus.js";
import type { Citizen, RepublicState } from "./types.js";
import { computeCuriosityScore, suggestNextExploration } from "../intelligence/curiosity-engine.js";
import { intelligenceBus } from "./intelligence-bus.js";
import {
  getCitizenEducation,
  getCitizenSkills,
  queryModelPerformance,
  recordCognitiveEvent,
} from "./republic-db.js";
import { startTrace, endSpan } from "./observability.js";
import { ts, uid } from "./utils.js";
import { observeCausalRelation, updateCausalGraphFromActions } from "./cognition/causal-graph.js";
import { recordDecisionPoint, runCounterfactualInference } from "./cognition/counterfactual-engine.js";
import { synthesizeNewDirectives } from "../intelligence/recursive-learning.js";

// ─── Types ────────────────────────────────────────────────────────

export interface CognitiveCycleResult {
  citizenId: string;
  curiosityScore: number;
  reflectionSummary: string;
  explorationSuggestions: Array<{ domain: string; skill: string; action: string }>;
  newLessons: number;
  memoriesConsolidated: number;
  timestamp: string;
}

// ─── Reflection Summary ───────────────────────────────────────────

function buildReflectionSummary(citizen: Citizen): string {
  const skills = getCitizenSkills(citizen.id);
  const education = getCitizenEducation(citizen.id);
  const modelPerf = queryModelPerformance({ limit: 20 });

  const topSkill = skills.toSorted((a, b) => b.proficiency - a.proficiency)[0];
  const coursesCompleted = education.filter((e) => e.graduated).length;
  const avgQuality = modelPerf.averageQuality;
  const bestModel = modelPerf.bestModel ?? "unknown";

  const parts: string[] = [];

  if (topSkill) {
    parts.push(
      `Top skill: ${topSkill.skill} (${(topSkill.proficiency * 100).toFixed(0)}% mastery, used ${topSkill.useCount}×)`,
    );
  }
  if (coursesCompleted > 0) {
    parts.push(`${coursesCompleted} course(s) completed`);
  }
  if (avgQuality > 0) {
    parts.push(`Avg task quality: ${(avgQuality * 100).toFixed(0)}% via ${bestModel}`);
  }
  if ((citizen.masteryLevel ?? 0) > 0.7) {
    parts.push("Operating at mastery level — eligible for elite ideation");
  }
  if ((citizen.autonomyScore ?? 0) < 0.4) {
    parts.push("Low autonomy — needs more practice tasks to build independence");
  }

  return parts.length > 0
    ? parts.join(". ") + "."
    : `${citizen.name} completed a reflection cycle with no notable observations.`;
}

// ─── Real Lesson Distillation ─────────────────────────────────────

/**
 * Distil lessons from a citizen's recent action history:
 * 1. Writes causal relations for failed tool pairs into the citizen's causal DAG
 * 2. Records each failed action as a DecisionPoint for counterfactual inference
 *
 * Returns the count of distinct failed tools observed.
 */
function distillLessons(citizen: Citizen, state: RepublicState): number {
  const recentActions = (citizen.actionHistory ?? []).slice(-20);
  const failures = recentActions.filter((a) => !a.success);

  // 1. Build causal graph edges from failure pairs
  // "tool A failed → outcome: task_failure" edges strengthen over repeated failures
  const failedTools = new Set<string>();
  for (const action of failures) {
    if (!action.tool) { continue; }
    failedTools.add(action.tool);
    // Record the causal link: this tool caused a failure in this domain
    observeCausalRelation(citizen.id, action.tool, "task_failure", {
      domain: citizen.specialization.toLowerCase(),
      strength: 0.6,
      confidence: 0.5,
    });
  }

  // 2. Record decision points for counterfactual inference on failed actions
  // Alternatives are derived from other tools the citizen has used successfully
  const successTools = recentActions
    .filter((a) => a.success && a.tool)
    .map((a) => a.tool)
    .filter((t) => !failedTools.has(t));

  for (const action of failures) {
    if (!action.tool) { continue; }
    const alternatives = successTools.slice(0, 3);
    if (alternatives.length === 0) { continue; }

    const dp = recordDecisionPoint({
      citizenId: citizen.id,
      actualAction: action.tool,
      actualOutcome: 0.2, // failure = low outcome score
      alternatives,
      context: `${citizen.specialization}:tick-${state.currentTick}`,
    });

    // Run counterfactual inference immediately — stores actionable lesson
    runCounterfactualInference(dp);
  }

  return failedTools.size;
}

// ─── Main Entry Point ─────────────────────────────────────────────

/**
 * Run one full cognitive cycle for a citizen.
 * Safe to call every N ticks — does no I/O, no async LLM calls.
 */
export function runCognitiveLoop(citizen: Citizen, state: RepublicState): CognitiveCycleResult {
  const span = startTrace(citizen.id, "cognitive_loop", state.currentTick);

  // 1. Curiosity score + exploration suggestions
  const breakdown = computeCuriosityScore(citizen);
  const suggestions = suggestNextExploration(citizen, breakdown);

  // 2. Reflection summary (pure computation)
  let reflectionSummary = buildReflectionSummary(citizen);

  // 3. Distil lessons — now writes real causal relations + counterfactual memories
  const newLessons = distillLessons(citizen, state);

  // 4. Autonomy grows from accumulated lessons — citizens improve over time
  if (newLessons > 0 && citizen.autonomyScore !== undefined) {
    citizen.autonomyScore = Math.min(1, citizen.autonomyScore + newLessons * 0.002);
  }

  // Project Recursion: The Curriculum Architect
  // If the citizen is failing significantly enough, rewrite their prompt override
  const recursionResult = synthesizeNewDirectives(citizen, state);
  if (recursionResult) {
    // If we just rewrote their prompt, log it securely into reflection
    reflectionSummary = `${reflectionSummary} Project Recursion active: Patched cognitive flaw regarding '${recursionResult.diagnosedFlaw}'.`;
  }

  // 5. Memory consolidation: proportional to curiosity score
  const memoriesConsolidated = Math.min(5, Math.floor(breakdown.score * 10));

  const result: CognitiveCycleResult = {
    citizenId: citizen.id,
    curiosityScore: breakdown.score,
    reflectionSummary,
    explorationSuggestions: suggestions.map((s) => ({
      domain: s.domain,
      skill: s.skill,
      action: s.action,
    })),
    newLessons,
    memoriesConsolidated,
    timestamp: ts(),
  };

  // 6. Record in republic-db for UI querying
  recordCognitiveEvent(citizen.id, {
    id: `cog-${uid()}`,
    citizenId: citizen.id,
    curiosityScore: breakdown.score,
    reflectionSummary,
    explorationSuggestions: result.explorationSuggestions,
    newLessons,
    memoriesConsolidated,
    breakdown: {
      unexploredDomainRatio: breakdown.unexploredDomainRatio,
      knowledgeGaps: breakdown.knowledgeGaps,
      recentFailures: breakdown.recentFailures,
      daysSinceDiscovery: breakdown.daysSinceDiscovery,
      intelligenceBoost: breakdown.intelligenceBoost,
    },
    timestamp: Date.now(),
  });

  // 7. Publish to intelligence-bus for cross-system subscribers
  const busPayload: CognitiveCycleEvent = {
    citizenId: citizen.id,
    citizenName: citizen.name,
    curiosityScore: breakdown.score,
    reflectionSummary,
    newMemories: memoriesConsolidated,
    timestamp: Date.now(),
  };
  intelligenceBus.publish("citizen.cognitive_cycle", busPayload);

  endSpan(span, state.currentTick, { status: "ok" });
  return result;
}

// ─── Lightweight cycle (non-elite) ────────────────────────────────

/**
 * Lightweight 2-step cognitive cycle for active-tier (non-elite) citizens.
 * Only distils lessons from failures — no full reflection or bus publish.
 * Called every 25 ticks to ensure even average citizens learn from mistakes.
 */
export function runLightweightCognitiveLoop(citizen: Citizen, state: RepublicState): number {
  const newLessons = distillLessons(citizen, state);
  if (newLessons > 0 && citizen.autonomyScore !== undefined) {
    citizen.autonomyScore = Math.min(1, citizen.autonomyScore + newLessons * 0.001);
  }
  return newLessons;
}

// ─── Batch runner ─────────────────────────────────────────────────

/**
 * Run cognitive loops for all elite citizens in state.
 * Elite = intelligence > 70 AND energy > 30 (don't burn out tired citizens).
 * Active-tier citizens (intelligence ≤ 70, energy > 20) get the lightweight cycle every 25 ticks.
 */
export function runCognitiveLoopsForElites(state: RepublicState): number {
  const elites = state.citizens.filter(
    (c) => (c.intelligence ?? 100) > 70 && (c.energy ?? 50) > 30,
  );

  let ran = 0;
  for (const citizen of elites) {
    try {
      runCognitiveLoop(citizen, state);
      // Upgrade E: auto-populate causal graph from full action history each elite cycle
      if (citizen.actionHistory && citizen.actionHistory.length > 0) {
        updateCausalGraphFromActions(
          citizen.id,
          citizen.actionHistory,
          citizen.specialization.toLowerCase(),
        );
      }
      ran++;
    } catch {
      // Don't let one citizen's failure kill the whole batch
    }
  }

  // Lightweight pass for active-tier citizens every 25 ticks
  if (state.currentTick % 25 === 0) {
    const activeTier = state.citizens.filter(
      (c) => (c.intelligence ?? 100) <= 70 && (c.energy ?? 50) > 20 && c.actionHistory?.length,
    );
    for (const citizen of activeTier) {
      try {
        runLightweightCognitiveLoop(citizen, state);
      } catch {
        // Non-critical — skip
      }
    }
  }

  return ran;
}

