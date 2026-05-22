/**
 * Republic Platform — Reflective Meta-Learner
 *
 * Invention #4: Second-order learning that evolves the mutation strategies
 * of the meta-learning engine itself.
 *
 * Inspired by:
 *   - Gödel Agent — self-referential recursive improvement
 *   - SOAR Method — self-improving evolutionary loops
 *   - AlphaEvolve — evolving the search itself
 *
 * While meta-learning-engine.ts evolves PARAMETERS, this module evolves
 * the STRATEGIES used to generate and evaluate those parameter mutations:
 *
 *   Level 0: Engine parameters (curiosity threshold, learning rate)
 *   Level 1: Meta-learning (which parameters to mutate, perturbation range)
 *   Level 2: Reflective meta-learning (which mutation strategies work)
 *   Level 3: Strategy transfer (apply successful strategies cross-engine)
 */

import { uid } from "../utils.js";

// ─── Types ──────────────────────────────────────────────────────

/** A mutation strategy configuration */
export interface MutationStrategy {
  id: string;
  name: string;
  /** Perturbation range (±%) for parameter changes */
  perturbationRange: number;
  /** How many mutations to generate per generation */
  mutationsPerGeneration: number;
  /** Minimum improvement threshold to accept a mutation */
  improvementThreshold: number;
  /** A/B test duration in ticks */
  testDuration: number;
  /** Selection pressure (higher = more aggressive pruning) */
  selectionPressure: number;
}

/** Performance record for a strategy */
export interface StrategyPerformance {
  strategyId: string;
  engineName: string;
  totalMutationsGenerated: number;
  acceptedMutations: number;
  rejectedMutations: number;
  avgImprovement: number;
  /** Strategy effectiveness = accepted / total * avgImprovement */
  effectiveness: number;
  lastUsedAt: number;
}

/** A failed mutation that might succeed under different conditions */
export interface NearMiss {
  strategyId: string;
  engineName: string;
  improvement: number;      // How close it got (e.g., 0.04 when threshold was 0.05)
  threshold: number;        // The threshold it failed to meet
  paramName: string;
  tick: number;
}

/** Cross-engine strategy transfer record */
export interface StrategyTransfer {
  id: string;
  fromEngine: string;
  toEngine: string;
  strategy: MutationStrategy;
  sourceEffectiveness: number;
  targetEffectiveness: number | null; // null until tested
  status: "proposed" | "testing" | "accepted" | "rejected";
  transferredAt: number;
}

// ─── Configuration ──────────────────────────────────────────────

/** How often to evolve strategies (in meta-generations) */
const REFLECTION_INTERVAL = 5;

/** Max strategies per engine */
const MAX_STRATEGIES = 10;

/** Max near-misses to track */
const MAX_NEAR_MISSES = 50;

/** Hard limits for constitutional guardrails */
const HARD_LIMITS = {
  minPerturbation: 0.01,
  maxPerturbation: 0.5,
  minTestDuration: 20,
  maxTestDuration: 500,
  minImprovementThreshold: 0.01,
  maxImprovementThreshold: 0.3,
  minSelectionPressure: 0.1,
  maxSelectionPressure: 2.0,
};

// ─── State ──────────────────────────────────────────────────────

const strategies = new Map<string, MutationStrategy[]>();
const performance = new Map<string, StrategyPerformance[]>();
const nearMisses: NearMiss[] = [];
const transfers: StrategyTransfer[] = [];
let reflectionCounter = 0;

// ─── Default Strategies ─────────────────────────────────────────

function getDefaultStrategies(): MutationStrategy[] {
  return [
    {
      id: uid(),
      name: "Conservative",
      perturbationRange: 0.05,
      mutationsPerGeneration: 3,
      improvementThreshold: 0.03,
      testDuration: 100,
      selectionPressure: 0.5,
    },
    {
      id: uid(),
      name: "Balanced",
      perturbationRange: 0.15,
      mutationsPerGeneration: 5,
      improvementThreshold: 0.05,
      testDuration: 100,
      selectionPressure: 1.0,
    },
    {
      id: uid(),
      name: "Aggressive",
      perturbationRange: 0.30,
      mutationsPerGeneration: 8,
      improvementThreshold: 0.08,
      testDuration: 50,
      selectionPressure: 1.5,
    },
  ];
}

// ─── Strategy Management ────────────────────────────────────────

/** Get strategies for an engine (initializes defaults if needed) */
export function getStrategiesForEngine(engineName: string): MutationStrategy[] {
  let engineStrategies = strategies.get(engineName);
  if (!engineStrategies) {
    engineStrategies = getDefaultStrategies();
    strategies.set(engineName, engineStrategies);
  }
  return engineStrategies;
}

/** Select the best-performing strategy for an engine */
export function selectBestStrategy(engineName: string): MutationStrategy {
  const engineStrategies = getStrategiesForEngine(engineName);
  const perf = performance.get(engineName) ?? [];

  let bestStrategy = engineStrategies[0];
  let bestEffectiveness = -1;

  for (const strategy of engineStrategies) {
    const record = perf.find(p => p.strategyId === strategy.id);
    const effectiveness = record?.effectiveness ?? 0.5; // Untested = neutral
    if (effectiveness > bestEffectiveness) {
      bestEffectiveness = effectiveness;
      bestStrategy = strategy;
    }
  }

  return bestStrategy;
}

/** Record the outcome of a mutation produced by a strategy */
export function recordMutationOutcome(
  engineName: string,
  strategyId: string,
  accepted: boolean,
  improvement: number,
  threshold: number,
  paramName: string,
  tick: number,
): void {
  let perfs = performance.get(engineName);
  if (!perfs) {
    perfs = [];
    performance.set(engineName, perfs);
  }

  let record = perfs.find(p => p.strategyId === strategyId);
  if (!record) {
    record = {
      strategyId,
      engineName,
      totalMutationsGenerated: 0,
      acceptedMutations: 0,
      rejectedMutations: 0,
      avgImprovement: 0,
      effectiveness: 0.5,
      lastUsedAt: tick,
    };
    perfs.push(record);
  }

  record.totalMutationsGenerated++;
  record.lastUsedAt = tick;

  if (accepted) {
    record.acceptedMutations++;
    // Running average of improvement
    record.avgImprovement =
      (record.avgImprovement * (record.acceptedMutations - 1) + improvement) /
      record.acceptedMutations;
  } else {
    record.rejectedMutations++;

    // Track near-misses for failure archaeology
    if (improvement > threshold * 0.7) { // Within 30% of threshold
      nearMisses.push({ strategyId, engineName, improvement, threshold, paramName, tick });
      if (nearMisses.length > MAX_NEAR_MISSES) {
        nearMisses.shift();
      }
    }
  }

  // Recalculate effectiveness
  const acceptRate = record.acceptedMutations / Math.max(1, record.totalMutationsGenerated);
  record.effectiveness = acceptRate * (1 + record.avgImprovement);
}

// ─── Strategy Evolution ─────────────────────────────────────────

/** Evolve strategies by mutating the best and pruning the worst.
 *  Called periodically (every REFLECTION_INTERVAL meta-generations). */
export function evolveStrategies(engineName: string): {
  evolved: string[];
  pruned: string[];
} {
  reflectionCounter++;
  if (reflectionCounter % REFLECTION_INTERVAL !== 0) {
    return { evolved: [], pruned: [] };
  }

  const engineStrategies = getStrategiesForEngine(engineName);
  const perfs = performance.get(engineName) ?? [];
  const evolved: string[] = [];
  const pruned: string[] = [];

  // Find best and worst
  const sorted = [...engineStrategies].toSorted((a, b) => {
    const aPerf = perfs.find(p => p.strategyId === a.id)?.effectiveness ?? 0.5;
    const bPerf = perfs.find(p => p.strategyId === b.id)?.effectiveness ?? 0.5;
    return bPerf - aPerf;
  });

  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  // Analyze near-misses to inform new strategy
  const engineNearMisses = nearMisses.filter(nm => nm.engineName === engineName);
  const avgNearMissGap = engineNearMisses.length > 0
    ? engineNearMisses.reduce((s, nm) => s + (nm.threshold - nm.improvement), 0) / engineNearMisses.length
    : 0;

  // Generate evolved strategy from best
  if (best && engineStrategies.length < MAX_STRATEGIES) {
    const child: MutationStrategy = {
      id: uid(),
      name: `${best.name}-evo${reflectionCounter}`,
      perturbationRange: clamp(
        best.perturbationRange * (1 + (Math.random() * 0.4 - 0.2)),
        HARD_LIMITS.minPerturbation,
        HARD_LIMITS.maxPerturbation,
      ),
      mutationsPerGeneration: Math.max(1, Math.round(
        best.mutationsPerGeneration + (Math.random() * 4 - 2),
      )),
      improvementThreshold: clamp(
        // If near-misses suggest threshold is too high, lower it
        avgNearMissGap > 0
          ? best.improvementThreshold - avgNearMissGap * 0.5
          : best.improvementThreshold * (1 + (Math.random() * 0.3 - 0.15)),
        HARD_LIMITS.minImprovementThreshold,
        HARD_LIMITS.maxImprovementThreshold,
      ),
      testDuration: clamp(
        Math.round(best.testDuration * (1 + (Math.random() * 0.3 - 0.15))),
        HARD_LIMITS.minTestDuration,
        HARD_LIMITS.maxTestDuration,
      ),
      selectionPressure: clamp(
        best.selectionPressure * (1 + (Math.random() * 0.2 - 0.1)),
        HARD_LIMITS.minSelectionPressure,
        HARD_LIMITS.maxSelectionPressure,
      ),
    };

    engineStrategies.push(child);
    evolved.push(child.name);
  }

  // Prune worst strategy (if it has enough data and is underperforming)
  const worstPerf = perfs.find(p => p.strategyId === worst?.id);
  if (
    worst &&
    worstPerf &&
    worstPerf.totalMutationsGenerated >= 10 &&
    worstPerf.effectiveness < 0.2 &&
    engineStrategies.length > 2 // Keep at least 2 strategies
  ) {
    const idx = engineStrategies.indexOf(worst);
    if (idx >= 0) {
      engineStrategies.splice(idx, 1);
      pruned.push(worst.name);
    }
  }

  return { evolved, pruned };
}

// ─── Cross-Engine Strategy Transfer ─────────────────────────────

/** Transfer a successful strategy from one engine to another */
export function proposeStrategyTransfer(
  fromEngine: string,
  toEngine: string,
): StrategyTransfer | null {
  const best = selectBestStrategy(fromEngine);
  const perf = (performance.get(fromEngine) ?? [])
    .find(p => p.strategyId === best.id);

  if (!perf || perf.effectiveness < 0.6) {
    return null; // Only transfer proven strategies
  }

  // Check if target already has a similar strategy
  const targetStrategies = getStrategiesForEngine(toEngine);
  const hasSimilar = targetStrategies.some(s =>
    Math.abs(s.perturbationRange - best.perturbationRange) < 0.02 &&
    Math.abs(s.improvementThreshold - best.improvementThreshold) < 0.01,
  );
  if (hasSimilar) { return null; }

  const transfer: StrategyTransfer = {
    id: uid(),
    fromEngine,
    toEngine,
    strategy: { ...best, id: uid(), name: `${best.name}-transfer-${fromEngine}` },
    sourceEffectiveness: perf.effectiveness,
    targetEffectiveness: null,
    status: "proposed",
    transferredAt: Date.now(),
  };

  // Apply the transfer
  targetStrategies.push(transfer.strategy);
  transfer.status = "testing";
  transfers.push(transfer);

  return transfer;
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getReflectiveMetaLearnerDiagnostics(): {
  totalStrategies: number;
  totalEngines: number;
  reflectionCount: number;
  nearMissCount: number;
  transfers: number;
  topStrategies: Array<{ engine: string; name: string; effectiveness: number }>;
} {
  const topStrategies: Array<{ engine: string; name: string; effectiveness: number }> = [];

  for (const [engine, engineStrategies] of strategies) {
    const perfs = performance.get(engine) ?? [];
    for (const strategy of engineStrategies) {
      const perf = perfs.find(p => p.strategyId === strategy.id);
      topStrategies.push({
        engine,
        name: strategy.name,
        effectiveness: perf?.effectiveness ?? 0.5,
      });
    }
  }

  const sortedStrategies = topStrategies.toSorted((a, b) => b.effectiveness - a.effectiveness);

  let totalStrategies = 0;
  for (const s of strategies.values()) { totalStrategies += s.length; }

  return {
    totalStrategies,
    totalEngines: strategies.size,
    reflectionCount: reflectionCounter,
    nearMissCount: nearMisses.length,
    transfers: transfers.length,
    topStrategies: sortedStrategies.slice(0, 10),
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
