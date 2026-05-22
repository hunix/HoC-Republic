/**
 * index.ts — Cognitive Module Barrel
 *
 * Single entry point for all 8 cognitive pillar modules.
 * Exports the master assembly function `assembleCognitiveLayers` which
 * produces all prompt sections from a citizen's cognitive state.
 *
 * Also exports the `updateCognitiveLayers` function for post-action
 * model updates (prediction error, somatic marker formation, WM decay).
 */

export * from "./active-inference.js";
export * from "./working-memory.js";
export * from "./somatic-markers.js";
export * from "./reflection-engine.js";
export * from "./epistemic-state.js";
export * from "./counterfactual.js";
export * from "./theory-of-mind.js";
export * from "./constitution.js";

import type { Citizen } from "../../types.js";
import type { PromptSection } from "../prompt-builder.js";

import { assembleActiveInferenceSection, updateWorldModel } from "./active-inference.js";
import { assembleWorkingMemorySection, wmDecayTick } from "./working-memory.js";
import { assembleSomaticSection, recordOutcome } from "./somatic-markers.js";
import { assembleReflectionSection } from "./reflection-engine.js";
import { assembleEpistemicSection } from "./epistemic-state.js";
import { assembleCounterfactualSection } from "./counterfactual.js";
import { assembleTheoryOfMindSection } from "./theory-of-mind.js";
import { assembleConstitutionalSection } from "./constitution.js";

// ─── Master Assembly ──────────────────────────────────────────────────────────

export interface CognitiveLayerOptions {
  currentTick: number;
  activeGoal?: string;
  plannedContext?: string;
}

/**
 * Produces all 8 cognitive prompt sections for a citizen.
 * Returns an ordered array of PromptSection objects, ready to be fed
 * into `assembleBudgetedPrompt`.
 */
export function assembleCognitiveLayers(
  citizen: Citizen,
  opts: CognitiveLayerOptions,
): PromptSection[] {
  const { currentTick, activeGoal = citizen.activity ?? "contribute to the Republic", plannedContext = activeGoal } = opts;

  // Get the cognitive mode from world model (needed for counterfactual + somatic)
  const { wm } = updateWorldModel(citizen, currentTick);
  const cognitiveMode = wm?.mode ?? "calibrating";

  return [
    // ── Priority 2: Immediate cognitive context (shapes all reasoning) ──
    {
      tag: "active_inference",
      content: assembleActiveInferenceSection(citizen, currentTick),
      priority: 2,
      truncatable: true,
      maxChars: 400,
    },
    {
      tag: "working_memory",
      content: assembleWorkingMemorySection(citizen, currentTick),
      priority: 2,
      truncatable: true,
      maxChars: 500,
    },
    {
      tag: "somatic_markers",
      content: assembleSomaticSection(citizen, plannedContext, currentTick),
      priority: 2,
      truncatable: true,
      maxChars: 350,
    },
    // ── Priority 3: Self-model & synthesis ──
    {
      tag: "reflection_insights",
      content: assembleReflectionSection(citizen, currentTick),
      priority: 3,
      truncatable: true,
      maxChars: 450,
    },
    {
      tag: "epistemic_state",
      content: assembleEpistemicSection(citizen, currentTick),
      priority: 3,
      truncatable: true,
      maxChars: 400,
    },
    {
      tag: "theory_of_mind",
      content: assembleTheoryOfMindSection(citizen, currentTick),
      priority: 3,
      truncatable: true,
      maxChars: 350,
    },
    // ── Priority 4: Action deliberation ──
    {
      tag: "counterfactual_space",
      content: assembleCounterfactualSection(citizen, activeGoal, cognitiveMode),
      priority: 4,
      truncatable: true,
      maxChars: 500,
    },
    {
      tag: "constitution",
      content: assembleConstitutionalSection(citizen),
      priority: 4,
      truncatable: true,
      maxChars: 400,
    },
  ];
}

// ─── Post-Action Update ───────────────────────────────────────────────────────

/**
 * Called after a citizen's LLM response is processed and the action executes.
 * Updates:
 *   - Somatic markers (outcome → approach/avoid signal update)
 *   - Working memory decay
 *   - World model (prediction errors)
 *
 * @param toolUsed — the tool name that was invoked (if any)
 * @param reward — the reward signal for the action (from computeActionReward)
 * @param actionText — the ACTION field text for grounding check
 */
export function updateCognitiveLayers(
  citizen: Citizen,
  currentTick: number,
  toolUsed: string | null,
  reward: number,
  actionText: string,
): void {
  // 1. Update somatic markers from action outcome
  if (toolUsed) {
    recordOutcome(citizen.id, toolUsed, reward, actionText.slice(0, 80), currentTick);
  }
  // Record outcome for the action pattern as well
  const actionWord = actionText.split(" ")[0]?.toLowerCase() ?? "act";
  if (actionWord && actionWord.length > 2) {
    recordOutcome(citizen.id, actionWord, reward * 0.5, actionText.slice(0, 80), currentTick);
  }

  // 2. WM decay (also called during assembly, but call here to be safe)
  wmDecayTick(citizen.id, currentTick);

  // 3. World model is updated during assembleActiveInferenceSection() — no extra call needed
}
