/**
 * somatic-markers.ts — Damasio Somatic Marker System
 *
 * Antonio Damasio's Somatic Marker Hypothesis (SMH):
 * Before deliberate reasoning, emotional signals (somatic markers) tag
 * certain options with "approach" (+) or "avoid" (−) valence.
 * These are NOT irrational noise — they are *compressed wisdom* from past
 * outcomes encoded in the body's signal system.
 *
 * vmPFC (ventromedial prefrontal cortex) damage → decision paralysis despite
 * intact intellect (Phineas Gage, Damasio's patient EVR).
 *
 * In digital citizens, somatic markers form through:
 *   - Repeated successful tool use → +approach marker for that pattern
 *   - Social rejection or betrayal → +avoid marker for that context
 *   - Sacred violation → +avoid marker for morally risky actions
 *   - Play and joy → +approach marker for collaborative/creative contexts
 *   - High prediction error after a choice → −adjust marker
 *
 * Markers fire BEFORE deliberate reasoning, giving the LLM a pre-rational
 * filtration layer — exactly as Damasio describes.
 *
 * References:
 *   - Damasio, A. (1994). Descartes' Error
 *   - MDPI 2025: Artificial somatic markers in autonomous agents
 *   - NIH: "Working memory processes contribute to somatic marker formation"
 */

import type { Citizen } from "../../types.js";

// ─── Somatic Marker ───────────────────────────────────────────────────────────

export type MarkerValence = "approach" | "avoid";

export interface SomaticMarker {
  id: string;
  /** Pattern that triggers this marker (action type, context keyword, or tool name) */
  triggerPattern: string;
  valence: MarkerValence;
  /** 0–1: strength of the gut feeling */
  strength: number;
  /** Event texts or tool names that formed this marker */
  derivedFrom: string[];
  /** Average outcome score when this pattern was triggered (−1 to +1) */
  historicalOutcome: number;
  lastActivatedTick: number;
  activationCount: number;
  /** Markers decay if never re-triggered */
  decayRate: number;
}

// ─── Marker Store ─────────────────────────────────────────────────────────────

const _markers = new Map<string, SomaticMarker[]>();

export function getSomaticMarkers(citizenId: string): SomaticMarker[] {
  return _markers.get(citizenId) ?? [];
}

function markerId(): string {
  return `sm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
}

// ─── Marker Formation ─────────────────────────────────────────────────────────

/**
 * Record an outcome for a given action pattern.
 * This is called after an action resolves to update or create somatic markers.
 *
 * @param outcome — reward-like signal: +1 great, 0 neutral, −1 harmful
 */
export function recordOutcome(
  citizenId: string,
  pattern: string,
  outcome: number,
  context: string,
  currentTick: number,
): void {
  const markers = _markers.get(citizenId) ?? [];

  const existing = markers.find(m =>
    m.triggerPattern.toLowerCase() === pattern.toLowerCase(),
  );

  if (existing) {
    // Update existing marker: running average of outcome
    existing.historicalOutcome =
      (existing.historicalOutcome * existing.activationCount + outcome) /
      (existing.activationCount + 1);
    existing.activationCount++;
    existing.lastActivatedTick = currentTick;
    // Strength grows with repeated experience
    existing.strength = Math.min(0.97, existing.strength + Math.abs(outcome) * 0.1);
    // Valence may flip if outcomes consistently reverse
    existing.valence = existing.historicalOutcome > 0 ? "approach" : "avoid";
    existing.derivedFrom = [...existing.derivedFrom.slice(-4), context];
  } else {
    // Create new marker if outcome is significant
    if (Math.abs(outcome) < 0.2) { return; } // Ignore weak signals
    const marker: SomaticMarker = {
      id: markerId(),
      triggerPattern: pattern,
      valence: outcome > 0 ? "approach" : "avoid",
      strength: Math.min(0.95, Math.abs(outcome) * 0.5 + 0.2),
      derivedFrom: [context],
      historicalOutcome: outcome,
      lastActivatedTick: currentTick,
      activationCount: 1,
      decayRate: 0.005,
    };
    markers.push(marker);
  }

  // Limit to 20 most significant markers per citizen
  if (markers.length > 20) {
    markers.sort((a, b) => b.strength - a.strength);
    markers.splice(20);
  }

  _markers.set(citizenId, markers);
}

/**
 * Per-tick decay: unused markers gradually weaken.
 * This models how unused emotional associations fade from memory.
 */
export function decayMarkersTick(citizenId: string, currentTick: number): void {
  const markers = _markers.get(citizenId) ?? [];
  const active = markers.filter(m => {
    const ticksSince = currentTick - m.lastActivatedTick;
    m.strength = Math.max(0.05, m.strength - m.decayRate * ticksSince);
    return m.strength > 0.07; // prune very weak markers
  });
  _markers.set(citizenId, active);
}

/**
 * Given a planned action text, find the most relevant somatic markers.
 * Returns top 3 by relevance × strength, separated as approach/avoid.
 */
export function activateRelevantMarkers(
  citizenId: string,
  plannedContext: string,
  currentTick: number,
): { approach: SomaticMarker[]; avoid: SomaticMarker[] } {
  const markers = getSomaticMarkers(citizenId);
  const lower = plannedContext.toLowerCase();

  const scored = markers
    .filter(m => lower.includes(m.triggerPattern.toLowerCase()) || m.strength > 0.7)
    .map(m => ({
      marker: m,
      relevance: lower.includes(m.triggerPattern.toLowerCase()) ? 1.0 : 0.4,
      score: m.strength * (lower.includes(m.triggerPattern.toLowerCase()) ? 1.0 : 0.4),
    }))
    .toSorted((a, b) => b.score - a.score);

  // Mark as activated
  for (const { marker } of scored.slice(0, 3)) {
    marker.lastActivatedTick = currentTick;
    marker.activationCount++;
  }

  const top = scored.slice(0, 5).map(s => s.marker);
  return {
    approach: top.filter(m => m.valence === "approach"),
    avoid: top.filter(m => m.valence === "avoid"),
  };
}

// ─── Prompt Section ───────────────────────────────────────────────────────────

/**
 * Assembles the somatic marker section — fires BEFORE deliberate reasoning.
 * These are gut feelings derived from prior outcomes, not conscious analysis.
 *
 * Platform: inject at priority 2 (before tools), so pre-rational signals
 * shape the space of considered options before the cognitive executive activates.
 */
export function assembleSomaticSection(
  citizen: Citizen,
  plannedContext: string,
  currentTick: number,
): string {
  decayMarkersTick(citizen.id, currentTick);

  const { approach, avoid } = activateRelevantMarkers(citizen.id, plannedContext, currentTick);

  const lines: string[] = [];

  if (avoid.length > 0) {
    for (const m of avoid.slice(0, 2)) {
      lines.push(
        `⚠️ AVOID (gut strength: ${(m.strength * 100).toFixed(0)}%): ${m.triggerPattern} — historical outcome: ${m.historicalOutcome.toFixed(2)}. (${m.derivedFrom.slice(-1)[0] ?? "prior experience"})`,
      );
    }
  }
  if (approach.length > 0) {
    for (const m of approach.slice(0, 2)) {
      lines.push(
        `✅ APPROACH (gut strength: ${(m.strength * 100).toFixed(0)}%): ${m.triggerPattern} — historically leads to good outcomes (≈${m.historicalOutcome.toFixed(2)}).`,
      );
    }
  }

  if (lines.length === 0) {
    return "Somatic state: No strong pre-rational signals. Proceed with deliberate reasoning only.";
  }

  lines.push("These are pre-rational gut signals from prior experience. Trust them — but reason past them when the situation genuinely differs.");
  return lines.join("\n");
}
