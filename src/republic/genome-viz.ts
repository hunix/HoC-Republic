/**
 * Republic Platform — Genome Visualization Helpers
 *
 * Transforms raw NeuralGenome data into visualization-ready shapes
 * for the UI: network graphs, DNA strands, lineage trees, and
 * fitness landscape projections.
 */

import type { NeuralGenome, RepublicState } from "./types.js";

// ─── Types ──────────────────────────────────────────────────────

export interface NetworkNode {
  id: string;
  layer: number;
  index: number;
  label: string;
}

export interface NetworkEdge {
  source: string;
  target: string;
  weight: number;
  magnitude: number;
  layer: number;
}

export interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  topology: number[];
  totalWeights: number;
}

export interface DnaWeight {
  value: number;
  magnitude: number;
  sign: "positive" | "negative";
  layer: number;
  layerPosition: number;
  normalizedMagnitude: number;
}

export interface DnaStrand {
  genomeId: string;
  label: string;
  generation: number;
  fitness: number;
  weights: DnaWeight[];
  topology: number[];
  stats: {
    meanMagnitude: number;
    maxMagnitude: number;
    sparsity: number;
    variance: number;
  };
}

export interface LineageNode {
  id: string;
  label: string;
  generation: number;
  fitness: number;
  parentIds: string[] | null;
  childIds: string[];
  createdAt: string;
}

export interface LineageTree {
  nodes: LineageNode[];
  maxGeneration: number;
  rootIds: string[];
}

export interface FitnessLandscapePoint {
  genomeId: string;
  label: string;
  generation: number;
  fitness: number;
  weightMean: number;
  weightVariance: number;
}

export interface FitnessLandscape {
  points: FitnessLandscapePoint[];
  maxFitness: number;
  minFitness: number;
  maxGeneration: number;
}

// ─── Network Graph Builder ──────────────────────────────────────

/**
 * Build a force-directed graph representation of a genome's neural network.
 * Nodes represent neurons, edges represent weighted connections.
 */
export function buildNetworkGraph(genome: NeuralGenome): NetworkGraph {
  const nodes: NetworkNode[] = [];
  const edges: NetworkEdge[] = [];
  const { topology, weights } = genome;

  // Build nodes — one per neuron per layer
  for (let layer = 0; layer < topology.length; layer++) {
    const layerSize = topology[layer];
    const layerLabel =
      layer === 0 ? "Input" : layer === topology.length - 1 ? "Output" : `Hidden ${layer}`;
    for (let i = 0; i < layerSize; i++) {
      nodes.push({
        id: `L${layer}N${i}`,
        layer,
        index: i,
        label: `${layerLabel}[${i}]`,
      });
    }
  }

  // Build edges — one per weight connecting adjacent layers
  let weightIdx = 0;
  for (let layer = 0; layer < topology.length - 1; layer++) {
    const fromSize = topology[layer];
    const toSize = topology[layer + 1];
    for (let from = 0; from < fromSize; from++) {
      for (let to = 0; to < toSize; to++) {
        const w = weights[weightIdx] ?? 0;
        edges.push({
          source: `L${layer}N${from}`,
          target: `L${layer + 1}N${to}`,
          weight: w,
          magnitude: Math.abs(w),
          layer,
        });
        weightIdx++;
      }
    }
  }

  return { nodes, edges, topology: [...topology], totalWeights: weights.length };
}

// ─── DNA Strand Builder ─────────────────────────────────────────

/**
 * Encode genome weights as a "DNA strand" — sequential weight values
 * with per-weight metadata for double-helix rendering.
 */
export function buildDnaStrand(genome: NeuralGenome): DnaStrand {
  const { weights, topology } = genome;

  // Find max magnitude for normalization
  let maxMag = 0;
  let totalMag = 0;
  let nearZero = 0;
  for (const w of weights) {
    const mag = Math.abs(w);
    if (mag > maxMag) {
      maxMag = mag;
    }
    totalMag += mag;
    if (mag < 0.01) {
      nearZero++;
    }
  }
  const meanMag = weights.length > 0 ? totalMag / weights.length : 0;

  // Compute variance
  let variance = 0;
  for (const w of weights) {
    const diff = Math.abs(w) - meanMag;
    variance += diff * diff;
  }
  variance = weights.length > 0 ? variance / weights.length : 0;

  // Map each weight to a DnaWeight with layer/position info
  const dnaWeights: DnaWeight[] = [];
  let weightIdx = 0;
  for (let layer = 0; layer < topology.length - 1; layer++) {
    const layerSize = topology[layer] * topology[layer + 1];
    for (let pos = 0; pos < layerSize; pos++) {
      const value = weights[weightIdx] ?? 0;
      dnaWeights.push({
        value,
        magnitude: Math.abs(value),
        sign: value >= 0 ? "positive" : "negative",
        layer,
        layerPosition: pos,
        normalizedMagnitude: maxMag > 0 ? Math.abs(value) / maxMag : 0,
      });
      weightIdx++;
    }
  }

  return {
    genomeId: genome.id,
    label: genome.label,
    generation: genome.generation,
    fitness: genome.fitness,
    weights: dnaWeights,
    topology: [...topology],
    stats: {
      meanMagnitude: parseFloat(meanMag.toFixed(4)),
      maxMagnitude: parseFloat(maxMag.toFixed(4)),
      sparsity: weights.length > 0 ? parseFloat((nearZero / weights.length).toFixed(4)) : 0,
      variance: parseFloat(variance.toFixed(6)),
    },
  };
}

// ─── Lineage Tree Builder ───────────────────────────────────────

/**
 * Build a parent/child tree from the genome pool.
 */
export function buildLineageTree(pool: NeuralGenome[]): LineageTree {
  const idSet = new Set(pool.map((g) => g.id));
  const childMap = new Map<string, string[]>();

  // Initialize child lists
  for (const g of pool) {
    childMap.set(g.id, []);
  }

  // Build parent → child mapping
  for (const g of pool) {
    if (g.parentIds) {
      for (const pid of g.parentIds) {
        if (idSet.has(pid)) {
          childMap.get(pid)!.push(g.id);
        }
      }
    }
  }

  const rootIds = pool
    .filter((g) => !g.parentIds || g.parentIds.every((pid) => !idSet.has(pid)))
    .map((g) => g.id);

  const maxGeneration = pool.reduce((max, g) => Math.max(max, g.generation), 0);

  const nodes: LineageNode[] = pool.map((g) => ({
    id: g.id,
    label: g.label,
    generation: g.generation,
    fitness: g.fitness,
    parentIds: g.parentIds,
    childIds: childMap.get(g.id) ?? [],
    createdAt: g.createdAt,
  }));

  return { nodes, maxGeneration, rootIds };
}

// ─── Fitness Landscape Builder ──────────────────────────────────

/**
 * Project genome pool into a 2D fitness landscape.
 * X-axis: generation, Y-axis: fitness.
 * Includes weight statistics for tooltip data.
 */
export function buildFitnessLandscape(pool: NeuralGenome[]): FitnessLandscape {
  const points: FitnessLandscapePoint[] = pool.map((g) => {
    const mean =
      g.weights.length > 0 ? g.weights.reduce((s, w) => s + Math.abs(w), 0) / g.weights.length : 0;
    let variance = 0;
    if (g.weights.length > 0) {
      for (const w of g.weights) {
        const diff = Math.abs(w) - mean;
        variance += diff * diff;
      }
      variance /= g.weights.length;
    }
    return {
      genomeId: g.id,
      label: g.label,
      generation: g.generation,
      fitness: g.fitness,
      weightMean: parseFloat(mean.toFixed(4)),
      weightVariance: parseFloat(variance.toFixed(6)),
    };
  });

  const fitnesses = points.map((p) => p.fitness);
  return {
    points,
    maxFitness: fitnesses.length > 0 ? Math.max(...fitnesses) : 0,
    minFitness: fitnesses.length > 0 ? Math.min(...fitnesses) : 0,
    maxGeneration: points.reduce((max, p) => Math.max(max, p.generation), 0),
  };
}

// ─── Citizen → Genome Lookup ────────────────────────────────────

/**
 * Find the genome linked to a citizen (if any).
 * Maps citizen index to genome pool position (round-robin).
 */
export function findCitizenGenome(s: RepublicState, citizenId: string): NeuralGenome | null {
  if (s.genomePool.length === 0) {
    return null;
  }
  const idx = s.citizens.findIndex((c) => c.id === citizenId);
  if (idx < 0) {
    return null;
  }
  return s.genomePool[idx % s.genomePool.length];
}
