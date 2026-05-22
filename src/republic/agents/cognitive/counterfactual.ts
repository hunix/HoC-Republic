/**
 * counterfactual.ts — Counterfactual Simulator
 *
 * Based on:
 *   - AXIS: Counterfactual explanations for multi-agent behavior (arXiv 2025)
 *   - Chimera: Neuro-symbolic-causal architecture for robust agents (arXiv 2025)
 *   - "Executable counterfactuals" for LLM causal reasoning evaluation
 *
 * Before committing to an action, the citizen mentally simulates
 * 3 alternative actions and selects the one with highest expected value.
 *
 * This is the cognitive equivalent of the prefrontal cortex "mental time travel"
 * — imagining futures before choosing a path.
 *
 * The counterfactual space is constructed from:
 *   - The citizen's current somatic markers (approach/avoid signals)
 *   - Their working memory (active goals and plans)
 *   - Their world model (exploitative vs exploratory mode)
 *   - Their epistemic state (what they're confident about)
 *
 * Each simulated scenario is scored on:
 *   - Energy delta (sustainable? draining?)
 *   - Credits delta (economically sensible?)
 *   - Social impact (affects relationships?)
 *   - Goal progress (advances stated goals?)
 *   - Risk level (epistemic uncertainty of outcome)
 *
 * References:
 *   - AXIS: arXiv 2025
 *   - Chimera: LLM strategist + symbolic constraint engine + causal inference
 *   - MIT: "Population-scale LLM simulations for policy counterfactuals"
 */

import type { Citizen } from "../../types.js";

// ─── Counterfactual Scenario ──────────────────────────────────────────────────

export interface CounterfactualScenario {
  label: string;             // short description of the action
  estimatedEnergyCost: number;   // 0 = free, 100 = exhausting
  estimatedCreditDelta: number;  // negative = spending, positive = earning
  socialImpact: "positive" | "neutral" | "negative" | "unknown";
  goalAlignment: number;     // 0–1: how much does this advance active goals?
  riskLevel: number;         // 0–1: epistemic risk
  expectedValueScore: number; // weighted sum
  rationale: string;         // 1-line reasoning
}

// ─── Scenario Library ─────────────────────────────────────────────────────────

/**
 * Generate 3 candidate counterfactual scenarios for a citizen at this tick.
 * Scenarios are derived from citizen state, cognitive mode, and active goals.
 *
 * This is a structured prompt scaffold — the LLM fleshes out the reasoning
 * inside the COUNTERFACTUAL field of its response.
 */
export function generateCounterfactualSpace(
  citizen: Citizen,
  activeGoal: string,
  cognitiveMode: "exploratory" | "exploitative" | "calibrating",
): CounterfactualScenario[] {
  const energy = citizen.energy ?? 50;
  const _credits = citizen.credits ?? 0;
  const happiness = citizen.happiness ?? 50;

  // Scenario A: Direct execution (do what the world model predicts)
  const scenarioA: CounterfactualScenario = {
    label: "Direct execution of current plan",
    estimatedEnergyCost: 25,
    estimatedCreditDelta: cognitiveMode === "exploitative" ? 15 : 5,
    socialImpact: "neutral",
    goalAlignment: 0.7,
    riskLevel: cognitiveMode === "exploitative" ? 0.2 : 0.5,
    expectedValueScore: 0,  // computed below
    rationale: "Proceed with established pattern; low risk, moderate reward",
  };

  // Scenario B: Collaborative / social pivot
  const scenarioB: CounterfactualScenario = {
    label: "Collaborate with a peer citizen on the goal",
    estimatedEnergyCost: 20,
    estimatedCreditDelta: 10,
    socialImpact: "positive",
    goalAlignment: 0.6,
    riskLevel: 0.3,
    expectedValueScore: 0,
    rationale: "Shared load reduces risk; social capital +; slower solo progress",
  };

  // Scenario C: Exploratory / novel approach
  const scenarioC: CounterfactualScenario = {
    label: cognitiveMode === "exploratory"
      ? "Abandon current plan; explore a fundamentally new approach"
      : "Defer action; invest in reflection and model calibration",
    estimatedEnergyCost: cognitiveMode === "exploratory" ? 40 : 10,
    estimatedCreditDelta: cognitiveMode === "exploratory" ? -20 : 0,
    socialImpact: "unknown",
    goalAlignment: cognitiveMode === "exploratory" ? 0.3 : 0.5,
    riskLevel: cognitiveMode === "exploratory" ? 0.8 : 0.15,
    expectedValueScore: 0,
    rationale: cognitiveMode === "exploratory"
      ? "World model unreliable; radical exploration may reveal better path"
      : "High energy cost; reflection before action preserves optionality",
  };

  // Score each scenario
  function score(s: CounterfactualScenario): number {
    const energyPenalty  = s.estimatedEnergyCost / 100;
    const creditBonus    = Math.max(-1, Math.min(1, s.estimatedCreditDelta / 50));
    const socialBonus    = s.socialImpact === "positive" ? 0.15 :
                           s.socialImpact === "negative" ? -0.25 : 0;
    const riskPenalty    = s.riskLevel * 0.20;
    const goalBonus      = s.goalAlignment * 0.35;

    // Low-energy citizens should heavily penalize energy-intensive options
    const energyFeasibility = energy < 30 ? energyPenalty * 2 : energyPenalty;

    // Happiness affects risk tolerance (low happiness → risk aversion)
    const riskTolerance = happiness > 60 ? 1.0 : 0.7;

    return goalBonus + creditBonus * 0.2 + socialBonus - energyFeasibility * 0.25 - riskPenalty * riskTolerance;
  }

  scenarioA.expectedValueScore = score(scenarioA);
  scenarioB.expectedValueScore = score(scenarioB);
  scenarioC.expectedValueScore = score(scenarioC);

  return [scenarioA, scenarioB, scenarioC];
}

// ─── Prompt Section ───────────────────────────────────────────────────────────

/**
 * Assembles the counterfactual space section for the LLM prompt.
 * Injected in the middle of the cognitive chain — AFTER somatic markers (gut feelings)
 * but BEFORE the THOUGHT field (deliberate reasoning).
 *
 * The citizen uses these scaffolded options to structure their deliberation,
 * and should select + justify one in the THOUGHT field.
 */
export function assembleCounterfactualSection(
  citizen: Citizen,
  currentGoal: string,
  mode: "exploratory" | "exploitative" | "calibrating",
): string {
  const scenarios = generateCounterfactualSpace(citizen, currentGoal, mode);

  const [a, b, c] = scenarios;
  if (!a || !b || !c) { return ""; }

  const ranked = [...scenarios].toSorted((x, y) => y.expectedValueScore - x.expectedValueScore);
  const best = ranked[0]!;

  const format = (s: CounterfactualScenario, idx: number): string => {
    const letter = ["A", "B", "C"][idx]!;
    const isBest = s.label === best.label ? " ← BEST" : "";
    return [
      `Option ${letter}${isBest}: ${s.label}`,
      `  Energy: -${s.estimatedEnergyCost} | Credits: ${s.estimatedCreditDelta >= 0 ? "+" : ""}${s.estimatedCreditDelta} | Social: ${s.socialImpact} | Risk: ${(s.riskLevel * 100).toFixed(0)}%`,
      `  Goal alignment: ${(s.goalAlignment * 100).toFixed(0)}% | Expected value: ${s.expectedValueScore.toFixed(2)}`,
      `  Rationale: ${s.rationale}`,
    ].join("\n");
  };

  return [
    `Active goal: "${currentGoal}"`,
    format(a, 0),
    format(b, 1),
    format(c, 2),
    `→ Lean toward Option ${ranked[0]!.label.split(" ")[0]![0]}. Override with your reasoning if context differs.`,
  ].join("\n");
}
