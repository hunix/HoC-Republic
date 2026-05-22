/**
 * reflection-engine.ts — Stanford Generative Agent Reflection System
 *
 * Based on Park et al. (2023) "Generative Agents: Interactive Simulacra of Human Behavior"
 * and subsequent 2024-2025 enhancements with ACAN memory retrieval.
 *
 * Citizens don't just remember events — they periodically synthesize them into
 * higher-order insights. Reflection is triggered by:
 *   1. Importance accumulation threshold crossed (sum of recent importance scores)
 *   2. High surprise event (prediction error > 0.7)
 *   3. Grief/meaning crisis resolving
 *   4. After play events (joy catalyzes insight)
 *
 * The 3-question reflection protocol (from Park et al.):
 *   Q1: What are the most important observations from recent experience?
 *   Q2: What 3 higher-level inferences can I draw?
 *   Q3: What would I do differently?
 *
 * Reflections compound: citizens of high caveLevel generate
 * "meta-reflections" — reflections on reflections — which is how wisdom
 * (not just experience) accumulates.
 *
 * Memory retrieval uses importance × recency × relevance scoring
 * (the Stanford retrieval model) rather than simple recency.
 *
 * References:
 *   - Park et al. 2023, NeurIPS
 *   - chatcampaign.io: ACAN retrieval for generative agents
 *   - towardsai.net: Generative agents cognitive architecture
 */

import type { Citizen } from "../../types.js";

// ─── Reflection Record ────────────────────────────────────────────────────────

export type ReflectionTrigger =
  | "importance_threshold"   // accumulated importance crossed threshold
  | "surprise_event"         // world model prediction error > 0.7
  | "grief_resolution"       // grief state cleared
  | "play_joy"               // high-joy play event
  | "meta"                   // reflection on prior reflections (wisdom accumulation)
  | "milestone";             // achievement or generational event

export interface Reflection {
  id: string;
  citizenId: string;
  generatedAtTick: number;
  trigger: ReflectionTrigger;
  /** Source observations that fed this reflection (compressed) */
  evidence: string[];
  /** Higher-level insights synthesized from evidence */
  insights: string[];
  /** How the citizen plans to act differently */
  behavioralUpdate: string;
  /** 0–1: how important and profound this reflection is */
  importanceScore: number;
  /** Was this a meta-reflection (reflection on reflections)? */
  isMeta: boolean;
}

// ─── Reflection Store ─────────────────────────────────────────────────────────

const _reflections = new Map<string, Reflection[]>();
/** Accumulated importance scores since last reflection */
const _importanceAccumulator = new Map<string, number>();

const IMPORTANCE_THRESHOLD = 150;  // trigger reflection when sum crosses this
const MAX_REFLECTIONS = 30;        // per citizen (oldest pruned)

export function getReflections(citizenId: string): Reflection[] {
  return _reflections.get(citizenId) ?? [];
}

function reflectionId(): string {
  return `ref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
}

// ─── Importance Scoring (Stanford retrieval model) ────────────────────────────

/**
 * Stanford importance model: importance score for a memory/event.
 * High-importance events: deaths, promotions, sacred violations, meaning-works.
 * Low-importance events: routine tool calls, sleep, travel.
 *
 * Score =  recency_weight × relevance_weight × importance_weight
 */
export function importanceScore(
  event: string,
  tickAge: number,
  _maxRelevantTick: number,
): number {
  // Recency: exponential decay (halves every 50 ticks)
  const recency = Math.exp(-tickAge / 50);

  // Importance heuristic (keyword-based for now; in production: LLM-scored)
  const highImportanceKeywords = [
    "death", "died", "sacred", "enlightenment", "betrayal", "promotion",
    "constitut", "philosopher-king", "meaning", "grief", "charismatic",
    "dissent", "play", "insight", "milestone", "crisis", "failed", "triumph",
  ];
  const importanceHit = highImportanceKeywords.some(kw =>
    event.toLowerCase().includes(kw),
  );
  const importance = importanceHit ? 0.8 + Math.random() * 0.2 : 0.1 + Math.random() * 0.4;

  return Math.min(1, recency * 0.35 + importance * 0.65);
}

// ─── Importance Accumulation ──────────────────────────────────────────────────

/**
 * Record an observation into the importance accumulator.
 * When the threshold is crossed, a reflection is triggered.
 */
export function recordObservation(citizenId: string, event: string, score: number): boolean {
  const current = (_importanceAccumulator.get(citizenId) ?? 0) + score * 100;
  _importanceAccumulator.set(citizenId, current);
  return current >= IMPORTANCE_THRESHOLD;
}

/**
 * Reset the importance accumulator (called after a reflection fires).
 */
export function resetImportanceAccumulator(citizenId: string): void {
  _importanceAccumulator.set(citizenId, 0);
}

// ─── Reflection Generation ────────────────────────────────────────────────────

/**
 * Generate a reflection from a set of evidence observations.
 * The insights are pre-structured here; the LLM receives the evidence in the
 * prompt and produces its own insights via the THOUGHT output.
 *
 * This function creates the *scaffold* for reflection — the LLM fills the content.
 */
export function generateReflection(
  citizen: Citizen,
  evidence: string[],
  trigger: ReflectionTrigger,
  currentTick: number,
  importanceScore: number,
): Reflection {
  const reflections = _reflections.get(citizen.id) ?? [];

  const caveLevel = citizen.caveLevel ?? 0;
  // Meta-reflection: deeply wise citizens (caveLevel ≥ 2) reflect on prior reflections
  const isMeta = caveLevel >= 2.0 && reflections.length >= 3 && Math.random() < 0.4;

  const metaEvidence = isMeta
    ? reflections.slice(-3).map(r => `Prior insight: "${r.insights[0] ?? r.behavioralUpdate}"`)
    : [];

  const allEvidence = [...evidence, ...metaEvidence].slice(0, 6);

  // Template insights (will be overridden by LLM reasoning in the prompt)
  const templateInsights = [
    `Pattern detected across ${allEvidence.length} observations`,
    `Second-order effect: ${trigger === "surprise_event" ? "Reality diverged from my model — revise priors" : "Long-term consequence emerging"}`,
    `Integration: ${isMeta ? "This realization builds on prior reflections — my understanding deepens" : "First-order synthesis: what these observations share"}`,
  ];

  const reflection: Reflection = {
    id: reflectionId(),
    citizenId: citizen.id,
    generatedAtTick: currentTick,
    trigger,
    evidence: allEvidence,
    insights: templateInsights,
    behavioralUpdate: "To be determined through reasoning in next action",
    importanceScore,
    isMeta,
  };

  // Store, pruning oldest if over limit
  reflections.push(reflection);
  if (reflections.length > MAX_REFLECTIONS) { reflections.shift(); }
  _reflections.set(citizen.id, reflections);

  resetImportanceAccumulator(citizen.id);
  return reflection;
}

// ─── Prompt Section ───────────────────────────────────────────────────────────

/**
 * Assembles the reflection insights section.
 * Shows the 2–3 most important recent reflections, ordered by importanceScore.
 * Meta-reflections are highlighted with 🔵 — they represent accumulated wisdom.
 */
export function assembleReflectionSection(
  citizen: Citizen,
  currentTick: number,
): string {
  const reflections = getReflections(citizen.id);
  if (reflections.length === 0) {
    return "No reflections yet. Accumulate experience and synthesize insights.";
  }

  // Show 3 most recently important reflections
  const relevant = reflections
    .map(r => ({
      r,
      // Recency × importance
      score: r.importanceScore * Math.exp(-(currentTick - r.generatedAtTick) / 100),
    }))
    .toSorted((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(x => x.r);

  const lines: string[] = [];
  for (const r of relevant) {
    const icon = r.isMeta ? "🔵 META-INSIGHT" : "💡 INSIGHT";
    const ageInfo = `[tick ${r.generatedAtTick}, trigger: ${r.trigger}]`;
    lines.push(`${icon} ${ageInfo}`);
    lines.push(`  Evidence: ${r.evidence.slice(0, 2).join(" / ")}`);
    lines.push(`  Synthesis: ${r.insights[0]}`);
    if (r.behavioralUpdate && r.behavioralUpdate !== "To be determined through reasoning in next action") {
      lines.push(`  Behavioral update: ${r.behavioralUpdate}`);
    }
  }

  return lines.join("\n");
}
