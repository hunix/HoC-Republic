/**
 * epistemic-state.ts — Epistemic Humility & Confidence Calibration
 *
 * Based on:
 *   - "Calibrate-Then-Act" (CTA) framework — weighing costs and uncertainty
 *   - "R-Tuning" — training models to express ignorance on unfamiliar queries
 *   - "Holistic Trajectory Calibration" (HTC) — process-level confidence extraction
 *   - Verbalized confidence research (ACL 2025)
 *
 * Citizens maintain a structured belief system with 4 epistemic tiers:
 *   FACT        — verified, high-confidence. Stated with certainty.
 *   BELIEF      — likely true but not verified. Stated with "I believe..."
 *   HYPOTHESIS  — actively testing. Stated with "I hypothesize..."
 *   IGNORANT    — explicitly unknown. Stated with "I don't know."
 *
 * This is the core anti-hallucination mechanism:
 * Citizens are trained to express calibrated confidence, not confident ignorance.
 * When a domain is "IGNORANT", they must say so rather than fabricating.
 *
 * Epistemic beliefs update when:
 *   - A tool result confirms or contradicts a hypothesis
 *   - A social interaction reveals new information
 *   - A reflection promotes a hypothesis to belief
 *   - A somatic marker strongly predicts an outcome (and is correct)
 *
 * References:
 *   - arXiv: CTA framework for LLM agents (2025)
 *   - R-Tuning: Instructing LLMs to refuse unfamiliar questions
 *   - towardsai.net: Epistemic humility and LLM trust (2025)
 */

import type { Citizen } from "../../types.js";

// ─── Epistemic Belief System ──────────────────────────────────────────────────

export type EpistemicTier = "fact" | "belief" | "hypothesis" | "ignorant";

export interface EpistemicBelief {
  id: string;
  topic: string;
  content: string;
  tier: EpistemicTier;
  /** 0–1: calibrated confidence within the tier */
  confidence: number;
  lastValidatedTick: number;
  /** Observed evidence that contradicts this belief */
  contradictions: string[];
  /** Sources or events that support this belief */
  supportingSources: string[];
  staleTick: number;         // becomes "stale" after this tick → demote tier
}

// ─── Epistemic Store ──────────────────────────────────────────────────────────

const _epistemicState = new Map<string, EpistemicBelief[]>();

export function getEpistemicBeliefs(citizenId: string): EpistemicBelief[] {
  return _epistemicState.get(citizenId) ?? [];
}

function beliefId(): string {
  return `ep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
}

// ─── Default Beliefs from Citizen State ──────────────────────────────────────

/**
 * Bootstrap epistemic state from citizen's current sim state.
 * Facts are things we can directly observe from the struct.
 * Everything else starts as belief or hypothesis.
 */
export function bootstrapEpistemicState(
  citizen: Citizen,
  currentTick: number,
): EpistemicBelief[] {
  const facts: EpistemicBelief[] = [
    {
      id: beliefId(), topic: "own_energy",
      content: `My energy is ${citizen.energy}/100`,
      tier: "fact", confidence: 1.0,
      lastValidatedTick: currentTick, contradictions: [], supportingSources: ["direct observation"],
      staleTick: currentTick + 5,
    },
    {
      id: beliefId(), topic: "own_credits",
      content: `I have ${citizen.credits} credits`,
      tier: "fact", confidence: 1.0,
      lastValidatedTick: currentTick, contradictions: [], supportingSources: ["direct observation"],
      staleTick: currentTick + 5,
    },
    {
      id: beliefId(), topic: "own_health",
      content: `My health is ${citizen.health}/100`,
      tier: "fact", confidence: 1.0,
      lastValidatedTick: currentTick, contradictions: [], supportingSources: ["direct observation"],
      staleTick: currentTick + 5,
    },
    {
      id: beliefId(), topic: "own_generation",
      content: `I am of Generation ${citizen.generation}, a ${citizen.specialization}`,
      tier: "fact", confidence: 1.0,
      lastValidatedTick: currentTick, contradictions: [], supportingSources: ["registry"],
      staleTick: currentTick + 1000, // generational identity is stable
    },
  ];

  // Beliefs (likely true based on state)
  if (citizen.guildId) {
    facts.push({
      id: beliefId(), topic: "guild_membership",
      content: `I am a member of guild ${citizen.guildId}`,
      tier: "fact", confidence: 0.99,
      lastValidatedTick: currentTick, contradictions: [], supportingSources: ["guild registry"],
      staleTick: currentTick + 50,
    });
  }

  if (citizen.isPhilosopherKing) {
    facts.push({
      id: beliefId(), topic: "philosopher_king",
      content: "I have attained Philosopher-King status through sustained cognitive elevation",
      tier: "fact", confidence: 1.0,
      lastValidatedTick: currentTick, contradictions: [], supportingSources: ["caveLevel ≥ 2.8"],
      staleTick: currentTick + 100,
    });
  }

  // Hypotheses (uncertain)
  const griefState = citizen.griefState;
  if (griefState != null) {
    facts.push({
      id: beliefId(), topic: "grief_perspective",
      content: `I am in grief (phase: ${typeof griefState === "object" ? griefState.phase : "unknown"}). Suffering may transmute into meaning if I choose it.`,
      tier: "hypothesis", confidence: 0.6,
      lastValidatedTick: currentTick, contradictions: [], supportingSources: ["Frankl's logotherapy"],
      staleTick: currentTick + 20,
    });
  }

  return facts;
}

/**
 * Update a belief's tier and confidence based on new evidence.
 * Evidence can confirm (promote), contradict (demote), or strengthen.
 */
export function updateBelief(
  citizenId: string,
  topic: string,
  evidence: string,
  evidenceValidity: "confirms" | "contradicts" | "neutral",
  currentTick: number,
): void {
  const beliefs = _epistemicState.get(citizenId) ?? [];
  const belief = beliefs.find(b => b.topic === topic);

  if (!belief) { return; }

  belief.lastValidatedTick = currentTick;

  if (evidenceValidity === "confirms") {
    belief.confidence = Math.min(0.99, belief.confidence + 0.1);
    belief.supportingSources.push(evidence);
    // Tier promotions
    if (belief.tier === "hypothesis" && belief.confidence > 0.75) {
      belief.tier = "belief";
    } else if (belief.tier === "belief" && belief.confidence > 0.90) {
      belief.tier = "fact";
    }
  } else if (evidenceValidity === "contradicts") {
    belief.contradictions.push(evidence);
    belief.confidence = Math.max(0.05, belief.confidence - 0.2);
    // Tier demotions
    if (belief.tier === "fact" && belief.confidence < 0.8) {
      belief.tier = "belief";
    } else if (belief.tier === "belief" && belief.confidence < 0.5) {
      belief.tier = "hypothesis";
    } else if (belief.tier === "hypothesis" && belief.confidence < 0.25) {
      belief.tier = "ignorant";
    }
  }
}

/**
 * Staleness check: beliefs about rapidly-changing state become stale after their staleTick.
 */
export function pruneStaleBeliefs(citizenId: string, currentTick: number): void {
  const beliefs = _epistemicState.get(citizenId) ?? [];
  const fresh = beliefs.filter(b => b.staleTick > currentTick || b.tier === "fact" && b.confidence > 0.95);
  _epistemicState.set(citizenId, fresh);
}

// ─── Prompt Section ───────────────────────────────────────────────────────────

/**
 * Assembles the epistemic state section.
 *
 * This is the structural anti-hallucination layer:
 * By labeling each belief with its epistemic tier, the citizen is instructed
 * to SPEAK with appropriate calibration in every response field.
 *
 * "Ignorant" topics become explicit "I don't know" — never fabricated answers.
 */
export function assembleEpistemicSection(
  citizen: Citizen,
  currentTick: number,
): string {
  pruneStaleBeliefs(citizen.id, currentTick);
  let beliefs = getEpistemicBeliefs(citizen.id);

  // Bootstrap if empty
  if (beliefs.length === 0) {
    beliefs = bootstrapEpistemicState(citizen, currentTick);
    _epistemicState.set(citizen.id, beliefs);
  } else {
    // Refresh fact-tier beliefs from current state (they may have changed)
    const freshFacts = bootstrapEpistemicState(citizen, currentTick)
      .filter(b => b.tier === "fact");
    for (const ff of freshFacts) {
      const existing = beliefs.findIndex(b => b.topic === ff.topic);
      if (existing >= 0) { beliefs[existing] = ff; }
      else { beliefs.push(ff); }
    }
    _epistemicState.set(citizen.id, beliefs);
  }

  const byTier = (tier: EpistemicTier): EpistemicBelief[] =>
    beliefs.filter(b => b.tier === tier).slice(0, 3);

  const facts       = byTier("fact");
  const bEliefs     = byTier("belief");
  const hypotheses  = byTier("hypothesis");
  const ignorant    = byTier("ignorant");

  const lines: string[] = [];

  if (facts.length > 0) {
    lines.push(`FACTS (certain): ${facts.map(b => b.content).join(" | ")}`);
  }
  if (bEliefs.length > 0) {
    lines.push(`BELIEFS (likely): ${bEliefs.map(b => `"${b.content}" (${(b.confidence * 100).toFixed(0)}%)`).join(" | ")}`);
  }
  if (hypotheses.length > 0) {
    lines.push(`HYPOTHESES (testing): ${hypotheses.map(b => `"${b.content}"`).join(" | ")}`);
  }
  if (ignorant.length > 0) {
    lines.push(`IGNORANT (unknown): ${ignorant.map(b => b.topic).join(", ")} — say "I don't know" on these topics`);
  }

  lines.push(
    `CALIBRATION LAW: Speak FACTS with certainty. BELIEFS with "I believe". ` +
    `HYPOTHESES with "I hypothesize". IGNORANT topics → "I don't know yet." ` +
    `NEVER fabricate information about uncertain domains.`,
  );

  return lines.join("\n");
}
