/**
 * Republic Platform — Foundry Overseer
 *
 * Autonomous cron that runs periodically to:
 *   1. Identify crystallization candidates (high-value workflow patterns)
 *   2. Auto-generate skills from patterns meeting thresholds
 *   3. Prune stale patterns that haven't been used
 *   4. Track performance metrics (ADAS-style evolution scores)
 *   5. Report actions via Intelligence Bus
 *
 * Runs every 100 ticks in the tick pipeline.
 */

import { performance } from "node:perf_hooks";
import type { RepublicState } from "./types.js";
import { ts, uid } from "./utils.js";
import {
  getCrystallizationCandidates,
  crystallizePattern,
  pruneStalePatterns,
  recordLearning,
  markOverseerRun,
  getPatterns,
} from "./foundry-engine.js";

// ─── Types ──────────────────────────────────────────────────────

/** An overseer action report entry */
export interface OverseerAction {
  id: string;
  tick: number;
  action: "crystallize" | "prune" | "analyze" | "report";
  description: string;
  patternId?: string;
  skillId?: string;
  timestamp: string;
}

/** Overseer run report */
export interface OverseerReport {
  id: string;
  tick: number;
  duration: number;
  candidatesFound: number;
  skillsGenerated: number;
  patternsPruned: number;
  actions: OverseerAction[];
  timestamp: string;
}

// ─── State ──────────────────────────────────────────────────────

const overseerReports: OverseerReport[] = [];
const OVERSEER_CADENCE = 100; // Run every 100 ticks
const MAX_CRYSTALLIZATIONS_PER_RUN = 3;

// ─── Overseer Tick ──────────────────────────────────────────────

/**
 * Overseer tick — runs autonomously on a fixed cadence.
 * This is the "meta-agent" that evolves the system itself.
 */
export function foundryOverseerTick(state: RepublicState): void {
  // Only run at the cadence interval
  if (state.currentTick % OVERSEER_CADENCE !== 0) {return;}
  // Need at least some patterns to work with
  if (getPatterns().length === 0) {return;}

  const startTime = performance.now();
  const actions: OverseerAction[] = [];
  let skillsGenerated = 0;
  let patternsPruned = 0;

  // ── Step 1: Identify crystallization candidates ──────────────
  const candidates = getCrystallizationCandidates();

  actions.push({
    id: uid(),
    tick: state.currentTick,
    action: "analyze",
    description: `Analyzed ${getPatterns().length} patterns, found ${candidates.length} crystallization candidates`,
    timestamp: ts(),
  });

  // ── Step 2: Crystallize top candidates ───────────────────────
  // Sort by evolution score (highest first)
  const ranked = [...candidates].toSorted((a, b) => b.evolutionScore - a.evolutionScore);

  for (const pattern of ranked.slice(0, MAX_CRYSTALLIZATIONS_PER_RUN)) {
    const result = crystallizePattern(pattern.id);
    if (result.ok) {
      skillsGenerated++;
      actions.push({
        id: uid(),
        tick: state.currentTick,
        action: "crystallize",
        description: `Crystallized pattern "${pattern.keywords.join(", ")}" → skill ${result.skillId}`,
        patternId: pattern.id,
        skillId: result.skillId,
        timestamp: ts(),
      });
    }
  }

  // ── Step 3: Prune stale patterns ────────────────────────────
  patternsPruned = pruneStalePatterns(state.currentTick);
  if (patternsPruned > 0) {
    actions.push({
      id: uid(),
      tick: state.currentTick,
      action: "prune",
      description: `Pruned ${patternsPruned} stale patterns`,
      timestamp: ts(),
    });
  }

  // ── Step 4: Generate report ─────────────────────────────────
  const duration = performance.now() - startTime;
  const report: OverseerReport = {
    id: uid(),
    tick: state.currentTick,
    duration: Math.round(duration),
    candidatesFound: candidates.length,
    skillsGenerated,
    patternsPruned,
    actions,
    timestamp: ts(),
  };

  overseerReports.push(report);
  if (overseerReports.length > 50) {
    overseerReports.splice(0, overseerReports.length - 50);
  }

  markOverseerRun();

  // Record learning about the overseer's own performance
  if (skillsGenerated > 0 || patternsPruned > 0) {
    recordLearning(
      `Overseer run at tick ${state.currentTick}: generated ${skillsGenerated} skills, pruned ${patternsPruned} patterns from ${candidates.length} candidates`,
      "observation",
      [report.id],
      0.8,
    );
  }

  // Publish to Intelligence Bus (best-effort)
  try {
    void (async () => {
      const bus = await import("./intelligence-bus.js");
      const instance = (bus as Record<string, unknown>).intelligenceBus as
        | { publish?: (type: string, payload: unknown) => void }
        | undefined;
      if (instance && typeof instance.publish === "function") {
        instance.publish("foundry.overseer_run", {
          tick: state.currentTick,
          candidates: candidates.length,
          skillsGenerated,
          patternsPruned,
          durationMs: Math.round(duration),
        });
      }
    })();
  } catch {
    // Intelligence Bus not available — degrade gracefully
  }
}

// ─── Query API ──────────────────────────────────────────────────

/** Get recent overseer reports */
export function getOverseerReports(limit = 10): OverseerReport[] {
  return overseerReports.slice(-limit);
}

/** Get the most recent overseer report */
export function getLastOverseerReport(): OverseerReport | null {
  return overseerReports.length > 0 ? overseerReports[overseerReports.length - 1] : null;
}

/** Serialize overseer state */
export function serializeOverseerState(): { reports: OverseerReport[] } {
  return { reports: overseerReports.slice(-20) };
}

/** Restore overseer state */
export function restoreOverseerState(data: { reports?: OverseerReport[] }): void {
  if (data.reports) {
    overseerReports.length = 0;
    overseerReports.push(...data.reports);
  }
}
