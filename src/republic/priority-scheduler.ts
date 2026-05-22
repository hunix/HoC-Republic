/**
 * Republic Platform — Priority Scheduler
 *
 * Three-tier citizen scheduling system that allows the republic to
 * efficiently manage 10 000+ citizens on a single server by running
 * each citizen at a cadence proportional to their activity level.
 *
 * Tier 0 — ELITE   : Citizens with intelligence > 80 or active projects → tick every 10 s
 * Tier 1 — ACTIVE  : Citizens online or recently busy              → tick every 60 s
 * Tier 2 — DORMANT : Idle citizens                                 → tick every 5 min
 *
 * The scheduler exposes `getTickCohort(currentTick)` which returns the
 * slice of citizen IDs that should be processed in this tick.
 */

import type { Citizen } from "./types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("republic:priority-scheduler");

// ─── Tier Definitions ───────────────────────────────────────────────

export type CitizenTier = 0 | 1 | 2;

export interface TierConfig {
  name: "elite" | "active" | "dormant";
  tickEveryN: number; // run every N simulation ticks
  maxConcurrent: number; // max citizens to process in a single tick batch
}

export const TIER_CONFIGS: Record<CitizenTier, TierConfig> = {
  0: { name: "elite", tickEveryN: 1, maxConcurrent: 100 },
  1: { name: "active", tickEveryN: 6, maxConcurrent: 200 },
  2: { name: "dormant", tickEveryN: 30, maxConcurrent: 500 },
};

// ─── Classification ────────────────────────────────────────────────

/**
 * Classify a citizen into a priority tier based on their current state.
 */
export function classifyCitizen(citizen: Citizen): CitizenTier {
  const intelligence = citizen.intelligence ?? 0;
  const hasActiveProject = (citizen.activeProcessId ?? null) !== null;
  const energy = citizen.energy ?? 0;
  const happiness = citizen.happiness ?? 50;

  // Tier 0: Elite — high intelligence or currently working on a project
  if (intelligence > 80 || hasActiveProject) {
    return 0;
  }

  // Tier 1: Active — has energy and reasonable happiness
  if (energy > 20 && happiness > 30) {
    return 1;
  }

  // Tier 2: Dormant — low-energy or unhappy citizens tick rarely
  return 2;
}

// ─── Scheduler ─────────────────────────────────────────────────────

export interface SchedulerStats {
  totalCitizens: number;
  tier0Count: number;
  tier1Count: number;
  tier2Count: number;
  lastReclassifiedAt: number;
  cohortSize: number;
}

export class PriorityScheduler {
  /** Map from citizenId → assigned tier */
  private tierMap = new Map<string, CitizenTier>();
  /** Ordered lists of citizen IDs per tier */
  private tiers: [string[], string[], string[]] = [[], [], []];
  /** Round-robin pointers for each tier */
  private rr: [number, number, number] = [0, 0, 0];
  private lastReclassifiedAt = 0;
  /** Reclassify every N ticks (~5 min at 10s tick interval) */
  private reclassifyEveryN = 30;

  constructor(opts?: { reclassifyEveryN?: number }) {
    if (opts?.reclassifyEveryN != null) {
      this.reclassifyEveryN = opts.reclassifyEveryN;
    }
  }

  // ── Registration ────────────────────────────────────────────────

  /**
   * Bulk-register or re-register citizens. Safe to call on every tick
   * (will reclassify only every `reclassifyEveryN` ticks).
   */
  sync(citizens: Citizen[], currentTick: number): void {
    const shouldReclassify =
      this.tierMap.size === 0 || currentTick - this.lastReclassifiedAt >= this.reclassifyEveryN;

    if (!shouldReclassify) {
      return;
    }

    const newTiers: [string[], string[], string[]] = [[], [], []];
    const newTierMap = new Map<string, CitizenTier>();

    for (const citizen of citizens) {
      const tier = classifyCitizen(citizen);
      newTiers[tier].push(citizen.id);
      newTierMap.set(citizen.id, tier);
    }

    this.tiers = newTiers;
    this.tierMap = newTierMap;
    this.lastReclassifiedAt = currentTick;

    // Reset round-robin pointers
    this.rr = [0, 0, 0];

    logger.debug(
      `Scheduler reclassified ${citizens.length} citizens → ` +
        `Elite:${newTiers[0].length} Active:${newTiers[1].length} Dormant:${newTiers[2].length}`,
    );
  }

  /**
   * Promote a citizen to Tier 0 immediately (e.g., they just started a project).
   */
  promote(citizenId: string): void {
    const current = this.tierMap.get(citizenId);
    if (current === 0) {
      return;
    } // Already elite
    if (current !== undefined) {
      this.tiers[current] = this.tiers[current].filter((id) => id !== citizenId);
    }
    this.tiers[0].push(citizenId);
    this.tierMap.set(citizenId, 0);
  }

  /**
   * Demote a citizen to Tier 2 immediately (e.g., they ran out of energy).
   */
  demote(citizenId: string): void {
    const current = this.tierMap.get(citizenId);
    if (current === 2) {
      return;
    }
    if (current !== undefined) {
      this.tiers[current] = this.tiers[current].filter((id) => id !== citizenId);
    }
    this.tiers[2].push(citizenId);
    this.tierMap.set(citizenId, 2);
  }

  // ── Cohort Selection ────────────────────────────────────────────

  /**
   * Returns the set of citizen IDs that should tick this simulation tick.
   *
   * Uses round-robin within each tier so every citizen is eventually
   * served, even in very large populations.
   */
  getTickCohort(currentTick: number): string[] {
    const cohort: string[] = [];

    for (const tierIdx of [0, 1, 2] as CitizenTier[]) {
      const config = TIER_CONFIGS[tierIdx];
      const list = this.tiers[tierIdx];

      if (list.length === 0) {
        continue;
      }
      if (currentTick % config.tickEveryN !== 0) {
        continue;
      }

      // Round-robin slice: take up to maxConcurrent citizens starting from rr pointer
      const start = this.rr[tierIdx] % list.length;
      const count = Math.min(config.maxConcurrent, list.length);

      for (let i = 0; i < count; i++) {
        cohort.push(list[(start + i) % list.length]);
      }

      // Advance round-robin pointer — next tick starts where we left off
      this.rr[tierIdx] = (start + count) % list.length;
    }

    return cohort;
  }

  // ── Stats ────────────────────────────────────────────────────────

  getStats(currentTick: number): SchedulerStats {
    const cohort = this.getTickCohort(currentTick);
    return {
      totalCitizens: this.tierMap.size,
      tier0Count: this.tiers[0].length,
      tier1Count: this.tiers[1].length,
      tier2Count: this.tiers[2].length,
      lastReclassifiedAt: this.lastReclassifiedAt,
      cohortSize: cohort.length,
    };
  }

  getTierOf(citizenId: string): CitizenTier | undefined {
    return this.tierMap.get(citizenId);
  }
}

// ─── Singleton ──────────────────────────────────────────────────────

let _scheduler: PriorityScheduler | null = null;

export function getPriorityScheduler(): PriorityScheduler {
  if (!_scheduler) {
    _scheduler = new PriorityScheduler();
  }
  return _scheduler;
}
