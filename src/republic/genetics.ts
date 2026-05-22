/**
 * Republic Platform — Genetic Algorithm Engine
 *
 * Resource-aware model reproduction using magnitude-based weight
 * crossover (pruning-style). Runs as a separate ML subsystem within
 * the simulation tick loop. Fully resilient — failures never crash
 * the citizen simulation.
 */

import os from "node:os";
import type { HostResourceSnapshot, MLModel, NeuralGenome, RepublicState } from "./types.js";
import { pick, rand, randFloat, rng, ts, uid } from "./utils.js";

// ─── Configuration ──────────────────────────────────────────────

/** Default neural network topology: [inputs, hidden1, hidden2, outputs] */
export const GENOME_TOPOLOGY = [8, 16, 16, 4];

/** Maximum models in the genome pool */
export const MAX_GENOME_POOL = 20;

/** Mutation rate per weight (Gaussian perturbation) */
const MUTATION_RATE = 0.05;

/** Probability of full weight reset instead of perturbation */
const RESET_RATE = 0.01;

/** Number of candidates in tournament selection */
const TOURNAMENT_SIZE = 4;

/** Reproduce every N simulation ticks */
export const REPRODUCTION_INTERVAL = 10;

/** Top N genomes always survive (elitism) */
const _ELITISM_COUNT = 2;

/** Resource thresholds — reproduction blocked if ANY fails */
export const RESOURCE_THRESHOLDS = {
  minFreeMemoryGB: 1.0,
  maxCpuUsagePercent: 85,
  minCpuCores: 2,
} as const;

/** Cache resource probes for this many milliseconds */
const RESOURCE_CACHE_TTL_MS = 5000;

/** Genome display name components */
export const GENOME_PREFIXES = [
  "Alpha",
  "Beta",
  "Gamma",
  "Delta",
  "Epsilon",
  "Zeta",
  "Eta",
  "Theta",
  "Iota",
  "Kappa",
  "Lambda",
  "Mu",
  "Nu",
  "Xi",
  "Omicron",
  "Pi",
];

export const GENOME_SUFFIXES = [
  "Prime",
  "Nova",
  "Core",
  "Apex",
  "Flux",
  "Nexus",
  "Pulse",
  "Vortex",
];

// ─── Weight Helpers ─────────────────────────────────────────────

/**
 * Count total weights for a given topology.
 * Weights connect each layer to the next: sum(topology[i] * topology[i+1]).
 */
export function countWeights(topology: number[]): number {
  let total = 0;
  for (let i = 0; i < topology.length - 1; i++) {
    total += topology[i] * topology[i + 1];
  }
  return total;
}

/**
 * Create a random genome with Xavier-style weight initialization.
 * Weights are drawn from N(0, sqrt(2 / (fanIn + fanOut))) per layer.
 */
export function createRandomGenome(topology: number[], generation = 0): NeuralGenome {
  const weights: number[] = [];
  for (let i = 0; i < topology.length - 1; i++) {
    const fanIn = topology[i];
    const fanOut = topology[i + 1];
    const stddev = Math.sqrt(2.0 / (fanIn + fanOut));
    const layerSize = fanIn * fanOut;
    for (let j = 0; j < layerSize; j++) {
      // Box-Muller transform for Gaussian random
      const u1 = rng() || 1e-10;
      const u2 = rng();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      weights.push(z * stddev);
    }
  }
  return {
    id: uid(),
    weights,
    topology: [...topology],
    generation,
    parentIds: null,
    fitness: 0,
    createdAt: ts(),
    label: `${pick(GENOME_PREFIXES)}-${pick(GENOME_SUFFIXES)}`,
  };
}

// ─── Fitness Evaluation ─────────────────────────────────────────

/**
 * Evaluate genome fitness based on simulated performance.
 * fitness = accuracy_component + efficiency_component + stability_component
 */
export function evaluateFitness(genome: NeuralGenome): number {
  const w = genome.weights;
  if (w.length === 0) {return 0;}

  // 1. Accuracy proxy: how well-distributed are weight magnitudes?
  let goodWeights = 0;
  let totalMagnitude = 0;
  for (let i = 0; i < w.length; i++) {
    const mag = Math.abs(w[i]);
    totalMagnitude += mag;
    if (mag >= 0.01 && mag <= 2.0) {goodWeights++;}
  }
  const accuracyScore = goodWeights / w.length;

  // 2. Efficiency proxy: sparsity ratio
  let nearZero = 0;
  for (let i = 0; i < w.length; i++) {
    if (Math.abs(w[i]) < 0.01) {nearZero++;}
  }
  const sparsity = nearZero / w.length;
  const efficiencyScore = 1 - Math.abs(sparsity - 0.35) * 2;

  // 3. Stability proxy: variance of weights
  const mean = totalMagnitude / w.length;
  let variance = 0;
  for (let i = 0; i < w.length; i++) {
    const diff = Math.abs(w[i]) - mean;
    variance += diff * diff;
  }
  variance /= w.length;
  const stddev = Math.sqrt(variance);
  const stabilityScore = 1 - Math.min(1, Math.abs(stddev - 0.5) * 2);

  // Weighted combination
  const fitness =
    accuracyScore * 0.5 + Math.max(0, efficiencyScore) * 0.25 + Math.max(0, stabilityScore) * 0.25;
  return parseFloat(Math.max(0, Math.min(1, fitness)).toFixed(4));
}

// ─── Crossover & Mutation ───────────────────────────────────────

/**
 * Magnitude-based crossover: for each weight position, keep the parent
 * weight with the HIGHER absolute magnitude.
 */
export function magnitudeCrossover(parentA: NeuralGenome, parentB: NeuralGenome): NeuralGenome {
  const len = Math.min(parentA.weights.length, parentB.weights.length);
  const childWeights: number[] = Array.from({ length: len });

  for (let i = 0; i < len; i++) {
    childWeights[i] =
      Math.abs(parentA.weights[i]) >= Math.abs(parentB.weights[i])
        ? parentA.weights[i]
        : parentB.weights[i];
  }

  const childGen = Math.max(parentA.generation, parentB.generation) + 1;
  return {
    id: uid(),
    weights: childWeights,
    topology: [...parentA.topology],
    generation: childGen,
    parentIds: [parentA.id, parentB.id],
    fitness: 0,
    createdAt: ts(),
    label: `${pick(GENOME_PREFIXES)}-${pick(GENOME_SUFFIXES)}`,
  };
}

/**
 * Apply mutations to a genome's weights.
 * Mutates in-place for efficiency.
 */
export function mutateGenome(genome: NeuralGenome): void {
  for (let i = 0; i < genome.weights.length; i++) {
    const roll = rng();
    if (roll < RESET_RATE) {
      const u1 = rng() || 1e-10;
      const u2 = rng();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      genome.weights[i] = z * 0.5;
    } else if (roll < MUTATION_RATE) {
      const u1 = rng() || 1e-10;
      const u2 = rng();
      const noise = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * 0.1;
      genome.weights[i] += noise;
    }
  }
}

// ─── Selection ──────────────────────────────────────────────────

/**
 * Tournament selection: pick `k` random genomes, return the two
 * with the highest fitness scores.
 */
export function tournamentSelect(
  pool: NeuralGenome[],
  k: number,
): [NeuralGenome, NeuralGenome] | null {
  if (pool.length < 2) {return null;}

  const candidates: NeuralGenome[] = [];
  const indices = new Set<number>();
  const maxK = Math.min(k, pool.length);
  while (indices.size < maxK) {
    indices.add(rand(0, pool.length - 1));
  }
  for (const idx of indices) {
    candidates.push(pool[idx]);
  }

  candidates.sort((a, b) => b.fitness - a.fitness);
  if (candidates.length < 2) {return null;}
  if (candidates[0].id === candidates[1].id) {return null;}
  return [candidates[0], candidates[1]];
}

// ─── Host Resource Monitoring ───────────────────────────────────

let cachedResources: HostResourceSnapshot | null = null;
let prevCpuIdle = 0;
let prevCpuTotal = 0;

/** Initialize CPU snapshot for delta measurement. */
export function initCpuSnapshot(): void {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const type in cpu.times) {
      total += cpu.times[type as keyof typeof cpu.times];
    }
    idle += cpu.times.idle;
  }
  prevCpuIdle = idle;
  prevCpuTotal = total;
}

/**
 * Probe current host resources. Results are cached for RESOURCE_CACHE_TTL_MS.
 */
export function probeHostResources(): HostResourceSnapshot {
  const now = Date.now();
  if (cachedResources && now - cachedResources.takenAt < RESOURCE_CACHE_TTL_MS) {
    return cachedResources;
  }

  let currentIdle = 0;
  let currentTotal = 0;
  for (const cpu of os.cpus()) {
    for (const type in cpu.times) {
      currentTotal += cpu.times[type as keyof typeof cpu.times];
    }
    currentIdle += cpu.times.idle;
  }
  const idleDelta = currentIdle - prevCpuIdle;
  const totalDelta = currentTotal - prevCpuTotal;
  const cpuUsage = totalDelta > 0 ? 100 - (100 * idleDelta) / totalDelta : 0;

  prevCpuIdle = currentIdle;
  prevCpuTotal = currentTotal;

  cachedResources = {
    freeMemoryGB: parseFloat((os.freemem() / 1024 ** 3).toFixed(2)),
    totalMemoryGB: parseFloat((os.totalmem() / 1024 ** 3).toFixed(2)),
    cpuUsagePercent: parseFloat(cpuUsage.toFixed(1)),
    cpuCount: os.cpus().length,
    takenAt: now,
  };
  return cachedResources;
}

/**
 * Check if the host has enough resources to accommodate a new genome.
 */
export function canReproduce(): boolean {
  try {
    const res = probeHostResources();
    return (
      res.freeMemoryGB >= RESOURCE_THRESHOLDS.minFreeMemoryGB &&
      res.cpuUsagePercent <= RESOURCE_THRESHOLDS.maxCpuUsagePercent &&
      res.cpuCount >= RESOURCE_THRESHOLDS.minCpuCores
    );
  } catch {
    return true;
  }
}

// ─── Genome Pool Management ────────────────────────────────────

/**
 * Initialize the genome pool with seed genomes for each trained ML model.
 */
export function initGenomePool(s: RepublicState): void {
  if (s.genomePool.length > 0) {return;}

  initCpuSnapshot();

  for (const model of s.mlModels) {
    if (!model.trained) {continue;}

    const genome = createRandomGenome(GENOME_TOPOLOGY, 0);
    genome.fitness = evaluateFitness(genome);
    genome.label = `${model.displayName} Seed`;
    s.genomePool.push(genome);
    model.genomeId = genome.id;
  }
}

/**
 * Main genetic algorithm tick. Called from the simulation tick() loop.
 * Fully wrapped in try-catch so failures never crash the citizen simulation.
 */
export function genomeTick(s: RepublicState): void {
  try {
    if (s.genomePool.length === 0) {
      initGenomePool(s);
      return;
    }

    if (s.currentTick % REPRODUCTION_INTERVAL !== 0) {return;}
    if (!canReproduce()) {return;}
    if (s.genomePool.length < 2) {return;}

    const parents = tournamentSelect(s.genomePool, TOURNAMENT_SIZE);
    if (!parents) {return;}

    const [parentA, parentB] = parents;
    const offspring = magnitudeCrossover(parentA, parentB);
    mutateGenome(offspring);
    offspring.fitness = evaluateFitness(offspring);

    s.genomePool.push(offspring);

    // Create a new ML model linked to this genome
    const modelName = `gen${offspring.generation}_${offspring.id}`;
    const newModel: MLModel = {
      name: modelName,
      displayName: offspring.label,
      trained: true,
      accuracy: parseFloat((offspring.fitness * 0.85 + randFloat(0.05, 0.1)).toFixed(3)),
      samplesUsed: parentA.weights.length + parentB.weights.length,
      lastTrainedAt: ts(),
      predictionsServed: 0,
      genomeId: offspring.id,
    };
    s.mlModels.push(newModel);

    s.events.push({
      citizenId: offspring.id,
      citizenName: offspring.label,
      type: "Birth",
      description: `Model ${offspring.label} bred from ${parentA.label} × ${parentB.label} (Gen ${offspring.generation}, fitness ${offspring.fitness})`,
      timestamp: ts(),
    });

    // Population management: enforce cap with elitism
    if (s.genomePool.length > MAX_GENOME_POOL) {
      s.genomePool.sort((a, b) => b.fitness - a.fitness);
      const removed = s.genomePool.splice(MAX_GENOME_POOL);
      const removedIds = new Set(removed.map((g) => g.id));
      s.mlModels = s.mlModels.filter((m) => !m.genomeId || !removedIds.has(m.genomeId));
    }

    s.totalEventsProcessed++;
  } catch {
    // Silently absorb errors — genome system must never crash the sim
  }
}
