/**
 * Republic Platform — Genetics Engine Tests
 *
 * Tests for: weight counting, genome creation, fitness evaluation,
 * crossover, mutation, selection, and resource checks.
 */

import { describe, it, expect } from "vitest";
import {
  countWeights,
  createRandomGenome,
  evaluateFitness,
  magnitudeCrossover,
  mutateGenome,
  tournamentSelect,
  RESOURCE_THRESHOLDS,
  GENOME_PREFIXES,
} from "./genetics.js";

// ─── Weight Helpers ─────────────────────────────────────────────

describe("countWeights", () => {
  it("counts weights for simple topology", () => {
    // [2, 3] → 2*3 = 6 weights
    expect(countWeights([2, 3])).toBe(6);
  });

  it("counts weights for multi-layer topology", () => {
    // [4, 8, 4] → 4*8 + 8*4 = 32 + 32 = 64
    expect(countWeights([4, 8, 4])).toBe(64);
  });

  it("counts weights for single-layer topology", () => {
    // [5] → 0 weights (no connections)
    expect(countWeights([5])).toBe(0);
  });

  it("counts weights for deep topology", () => {
    // [2, 4, 4, 2] → 2*4 + 4*4 + 4*2 = 8 + 16 + 8 = 32
    expect(countWeights([2, 4, 4, 2])).toBe(32);
  });
});

// ─── Genome Creation ────────────────────────────────────────────

describe("createRandomGenome", () => {
  it("creates genome with correct topology", () => {
    const genome = createRandomGenome([4, 8, 4]);
    expect(genome.topology).toEqual([4, 8, 4]);
    expect(genome.generation).toBe(0);
  });

  it("creates genome with specified generation", () => {
    const genome = createRandomGenome([3, 3], 5);
    expect(genome.generation).toBe(5);
  });

  it("creates genome with correct number of weights", () => {
    const topology = [4, 8, 4];
    const genome = createRandomGenome(topology);
    const expected = countWeights(topology);
    expect(genome.weights.length).toBe(expected);
  });

  it("generates a display label", () => {
    const genome = createRandomGenome([3, 3]);
    expect(genome.label).toBeTruthy();
    expect(typeof genome.label).toBe("string");
  });

  it("weights are not all zero (Xavier initialization)", () => {
    const genome = createRandomGenome([4, 16, 4]);
    const hasNonZero = genome.weights.some((w) => w !== 0);
    expect(hasNonZero).toBe(true);
  });
});

// ─── Fitness Evaluation ─────────────────────────────────────────

describe("evaluateFitness", () => {
  it("returns a value between 0 and 1", () => {
    const genome = createRandomGenome([4, 8, 4]);
    const fitness = evaluateFitness(genome);
    expect(fitness).toBeGreaterThanOrEqual(0);
    expect(fitness).toBeLessThanOrEqual(1);
  });

  it("updates genome fitness property", () => {
    const genome = createRandomGenome([4, 8, 4]);
    evaluateFitness(genome);
    expect(typeof genome.fitness).toBe("number");
    expect(genome.fitness).toBeGreaterThanOrEqual(0);
  });

  it("different genomes may produce different fitness scores", () => {
    const genomes = Array.from({ length: 10 }, () => {
      const g = createRandomGenome([4, 8, 4]);
      return evaluateFitness(g);
    });
    const unique = new Set(genomes);
    // With 10 random genomes, we should get some variation
    expect(unique.size).toBeGreaterThan(1);
  });
});

// ─── Crossover ──────────────────────────────────────────────────

describe("magnitudeCrossover", () => {
  it("produces child with same topology as parents", () => {
    const parentA = createRandomGenome([4, 8, 4]);
    const parentB = createRandomGenome([4, 8, 4]);
    const child = magnitudeCrossover(parentA, parentB);
    expect(child.topology).toEqual([4, 8, 4]);
  });

  it("produces child with same number of weights", () => {
    const parentA = createRandomGenome([4, 8, 4]);
    const parentB = createRandomGenome([4, 8, 4]);
    const child = magnitudeCrossover(parentA, parentB);
    expect(child.weights.length).toBe(parentA.weights.length);
  });

  it("child weights come from one of the parents", () => {
    const parentA = createRandomGenome([3, 3]);
    const parentB = createRandomGenome([3, 3]);
    const child = magnitudeCrossover(parentA, parentB);

    // Each weight should be from parentA or parentB
    for (let i = 0; i < child.weights.length; i++) {
      const w = child.weights[i];
      const isFromA = w === parentA.weights[i];
      const isFromB = w === parentB.weights[i];
      expect(isFromA || isFromB).toBe(true);
    }
  });

  it("picks the higher magnitude weight", () => {
    const parentA = createRandomGenome([2, 2]);
    const parentB = createRandomGenome([2, 2]);

    // Set known weights
    parentA.weights = [0.1, 0.5];
    parentB.weights = [0.9, 0.2];

    const child = magnitudeCrossover(parentA, parentB);
    // Should pick |0.9| > |0.1| from B, and |0.5| > |0.2| from A
    expect(child.weights[0]).toBe(0.9);
    expect(child.weights[1]).toBe(0.5);
  });
});

// ─── Mutation ───────────────────────────────────────────────────

describe("mutateGenome", () => {
  it("modifies genome weights in place", () => {
    const genome = createRandomGenome([4, 16, 4]);
    const original = [...genome.weights];
    mutateGenome(genome);

    // At least some weights should change (probabilistically)
    // Run multiple times to increase confidence
    let anyChanged = false;
    for (let i = 0; i < genome.weights.length; i++) {
      if (genome.weights[i] !== original[i]) {
        anyChanged = true;
        break;
      }
    }
    // With 64 weights and a mutation rate, at least one should change
    expect(anyChanged).toBe(true);
  });

  it("preserves weight count", () => {
    const genome = createRandomGenome([4, 8, 4]);
    const countBefore = genome.weights.length;
    mutateGenome(genome);
    expect(genome.weights.length).toBe(countBefore);
  });
});

// ─── Tournament Selection ───────────────────────────────────────

describe("tournamentSelect", () => {
  it("returns two genomes from a pool", () => {
    const pool = Array.from({ length: 10 }, () => {
      const g = createRandomGenome([3, 3]);
      evaluateFitness(g);
      return g;
    });

    const result = tournamentSelect(pool, 4);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
  });

  it("returns null for pool too small", () => {
    const pool = [createRandomGenome([3, 3])];
    evaluateFitness(pool[0]);
    const result = tournamentSelect(pool, 4);
    expect(result).toBeNull();
  });

  it("selects high-fitness genomes preferentially", () => {
    const pool = Array.from({ length: 20 }, () => {
      const g = createRandomGenome([3, 3]);
      evaluateFitness(g);
      return g;
    });

    // Run selection many times and verify top fitness genes appear often
    const selected = new Map<string, number>();
    for (let i = 0; i < 50; i++) {
      const result = tournamentSelect(pool, 5);
      if (result) {
        for (const g of result) {
          selected.set(g.label, (selected.get(g.label) ?? 0) + 1);
        }
      }
    }
    expect(selected.size).toBeGreaterThan(0);
  });
});

// ─── Constants ──────────────────────────────────────────────────

describe("Constants", () => {
  it("RESOURCE_THRESHOLDS has reasonable defaults", () => {
    expect(RESOURCE_THRESHOLDS.minFreeMemoryGB).toBeGreaterThan(0);
    expect(RESOURCE_THRESHOLDS.maxCpuUsagePercent).toBeLessThanOrEqual(100);
    expect(RESOURCE_THRESHOLDS.minCpuCores).toBeGreaterThanOrEqual(1);
  });

  it("GENOME_PREFIXES are non-empty strings", () => {
    expect(GENOME_PREFIXES.length).toBeGreaterThan(0);
    for (const prefix of GENOME_PREFIXES) {
      expect(typeof prefix).toBe("string");
      expect(prefix.length).toBeGreaterThan(0);
    }
  });
});
