/**
 * Republic Platform — Enhanced Genetic Operators
 *
 * Extends the base genetics.ts engine with:
 *
 *   1. Multi-parent Decuple Crossover Scheme (DCS)
 *      Inspired by: Decuple Crossover Scheme research (2026)
 *      - Selects k parents weighted by fitness
 *      - Gene-scanning: for each weight locus, randomly picks from a parent
 *      - Offspring undergoes k additional recombinations with original parents
 *      - Best 2 survivors are returned
 *
 *   2. Adaptive Mutation Rate
 *      - Tracks population diversity (avg Hamming distance over weight vectors)
 *      - Low diversity  → burst mutation rate ×3 (exploration)
 *      - High diversity → reduced mutation rate ×0.3 (exploitation)
 *
 *   3. Speciation
 *      - Groups genomes into species by Euclidean genome distance
 *      - Selection pressure applied per species first to prevent monoculture
 *
 *   4. Genetic Memory
 *      - Top 1% strategies encoded into "frozen" (protected) weight loci
 *      - Frozen weights survive mutation unchanged → epigenetic inheritance
 */

import type { NeuralGenome } from "./types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { GENOME_PREFIXES, GENOME_SUFFIXES, countWeights } from "./genetics.js";
import { uid, pick, rng, ts } from "./utils.js";

const logger = createSubsystemLogger("republic:genetics-enhanced");

// ─── 1. Multi-Parent Decuple Crossover Scheme ──────────────────────

/**
 * Gene-scanning crossover: for each weight locus, randomly select
 * from one of the k parents (uniform distribution).
 */
function geneScanCrossover(parents: NeuralGenome[]): NeuralGenome {
  const len = Math.min(...parents.map((p) => p.weights.length));
  const childWeights = Array.from<number>({ length: len });
  const k = parents.length;

  for (let i = 0; i < len; i++) {
    const parentIdx = Math.floor(rng() * k);
    childWeights[i] = parents[parentIdx].weights[i];
  }

  const maxGen = Math.max(...parents.map((p) => p.generation));
  return {
    id: uid(),
    weights: childWeights,
    topology: [...parents[0].topology],
    generation: maxGen + 1,
    parentIds: (parents.length >= 2 ? [parents[0].id, parents[1].id] : null) as
      | [string, string]
      | null,
    fitness: 0,
    createdAt: ts(),
    label: `${pick(GENOME_PREFIXES)}-${pick(GENOME_SUFFIXES)}`,
  };
}

/**
 * Decuple Crossover Scheme (DCS):
 *   1. Select k parents weighted by fitness (softmax probability)
 *   2. Create offspring via gene-scanning crossover
 *   3. Recombine offspring with each original parent in turn
 *   4. Evaluate all candidates, return the best 2
 *
 * @param pool  Full genome pool
 * @param k     Number of parents (default 3, recommended 2–5)
 */
export function decupleCrossover(pool: NeuralGenome[], k = 3): NeuralGenome {
  if (pool.length < 2) {
    throw new Error("decupleCrossover requires at least 2 genomes in pool");
  }

  // Step 1: Fitness-weighted parent selection (softmax)
  const totalFitness = pool.reduce((s, g) => s + Math.max(0.001, g.fitness), 0);
  const parents: NeuralGenome[] = [];
  const selectedIds = new Set<string>();

  const kClamped = Math.min(k, pool.length);
  let attempts = 0;
  while (parents.length < kClamped && attempts < pool.length * 3) {
    attempts++;
    const r = rng() * totalFitness;
    let cumulative = 0;
    for (const genome of pool) {
      cumulative += Math.max(0.001, genome.fitness);
      if (cumulative >= r && !selectedIds.has(genome.id)) {
        parents.push(genome);
        selectedIds.add(genome.id);
        break;
      }
    }
  }

  if (parents.length < 2) {
    // Fallback: just pick 2 at random
    parents.length = 0;
    const shuffled = [...pool].toSorted(() => rng() - 0.5);
    if (shuffled.length >= 2) {
      parents.push(shuffled[0], shuffled[1]);
    }
  }

  // Step 2: Initial gene-scanning crossover
  let offspring = geneScanCrossover(parents);

  // Step 3: Recombine offspring with each original parent (DCS refinement)
  const candidates: NeuralGenome[] = [offspring];
  for (const parent of parents) {
    const recombined = geneScanCrossover([offspring, parent]);
    candidates.push(recombined);
  }

  // Step 4: Return best candidate (highest fitness proxy — weight magnitude score)
  const scored = candidates
    .map((g) => ({
      genome: g,
      score: fitnessProxy(g.weights),
    }))
    .toSorted((a, b) => b.score - a.score);
  offspring = scored[0].genome;
  offspring.fitness = scored[0].score;

  logger.debug(
    `DCS: ${kClamped} parents → fitness=${offspring.fitness.toFixed(4)} gen=${offspring.generation}`,
  );

  return offspring;
}

/** Quick fitness proxy based on weight magnitude distribution (no full eval needed) */
function fitnessProxy(weights: number[]): number {
  let good = 0;
  for (const w of weights) {
    const mag = Math.abs(w);
    if (mag >= 0.01 && mag <= 2.0) {
      good++;
    }
  }
  return weights.length > 0 ? good / weights.length : 0;
}

// ─── 2. Adaptive Mutation ──────────────────────────────────────────

export interface AdaptiveMutationState {
  currentRate: number;
  diversityScore: number;
  lastComputedAt: number;
}

/** Base mutation rate (mirroring genetics.ts MUTATION_RATE) */
export const BASE_MUTATION_RATE = 0.05;
const MIN_MUTATION_RATE = 0.005;
const MAX_MUTATION_RATE = 0.25;

/**
 * Compute genome-pool diversity as the average pairwise Hamming-style
 * distance between weight vectors (sampled, not O(n²)).
 *
 * Returns [0, 1] where 0 = all genomes identical, 1 = maximally diverse.
 */
export function computeDiversity(pool: NeuralGenome[], sampleSize = 10): number {
  if (pool.length < 2) {
    return 1.0;
  }

  const sample = pool.slice(0, sampleSize);
  let totalDist = 0;
  let pairs = 0;

  for (let i = 0; i < sample.length; i++) {
    for (let j = i + 1; j < sample.length; j++) {
      const a = sample[i].weights;
      const b = sample[j].weights;
      const len = Math.min(a.length, b.length);
      let dist = 0;
      for (let k = 0; k < len; k++) {
        dist += Math.abs(a[k] - b[k]) > 0.1 ? 1 : 0; // Hamming distance with threshold
      }
      totalDist += len > 0 ? dist / len : 0;
      pairs++;
    }
  }

  return pairs > 0 ? totalDist / pairs : 1.0;
}

/**
 * Compute adaptive mutation rate based on pool diversity.
 * - Low diversity (<0.15): burst to ×3 (explore)
 * - High diversity (>0.60): reduce to ×0.3 (exploit)
 */
export function adaptiveMutationRate(pool: NeuralGenome[]): AdaptiveMutationState {
  const diversity = computeDiversity(pool);

  let rate = BASE_MUTATION_RATE;
  if (diversity < 0.15) {
    rate = Math.min(MAX_MUTATION_RATE, BASE_MUTATION_RATE * 3);
  } else if (diversity > 0.6) {
    rate = Math.max(MIN_MUTATION_RATE, BASE_MUTATION_RATE * 0.3);
  }

  return {
    currentRate: parseFloat(rate.toFixed(4)),
    diversityScore: parseFloat(diversity.toFixed(4)),
    lastComputedAt: Date.now(),
  };
}

/**
 * Mutate genome with adaptive rate.
 * Frozen loci (from genetic memory) are skipped.
 */
export function adaptiveMutate(genome: NeuralGenome, rate: number, frozenLoci?: Set<number>): void {
  const RESET_RATE = 0.01;
  for (let i = 0; i < genome.weights.length; i++) {
    if (frozenLoci?.has(i)) {
      continue; // Frozen locus — epigenetic protection
    }
    const roll = rng();
    if (roll < RESET_RATE) {
      const u1 = rng() || 1e-10;
      const u2 = rng();
      genome.weights[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * 0.5;
    } else if (roll < rate) {
      const u1 = rng() || 1e-10;
      const u2 = rng();
      genome.weights[i] += Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * 0.1;
    }
  }
}

// ─── 3. Speciation ─────────────────────────────────────────────────

export interface Species {
  id: string;
  representativeId: string;
  memberIds: string[];
  avgFitness: number;
  generation: number;
}

const SPECIATION_THRESHOLD = 0.25; // Distance at which two genomes form separate species

/**
 * Euclidean distance between two genome weight vectors (normalised by length).
 */
export function genomeDistance(a: NeuralGenome, b: NeuralGenome): number {
  const len = Math.min(a.weights.length, b.weights.length);
  if (len === 0) {
    return 1.0;
  }
  let sumSq = 0;
  for (let i = 0; i < len; i++) {
    const diff = a.weights[i] - b.weights[i];
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / len);
}

/**
 * Cluster the genome pool into species using threshold-based nearest-representative.
 * O(n × species) — efficient for pools up to ~1000 genomes.
 */
export function clusterIntoSpecies(
  pool: NeuralGenome[],
  threshold = SPECIATION_THRESHOLD,
): Species[] {
  const representatives: NeuralGenome[] = [];
  const speciesMap = new Map<string, string[]>(); // repId → memberIds

  for (const genome of pool) {
    let assigned = false;
    for (const rep of representatives) {
      if (genomeDistance(genome, rep) < threshold) {
        speciesMap.get(rep.id)!.push(genome.id);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      representatives.push(genome);
      speciesMap.set(genome.id, [genome.id]);
    }
  }

  const poolMap = new Map(pool.map((g) => [g.id, g]));

  return representatives.map((rep) => {
    const memberIds = speciesMap.get(rep.id) ?? [];
    const members = memberIds.map((id) => poolMap.get(id)).filter(Boolean) as NeuralGenome[];
    const avgFitness =
      members.length > 0 ? members.reduce((s, g) => s + g.fitness, 0) / members.length : 0;

    return {
      id: `sp-${rep.id}`,
      representativeId: rep.id,
      memberIds,
      avgFitness: parseFloat(avgFitness.toFixed(4)),
      generation: rep.generation,
    };
  });
}

// ─── 4. Genetic Memory ─────────────────────────────────────────────

export interface SuccessfulStrategy {
  id: string;
  traitVector: number[]; // normalised weight snapshot (top 50 important weights)
  context: string; // description of the problem domain
  outcomeScore: number; // 0–1 quality score
  recordedAt: string;
  frozenLoci: number[]; // weight indices to protect from mutation
}

const geneticMemory: SuccessfulStrategy[] = [];
const MAX_GENETIC_MEMORY = 50;

/**
 * Encode a high-performing genome into genetic memory.
 * Extracts the top-N weight loci by magnitude as "frozen" epigenetic markers.
 */
export function encodeToGeneticMemory(
  genome: NeuralGenome,
  context: string,
  outcomeScore: number,
): SuccessfulStrategy {
  const weightCount = genome.weights.length;

  // Find top 10% weight loci by magnitude — these are "important" connections
  const indexed = genome.weights.map((w, i) => ({ i, mag: Math.abs(w) }));
  indexed.sort((a, b) => b.mag - a.mag);
  const frozenCount = Math.max(1, Math.floor(weightCount * 0.1));
  const frozenLoci = indexed.slice(0, frozenCount).map((x) => x.i);
  const traitVector = frozenLoci.map((i) => genome.weights[i]);

  const strategy: SuccessfulStrategy = {
    id: uid(),
    traitVector,
    context,
    outcomeScore,
    recordedAt: ts(),
    frozenLoci,
  };

  geneticMemory.push(strategy);
  if (geneticMemory.length > MAX_GENETIC_MEMORY) {
    // Evict lowest-scoring strategy
    geneticMemory.sort((a, b) => b.outcomeScore - a.outcomeScore);
    geneticMemory.length = MAX_GENETIC_MEMORY;
  }

  logger.debug(`Genetic memory: encoded strategy for "${context}" (score=${outcomeScore})`);
  return strategy;
}

/**
 * Retrieve the frozen loci set for a genome by checking if any
 * remembered strategies match its context.
 */
export function getFrozenLoci(context: string): Set<number> {
  const match = geneticMemory.find((s) => s.context === context);
  return match ? new Set(match.frozenLoci) : new Set();
}

export function getGeneticMemory(): SuccessfulStrategy[] {
  return [...geneticMemory];
}

// ─── Genome Topology Utilities ────────────────────────────────────

export { countWeights };
