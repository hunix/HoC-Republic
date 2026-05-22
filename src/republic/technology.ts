/**
 * Republic Platform — Technology Engine
 *
 * Manages Atlantis (crystals, scrolls, energy nodes),
 * ML models / genome subsystem, and Quantum (universes, timelines).
 */

import {
    canReproduce, countWeights, evaluateFitness,
    GENOME_TOPOLOGY, magnitudeCrossover, MAX_GENOME_POOL, mutateGenome, probeHostResources, REPRODUCTION_INTERVAL,
    RESOURCE_THRESHOLDS
} from "./genetics.js";
import type { RepublicState } from "./types.js";
import { avg, pick, rand, randFloat, ts, uid } from "./utils.js";

// ─── Simulation Tick Helpers ────────────────────────────────────

/** Drift quantum state each tick. */
export function quantumTick(s: RepublicState): void {
  for (const u of s.universes) {
    if (u.state === "Decaying") {
      u.coherence = Math.max(0, u.coherence - 0.001);
    } else if (u.state === "Superposition") {
      u.coherence += randFloat(-0.01, 0.01);
      u.coherence = Math.max(0, Math.min(1, u.coherence));
    }
    u.tickCount++;
  }
}

/**
 * Run ML models against real action log data each tick.
 * Each named model performs a specific heuristic analysis on the state.
 */
export function mlTick(s: RepublicState): void {
  const log = s.actionLog;
  if (log.length === 0) {return;}

  for (const m of s.mlModels) {
    if (!m.trained) {continue;}

    // Each model type analyses different data
    switch (m.name) {
      case "decision": {
        // Decision Engine: classify recent actions by outcome quality
        const recent = log.slice(-20);
        const successRate = recent.filter((a) => a.tier <= 1).length / Math.max(1, recent.length);
        m.accuracy = parseFloat((m.accuracy * 0.95 + successRate * 0.05).toFixed(4));
        m.predictionsServed++;
        s.totalPredictions++;
        break;
      }
      case "skill_prediction": {
        // Skill Predictor: track learning/research action frequency
        const learnActions = log.slice(-50).filter((a) => a.tool === "learn" || a.tool === "research");
        if (learnActions.length > 0) {
          const ratio = learnActions.length / 50;
          m.accuracy = parseFloat((m.accuracy * 0.9 + ratio * 0.1).toFixed(4));
          m.predictionsServed++;
          s.totalPredictions++;
        }
        break;
      }
      case "anomaly": {
        // Anomaly Detector: flag citizens with extreme stat deviation
        const avgEnergy = s.citizens.reduce((sum, c) => sum + c.energy, 0) / Math.max(1, s.citizens.length);
        const avgHealth = s.citizens.reduce((sum, c) => sum + c.health, 0) / Math.max(1, s.citizens.length);
        const outliers = s.citizens.filter(
          (c) => Math.abs(c.energy - avgEnergy) > 40 || Math.abs(c.health - avgHealth) > 40,
        );
        if (outliers.length > 0) {
          m.predictionsServed += outliers.length;
          s.totalPredictions += outliers.length;
        }
        break;
      }
      case "task_success": {
        // Task Forecaster: derive success rate from action completion data
        const actions = log.slice(-30);
        const workActions = actions.filter((a) => a.tool === "work" || a.tool === "research");
        if (workActions.length >= 3) {
          const successRatio = workActions.length / Math.max(1, actions.length);
          m.accuracy = parseFloat((successRatio * 0.8 + 0.1).toFixed(4));
          m.samplesUsed += workActions.length;
          m.trained = true;
          m.lastTrainedAt = ts();
          m.predictionsServed++;
          s.totalPredictions++;
        }
        break;
      }
      case "relationship": {
        // Relationship Graph: analyse social action patterns
        const socialActions = log.slice(-40).filter((a) => a.tool === "socialize" || a.tool === "speak" || a.tool === "trade");
        if (socialActions.length > 0) {
          m.predictionsServed += socialActions.length;
          s.totalPredictions += socialActions.length;
          m.accuracy = parseFloat((m.accuracy * 0.92 + (socialActions.length / 40) * 0.08).toFixed(4));
        }
        break;
      }
      default: {
        // Genome-derived models: generic accuracy drift based on fitness
        if (m.genomeId) {
          const genome = s.genomePool.find((g) => g.id === m.genomeId);
          if (genome) {
            m.accuracy = parseFloat((genome.fitness * 0.85 + (countWeights(GENOME_TOPOLOGY) % 100) / 1000).toFixed(4));
            m.predictionsServed++;
            s.totalPredictions++;
          }
        }
        break;
      }
    }
  }
}

// ─── ML Prediction API ──────────────────────────────────────────

export interface PredictionResult {
  model: string;
  prediction: string;
  confidence: number;
  details: Record<string, unknown>;
}

/**
 * Run a prediction using a specific ML model.
 * Called by ML-powered agent tools (predict, recommend, analyze).
 */
export function runPrediction(
  s: RepublicState,
  modelName: string,
  input: { citizenId?: string; topic?: string },
): PredictionResult | null {
  const model = s.mlModels.find((m) => m.name === modelName);
  if (!model || !model.trained) {return null;}

  model.predictionsServed++;
  s.totalPredictions++;

  const citizen = input.citizenId
    ? s.citizens.find((c) => c.id === input.citizenId)
    : undefined;

  switch (modelName) {
    case "decision": {
      // Predict best action for a citizen
      if (!citizen) {return null;}
      const bestAction = citizen.energy < 30 ? "rest"
        : citizen.happiness < 40 ? "socialize"
        : citizen.credits < 100 ? "work"
        : citizen.skillCount < 5 ? "learn"
        : "research";
      return {
        model: "Decision Engine",
        prediction: bestAction,
        confidence: model.accuracy,
        details: { energy: citizen.energy, happiness: citizen.happiness, credits: citizen.credits },
      };
    }
    case "skill_prediction": {
      // Predict next skill based on specialization and action history
      if (!citizen) {return null;}
      const history = citizen.actionHistory ?? [];
      const recentLearning = history
        .filter((a) => a.tool === "learn" || a.tool === "research")
        .slice(-5);
      const trend = recentLearning.length >= 3 ? "accelerating" : "steady";
      return {
        model: "Skill Predictor",
        prediction: `Next skill gain in ~${Math.max(1, 5 - recentLearning.length)} ticks`,
        confidence: model.accuracy,
        details: { recentLearns: recentLearning.length, trend, specialization: citizen.specialization },
      };
    }
    case "anomaly": {
      // Check if a citizen has abnormal stats
      if (!citizen) {return null;}
      const avgEnergy = s.citizens.reduce((sum, c) => sum + c.energy, 0) / Math.max(1, s.citizens.length);
      const avgHealth = s.citizens.reduce((sum, c) => sum + c.health, 0) / Math.max(1, s.citizens.length);
      const energyDev = Math.abs(citizen.energy - avgEnergy);
      const healthDev = Math.abs(citizen.health - avgHealth);
      const isAnomaly = energyDev > 30 || healthDev > 30;
      return {
        model: "Anomaly Detector",
        prediction: isAnomaly ? "ANOMALY DETECTED" : "Normal",
        confidence: model.accuracy,
        details: { energyDeviation: parseFloat(energyDev.toFixed(1)), healthDeviation: parseFloat(healthDev.toFixed(1)), threshold: 30 },
      };
    }
    case "task_success": {
      // Predict if a task will succeed
      const topic = input.topic ?? "general";
      const relevantActions = s.actionLog.filter((a) => a.tool === "work" || a.tool === "research").slice(-20);
      const successRate = relevantActions.length > 0 ? relevantActions.length / 20 : 0.5;
      return {
        model: "Task Forecaster",
        prediction: successRate > 0.6 ? "LIKELY SUCCESS" : successRate > 0.3 ? "UNCERTAIN" : "LIKELY FAILURE",
        confidence: model.accuracy,
        details: { topic, historicalRate: parseFloat(successRate.toFixed(3)), sampleSize: relevantActions.length },
      };
    }
    case "relationship": {
      // Predict relationship strength
      if (!citizen) {return null;}
      const history = citizen.actionHistory ?? [];
      const socialActions = history
        .filter((a) => a.tool === "socialize" || a.tool === "speak")
        .slice(-10);
      const socialScore = socialActions.length / 10;
      return {
        model: "Relationship Graph",
        prediction: socialScore > 0.5 ? "HIGH social activity" : socialScore > 0.2 ? "MODERATE" : "LOW",
        confidence: model.accuracy,
        details: { recentSocialActions: socialActions.length, socialScore: parseFloat(socialScore.toFixed(2)) },
      };
    }
    default:
      return null;
  }
}

// ─── Atlantis Operations ────────────────────────────────────────

/** Upgrade a data crystal. */
export function upgradeCrystal(s: RepublicState, crystalId: string): { ok: boolean; error?: string; crystal?: unknown } {
  const crystal = s.crystals.find((c) => c.id === crystalId);
  if (!crystal) {return { ok: false, error: "crystal not found" };}
  crystal.maxCapacity = Math.floor(crystal.maxCapacity * 1.5);
  crystal.dimensions++;
  crystal.frequency += rand(10, 50);
  return { ok: true, crystal };
}

/** Write a new scroll. */
export function writeScroll(s: RepublicState, title: string, author?: string): { ok: boolean; scroll?: unknown; error?: string } {
  if (!title) {return { ok: false, error: "title is required" };}
  const scroll = {
    id: uid(),
    title,
    author: author ?? pick(s.citizens).name,
    createdAt: ts(),
    reads: 0,
  };
  s.scrolls.push(scroll);
  s.akashicRecords++;
  // Cap scrolls to prevent unbounded growth
  if (s.scrolls.length > 500) {
    s.scrolls = s.scrolls.slice(-400);
  }
  return { ok: true, scroll };
}

// ─── ML Operations ──────────────────────────────────────────────

/** Train an ML model using real action log data. */
export function trainModel(s: RepublicState, modelName: string): { ok: boolean; error?: string } {
  const m = s.mlModels.find((x) => x.name === modelName);
  if (!m) {return { ok: false, error: "model not found" };}

  // Compute accuracy from real action log data
  const relevantActions = s.actionLog.slice(-200);
  const successCount = relevantActions.filter(a => a.tier <= 1).length;
  const newAccuracy = relevantActions.length > 0 ? successCount / relevantActions.length : m.accuracy;

  m.trained = true;
  m.accuracy = parseFloat((m.accuracy * 0.8 + newAccuracy * 0.2).toFixed(3));
  m.samplesUsed += relevantActions.length;
  m.lastTrainedAt = ts();
  return { ok: true };
}

/** Manual genome breed (called from RPC handler). */
export function manualBreed(s: RepublicState): { ok: boolean; offspring?: unknown; error?: string } {
  if (s.genomePool.length < 2) {return { ok: false, error: "need at least 2 genomes to breed" };}
  if (!canReproduce()) {
    const res = probeHostResources();
    return {
      ok: false,
      error: `Insufficient resources: ${res.freeMemoryGB}GB free RAM (need ${RESOURCE_THRESHOLDS.minFreeMemoryGB}), CPU ${res.cpuUsagePercent}% (max ${RESOURCE_THRESHOLDS.maxCpuUsagePercent}%)`,
    };
  }

  // Sort by fitness, pick best two
  const sorted = [...s.genomePool].toSorted((a, b) => b.fitness - a.fitness);
  const parentA = sorted[0];
  const parentB = sorted[1];

  const offspring = magnitudeCrossover(parentA, parentB);
  mutateGenome(offspring);
  offspring.fitness = evaluateFitness(offspring);
  s.genomePool.push(offspring);

  if (s.genomePool.length > MAX_GENOME_POOL) {
    s.genomePool.sort((a, b) => b.fitness - a.fitness);
    const removed = s.genomePool.splice(MAX_GENOME_POOL);
    const removedIds = new Set(removed.map((g) => g.id));
    s.mlModels = s.mlModels.filter((m) => !m.genomeId || !removedIds.has(m.genomeId));
  }

  // Create ML model for offspring
  const newModel = {
    name: `gen${offspring.generation}_${offspring.id}`,
    displayName: offspring.label,
    trained: true,
    accuracy: parseFloat((offspring.fitness * 0.85 + (offspring.generation % 10) / 100).toFixed(3)),
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
    description: `Model ${offspring.label} manually bred from ${parentA.label} × ${parentB.label} (Gen ${offspring.generation}, fitness ${offspring.fitness})`,
    timestamp: ts(),
  });

  return {
    ok: true,
    offspring: {
      id: offspring.id,
      label: offspring.label,
      generation: offspring.generation,
      fitness: offspring.fitness,
      parentA: parentA.label,
      parentB: parentB.label,
    },
  };
}

// ─── Quantum Operations ─────────────────────────────────────────

/** Create a new universe. */
export function createUniverse(s: RepublicState, name: string): { ok: boolean; universe?: unknown; error?: string } {
  if (!name) {return { ok: false, error: "name is required" };}
  const universe = {
    id: uid(),
    name,
    state: "Superposition" as const,
    citizenCount: rand(5, 20),
    tickCount: 0,
    coherence: randFloat(0.5, 0.9),
    branchFactor: rand(1, 3),
    createdAt: ts(),
  };
  s.universes.push(universe);
  s.timelines.push({
    id: uid(), universeId: universe.id, state: "Active",
    branchPoint: s.currentTick, divergence: 0,
  });
  return { ok: true, universe };
}

/** Branch an existing universe. */
export function branchUniverse(s: RepublicState, universeId: string): { ok: boolean; branch?: unknown; error?: string } {
  const parent = s.universes.find((u) => u.id === universeId);
  if (!parent) {return { ok: false, error: "universe not found" };}

  const branch = {
    id: uid(),
    name: `${parent.name}-B${parent.branchFactor + 1}`,
    state: "Superposition" as const,
    citizenCount: Math.floor(parent.citizenCount * randFloat(0.5, 0.8)),
    tickCount: 0,
    coherence: parent.coherence * randFloat(0.6, 0.9),
    branchFactor: 1,
    createdAt: ts(),
  };
  parent.branchFactor++;
  s.universes.push(branch);
  s.timelines.push({
    id: uid(), universeId: branch.id, state: "Active",
    branchPoint: s.currentTick, divergence: randFloat(0.1, 0.5),
  });
  return { ok: true, branch };
}

/** Collapse a universe. */
export function collapseUniverse(s: RepublicState, universeId: string): { ok: boolean; error?: string } {
  const universe = s.universes.find((u) => u.id === universeId);
  if (!universe) {return { ok: false, error: "universe not found" };}
  universe.state = "Collapsed";
  universe.coherence = 0;
  for (const t of s.timelines) {
    if (t.universeId === universe.id) {t.state = "Pruned";}
  }
  return { ok: true };
}

/** Entangle two universes. */
export function entangleUniverses(s: RepublicState, idA: string, idB: string): { ok: boolean; error?: string } {
  const a = s.universes.find((u) => u.id === idA);
  const b = s.universes.find((u) => u.id === idB);
  if (!a || !b) {return { ok: false, error: "universe not found" };}
  if (a.id === b.id) {return { ok: false, error: "cannot entangle with self" };}
  s.entanglements.push({
    universeA: a.id, universeB: b.id,
    strength: randFloat(0.3, 0.9), createdAt: ts(),
  });
  return { ok: true };
}

// ─── Status Builders ────────────────────────────────────────────

/** Build Atlantis status for the Technology tab. */
export function buildAtlantisStatus(s: RepublicState) {
  return {
    crystals: s.crystals.map((c) => ({
      id: c.id,
      type: c.type,
      dimensions: c.dimensions,
      storedKnowledge: c.entriesStored,
      frequency: c.frequency,
      createdAt: Date.now() - c.frequency * 86400,
    })),
    library: {
      scrolls: s.scrolls.length,
      codices: Math.floor(s.scrolls.length * 0.3),
      akashicEntries: s.akashicRecords,
      totalKnowledge: s.scrolls.length + Math.floor(s.scrolls.length * 0.3) + s.akashicRecords,
    },
    energyNodes: s.energyNodes.map((n) => ({
      id: n.id,
      capacity: n.capacity,
      output: n.output,
      efficiency: n.efficiency,
    })),
    totalEnergyOutput: s.energyNodes.reduce((sum, n) => sum + n.output, 0),
  };
}

/** Build ML status for the Technology tab. */
export function buildMLStatus(s: RepublicState) {
  const pool = s.genomePool;
  const bestGenome = pool.length > 0
    ? [...pool].toSorted((a, b) => b.fitness - a.fitness)[0]
    : null;

  return {
    models: s.mlModels.map((m) => ({
      name: m.displayName,
      type: m.name,
      accuracy: m.accuracy,
      lastTrained: m.lastTrainedAt ? new Date(m.lastTrainedAt).getTime() : 0,
      predictions: m.predictionsServed,
      status: (m.trained ? "ready" : "error") as "ready" | "training" | "error",
      genomeId: m.genomeId,
    })),
    totalPredictions: s.totalPredictions,
    averageAccuracy: (() => {
      const trained = s.mlModels.filter((m) => m.trained);
      return trained.length > 0
        ? parseFloat(avg(trained.map((m) => m.accuracy)).toFixed(3))
        : 0;
    })(),
    genome: {
      poolSize: pool.length,
      maxPoolSize: MAX_GENOME_POOL,
      bestFitness: bestGenome?.fitness ?? 0,
      bestLabel: bestGenome?.label ?? null,
      highestGeneration: pool.length > 0 ? Math.max(...pool.map((g) => g.generation)) : 0,
      canReproduce: canReproduce(),
    },
  };
}

/** Build genome status for detailed genome RPC. */
export function buildGenomeStatus(s: RepublicState) {
  const pool = s.genomePool;
  const sorted = [...pool].toSorted((a, b) => b.fitness - a.fitness);
  const resources = probeHostResources();

  const generationStats: Record<number, { count: number; avgFitness: number }> = {};
  for (const g of pool) {
    if (!generationStats[g.generation]) {generationStats[g.generation] = { count: 0, avgFitness: 0 };}
    generationStats[g.generation].count++;
    generationStats[g.generation].avgFitness += g.fitness;
  }
  for (const gen of Object.values(generationStats)) {
    gen.avgFitness = parseFloat((gen.avgFitness / gen.count).toFixed(4));
  }

  return {
    genome: {
      poolSize: pool.length,
      maxPoolSize: MAX_GENOME_POOL,
      topology: GENOME_TOPOLOGY,
      weightsPerGenome: countWeights(GENOME_TOPOLOGY),
      reproductionInterval: REPRODUCTION_INTERVAL,
      genomes: sorted.map((g) => ({
        id: g.id,
        label: g.label,
        generation: g.generation,
        fitness: g.fitness,
        parentIds: g.parentIds,
        createdAt: g.createdAt,
        weightCount: g.weights.length,
      })),
      generationStats,
      canReproduce: canReproduce(),
      resources: {
        freeMemoryGB: resources.freeMemoryGB,
        totalMemoryGB: resources.totalMemoryGB,
        cpuUsagePercent: resources.cpuUsagePercent,
        cpuCount: resources.cpuCount,
        thresholds: RESOURCE_THRESHOLDS,
      },
    },
  };
}

/** Build Quantum status. */
export function buildQuantumStatus(s: RepublicState) {
  return {
    universes: s.universes.map((u) => {
      const entanglementCount = s.entanglements.filter(
        (e) => e.universeA === u.id || e.universeB === u.id,
      ).length;
      const timelineCount = s.timelines.filter(
        (t) => t.universeId === u.id,
      ).length;
      return {
        id: u.id,
        state: u.state as "Superposition" | "Collapsed" | "Stable" | "Decaying",
        agents: u.citizenCount,
        entanglements: entanglementCount,
        timelineCount,
        createdAt: new Date(u.createdAt).getTime(),
      };
    }),
    entanglements: s.entanglements,
    timelines: s.timelines,
    totalUniverses: s.universes.length,
    activeUniverses: s.universes.filter((u) => u.state !== "Collapsed").length,
  };
}
