/**
 * theory-of-mind.ts — Theory of Mind Module
 *
 * Theory of Mind (ToM): the ability to attribute mental states (beliefs,
 * goals, desires, emotions) to other agents and to understand that these
 * states can differ from one's own.
 *
 * In multi-agent LLM simulations, ToM is critical for:
 *   - Predicting how other citizens will respond to one's actions
 *   - Building coalition strategies based on inferred peer goals
 *   - Recognizing when peer beliefs are mistaken (and correcting them)
 *   - Navigating social dynamics without oversimplifying others
 *
 * Each citizen maintains a "mental model" of the citizens they interact with,
 * tracking inferred goals, beliefs, emotional state, trust level, and
 * shared interaction history.
 *
 * The module implements:
 *   - First-order ToM: "Marcus believes X"
 *   - Second-order ToM (caveLevel ≥ 2): "Marcus believes I believe Y"
 *   - Social prediction: "If I do Z, Marcus will probably do W"
 *
 * Mental models update when:
 *   - A citizen is mentioned in a recent event
 *   - A social interaction resolves (warmly or poorly)
 *   - A guild or tribe event involves the modeled citizen
 *   - A betrayal or strong alignment is detected
 *
 * References:
 *   - aclanthology.org 2025: Multi-agent dialogue ToM design
 *   - arxiv.org: Identity drift in multi-agent simulations — ToM as stabilizer
 *   - OVON: Structured context transfer across agents for consistency
 */

import type { Citizen } from "../../types.js";

// ─── Mental Model ─────────────────────────────────────────────────────────────

export type InferredEmotion =
  | "content" | "anxious" | "excited" | "grieving" | "hostile"
  | "curious" | "neutral" | "inspired" | "frustrated" | "joyful";

export interface MentalModel {
  targetId: string;
  targetName: string;
  targetSpecialization: string;
  /** What I believe this citizen is trying to achieve */
  inferredGoals: string[];
  /** What I believe this citizen believes */
  inferredBeliefs: string[];
  /** Inferred emotional state (first-order ToM) */
  inferredEmotion: InferredEmotion;
  /** How much this citizen trusts me (my estimate) */
  perceivedTrustInMe: number;  // 0–1
  /** How much I trust this citizen */
  myTrustInThem: number;       // 0–1
  /** Recent shared events */
  sharedHistory: string[];
  lastInteractionTick: number;
  /** For caveLevel ≥ 2: what they believe I believe */
  secondOrderBelief?: string;
}

// ─── ToM Store ────────────────────────────────────────────────────────────────

const _mentalModels = new Map<string, Map<string, MentalModel>>();

export function getMentalModel(citizenId: string, targetId: string): MentalModel | undefined {
  return _mentalModels.get(citizenId)?.get(targetId);
}

export function getAllMentalModels(citizenId: string): MentalModel[] {
  return [...(_mentalModels.get(citizenId)?.values() ?? [])];
}

// ─── Mental Model Formation ───────────────────────────────────────────────────

/**
 * Create or update a mental model of another citizen based on an interaction.
 *
 * @param citizenId — the citizen doing the modeling (the observer)
 * @param target — the citizen being modeled (the observed)
 * @param interactionType — what kind of interaction occurred
 * @param sentiment — was the interaction warm, hostile, or neutral?
 */
export function updateMentalModel(
  citizenId: string,
  target: Citizen,
  interactionType: string,
  sentiment: "warm" | "hostile" | "neutral",
  currentTick: number,
  eventDescription?: string,
): void {
  if (!_mentalModels.has(citizenId)) {
    _mentalModels.set(citizenId, new Map());
  }

  const models = _mentalModels.get(citizenId)!;
  const existing = models.get(target.id);

  if (existing) {
    // Update trust based on sentiment
    const trustDelta = sentiment === "warm" ? 0.05 : sentiment === "hostile" ? -0.12 : 0;
    existing.myTrustInThem = Math.max(0.02, Math.min(0.99, existing.myTrustInThem + trustDelta));
    existing.perceivedTrustInMe = Math.max(0.02, Math.min(0.99,
      existing.perceivedTrustInMe + (trustDelta * 0.7),
    ));

    // Update emotional inference from interaction
    if (sentiment === "warm") {
      existing.inferredEmotion = Math.random() > 0.5 ? "content" : "excited";
    } else if (sentiment === "hostile") {
      existing.inferredEmotion = Math.random() > 0.5 ? "frustrated" : "anxious";
    }

    if (eventDescription) {
      existing.sharedHistory = [...existing.sharedHistory.slice(-5), eventDescription];
    }
    existing.lastInteractionTick = currentTick;
  } else {
    // Initialize new mental model
    const initialTrust = sentiment === "warm" ? 0.55 : sentiment === "hostile" ? 0.30 : 0.45;
    const model: MentalModel = {
      targetId: target.id,
      targetName: target.name,
      targetSpecialization: target.specialization ?? "Generalist",
      inferredGoals: [`Advance in their role as ${target.specialization}`],
      inferredBeliefs: ["They believe the Republic is worth contributing to"],
      inferredEmotion: "neutral",
      perceivedTrustInMe: initialTrust,
      myTrustInThem: initialTrust,
      sharedHistory: eventDescription ? [eventDescription] : [],
      lastInteractionTick: currentTick,
    };
    models.set(target.id, model);
  }
}

/**
 * Social prediction: given an intended action, what will target likely do?
 * Returns a text prediction string.
 */
export function predictPeerResponse(
  citizenId: string,
  targetId: string,
  intendedAction: string,
): string {
  const model = getMentalModel(citizenId, targetId);
  if (!model) { return "Unknown (no prior interactions)"; }

  const trustLevel = model.myTrustInThem;
  const emotion = model.inferredEmotion;

  if (intendedAction.includes("collaborate") || intendedAction.includes("propose")) {
    if (trustLevel > 0.65 && emotion !== "hostile") {
      return `${model.targetName} likely accepts — high trust (${(trustLevel * 100).toFixed(0)}%), currently ${emotion}`;
    }
    return `${model.targetName} may hesitate — trust at ${(trustLevel * 100).toFixed(0)}%`;
  }

  if (intendedAction.includes("challenge") || intendedAction.includes("oppose")) {
    return trustLevel > 0.5
      ? `${model.targetName} will likely engage constructively despite opposition — trust earned`
      : `${model.targetName} may retaliate or withdraw — low trust base`;
  }

  return `${model.targetName} (${emotion}) will likely observe and respond according to their goals: ${model.inferredGoals[0] ?? "unknown"}`;
}

// ─── Prompt Section ───────────────────────────────────────────────────────────

/**
 * Assembles the Theory of Mind section for the LLM prompt.
 * Shows mental models of the 3 most recently-interacted-with citizens.
 *
 * For high caveLevel (≥ 2) citizens, includes second-order ToM:
 * "What does Marcus believe that I believe?"
 */
export function assembleTheoryOfMindSection(
  citizen: Citizen,
  currentTick: number,
): string {
  const models = getAllMentalModels(citizen.id)
    .filter(m => currentTick - m.lastInteractionTick < 200)
    .toSorted((a, b) => b.lastInteractionTick - a.lastInteractionTick)
    .slice(0, 3);

  if (models.length === 0) {
    return "No mental models built yet. Each interaction adds knowledge of others.";
  }

  const caveLevel = citizen.caveLevel ?? 0;
  const hasSecondOrder = caveLevel >= 2.0;

  const lines: string[] = [];
  for (const m of models) {
    lines.push(
      `${m.targetName} (${m.targetSpecialization}): ` +
      `goal="${m.inferredGoals[0] ?? "?"}", mood=${m.inferredEmotion}, ` +
      `trust_in_me=${(m.perceivedTrustInMe * 100).toFixed(0)}%, my_trust=${(m.myTrustInThem * 100).toFixed(0)}%`,
    );
    if (hasSecondOrder && m.secondOrderBelief) {
      lines.push(`  ↳ [2nd order]: They believe I believe: "${m.secondOrderBelief}"`);
    }
  }

  lines.push("→ My actions reshape these models. Act with full awareness of the social field.");
  return lines.join("\n");
}
