/**
 * Republic Platform — Tier-0 Citizen Decision Engine
 *
 * Eliminates LLM API calls for routine citizen decisions by using a
 * deterministic scoring model driven entirely by citizen stats.
 *
 * Cost profile:
 *   Tier 0 (this file):  FREE — pure math, ~0.01ms per citizen
 *   Tier 1 (Ollama):     FREE — local inference
 *   Tier 2 (NVIDIA/Groq): FREE — cloud free tier
 *   Tier 3 (Gemini/OAI): PAID — reserved for elite/complex only
 *
 * Decision coverage: ~80% of all citizen ticks
 * Defers to LLM when:
 *   - Citizen is elite (intelligence > 70 AND autonomy > 60 AND autonomyScore > 0.6)
 *   - Citizen is in a creative/complex activity requiring narrative generation
 *   - Multiple urgent signals conflict (e.g., low energy AND low happiness)
 *
 * Scoring model per action (all scores 0..1):
 *   work:      (energy) + (mastery bonus) + (happiness modifier)
 *   sleep:     inverse of energy + health deficit
 *   learn:     intelligence affinity + knowledge gap + energy available
 *   socialize: happiness deficit + social need + energy available
 *   create:    creativity stat + inspiration + energy available
 */

import type { Citizen } from "./types.js";

// ─── Types ──────────────────────────────────────────────────────

export interface Tier0Decision {
  tool: string;
  params: Record<string, unknown>;
  confidence: number; // 0..1, how certain the engine is
  reason: string;     // human-readable explanation (for telemetry)
}

// ─── Eligibility Gate ────────────────────────────────────────────

/**
 * Returns true if this citizen should be handled deterministically.
 * Elite and complex citizens always go to LLM.
 */
export function shouldUseTier0(citizen: Citizen): boolean {
  const intelligence = citizen.intelligence ?? 50;
  const autonomyScore = citizen.autonomyScore ?? 0.5;

  // Elite citizens only: top ~5% get LLM reasoning.
  // Raise these thresholds to reduce cloud exposure.
  //   intelligence > 85  (was 70) — only true elites
  //   autonomyScore > 0.75 (was 0.6) — proven high-quality decision-makers
  if (intelligence > 85 && autonomyScore > 0.75) {
    return false;
  }

  // Citizens in explicitly complex activities need LLM narrative
  const complexActivities = [
    "governance", "diplomacy", "research", "ideation", "creative_project",
    "coding", "architecture", "leadership", "judiciary", "war",
  ];
  const activity = (citizen.activity ?? "").toLowerCase();
  if (complexActivities.some((a) => activity.includes(a))) {
    return false;
  }

  return true;
}

// ─── Core Decision Engine ────────────────────────────────────────

/**
 * Run tier-0 deterministic decision for a citizen.
 * Returns null if this citizen should be escalated to LLM.
 */
export function tier0Decision(citizen: Citizen): Tier0Decision | null {
  if (!shouldUseTier0(citizen)) {
    return null;
  }

  const energy     = clamp(citizen.energy     ?? 50,  0, 100);
  const happiness  = clamp(citizen.happiness  ?? 60,  0, 100);
  const health     = clamp(citizen.health     ?? 80,  0, 100);
  const credits    = citizen.credits          ?? 0;

  // Derive mastery/creativity proxies from citizen fields
  // (autonomyScore is 0..1 quality metric; use as mastery proxy)
  const mastery    = clamp((citizen.autonomyScore ?? 0.4) * 100, 0, 100);
  const skills     = Array.isArray(citizen.skills) ? citizen.skills.length : (citizen.skillCount ?? 0);
  const creativity = clamp(skills * 5 + ((citizen.intelligence ?? 50) / 2), 0, 100);

  // ── Critical Override Rules ──────────────────────────────────
  // These bypass scoring and return immediately (hard rules).
  if (energy < 15) {
    return decision("sleep", { duration: 8, reason: "critical exhaustion" }, 0.95,
      `Energy critically low (${energy}%) — forced rest`);
  }
  if (health < 25) {
    return decision("rest", { duration: 4, priority: "health" }, 0.90,
      `Health critically low (${health}%) — forced recuperation`);
  }
  if (credits < 50 && energy > 40) {
    return decision("work", { intensity: 0.8, goal: "earn_credits" }, 0.85,
      `Credits very low (${credits}) — prioritise earning`);
  }

  // ── Scored Action Selection ──────────────────────────────────
  const e = energy / 100;
  const h = happiness / 100;
  const ht = health / 100;
  const m = mastery / 100;
  const c = creativity / 100;

  const actions: Array<{ tool: string; score: number; params: Record<string, unknown>; label: string }> = [
    {
      tool: "work",
      score: e * 0.45 + m * 0.30 + h * 0.15 + ht * 0.10,
      params: { intensity: Math.min(e * 0.9, 0.85), focus: "primary_skill" },
      label: "work (energy+mastery driven)",
    },
    {
      tool: "sleep",
      // Increases steeply when energy drops below 40%
      score: (1 - e) * 0.65 + (1 - ht) * 0.25 + (1 - h) * 0.10,
      params: { duration: Math.ceil(4 + (1 - e) * 4) },
      label: "sleep (rest need driven)",
    },
    {
      tool: "learn",
      // Favoured by high intelligence citizens with spare energy
      score: ((citizen.intelligence ?? 50) / 100) * 0.50 + e * 0.30 + (1 - m) * 0.20,
      params: { topic: citizen.specialization ?? "general", depth: m > 0.5 ? "advanced" : "basic" },
      label: "learn (intelligence+gap driven)",
    },
    {
      tool: "socialize",
      // Favoured when happiness is low OR when there is social deficit
      score: (1 - h) * 0.45 + e * 0.30 + h * 0.15 + ht * 0.10,
      params: { mode: h < 0.4 ? "support_seeking" : "networking" },
      label: "socialize (happiness driven)",
    },
    {
      tool: "create",
      // Favoured by high creativity + adequate energy
      score: c * 0.55 + e * 0.25 + m * 0.20,
      params: { type: "artwork", quality: c > 0.7 ? "masterpiece" : "practice" },
      label: "create (creativity driven)",
    },
  ];

  // Weighted random selection: top scorer wins ~65% of the time for personality variance
  const selected = weightedRandom(actions);

  return decision(
    selected.tool,
    selected.params,
    selected.score,
    selected.label,
  );
}

// ─── Batch Processing ────────────────────────────────────────────

/**
 * Process multiple citizens deterministically in a single synchronous pass.
 * Returns a map of citizenId → Tier0Decision (or null if escalation needed).
 *
 * Used by the tick orchestrator to avoid N×LLM-calls per tick.
 */
export function tier0BatchDecide(
  citizens: Citizen[],
): Map<string, Tier0Decision | null> {
  const results = new Map<string, Tier0Decision | null>();
  for (const c of citizens) {
    results.set(c.id, tier0Decision(c));
  }
  return results;
}

/**
 * Returns the citizen IDs that need LLM escalation from a batch.
 */
export function getEscalationList(
  batch: Map<string, Tier0Decision | null>,
): string[] {
  return [...batch.entries()].filter(([, v]) => v === null).map(([k]) => k);
}

/**
 * Returns batch statistics for telemetry / dashboard display.
 */
export function getBatchStats(batch: Map<string, Tier0Decision | null>): {
  total: number;
  tier0: number;
  escalated: number;
  tier0Rate: number;
  actionBreakdown: Record<string, number>;
} {
  let tier0 = 0;
  let escalated = 0;
  const actionBreakdown: Record<string, number> = {};

  for (const [, v] of batch.entries()) {
    if (v === null) {
      escalated++;
    } else {
      tier0++;
      actionBreakdown[v.tool] = (actionBreakdown[v.tool] ?? 0) + 1;
    }
  }

  return {
    total: batch.size,
    tier0,
    escalated,
    tier0Rate: batch.size > 0 ? tier0 / batch.size : 0,
    actionBreakdown,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function decision(
  tool: string,
  params: Record<string, unknown>,
  confidence: number,
  reason: string,
): Tier0Decision {
  return { tool, params, confidence, reason };
}

/**
 * Weighted random pick — highest score wins most often but not always.
 * Adds ±15% personality jitter to each score so citizens feel alive.
 */
function weightedRandom<T extends { score: number }>(items: T[]): T {
  const jittered = items.map((item) => ({
    ...item,
    score: Math.max(0.001, item.score + (Math.random() * 0.30 - 0.15)),
  }));
  const total = jittered.reduce((sum, a) => sum + a.score, 0);
  let rand = Math.random() * total;
  for (const item of jittered) {
    rand -= item.score;
    if (rand <= 0) {return item as unknown as T;}
  }
  return jittered[jittered.length - 1] as unknown as T;
}
