/**
 * Republic Platform — Evolution Engine
 *
 * Bridges the genetic algorithm (genetics.ts) with real agent behavior.
 *
 * Key innovations over Phase 1's weight-heuristic fitness:
 *
 * 1. **Real Fitness from Actions**: Evaluates genomes based on the actual
 *    performance of citizens linked to that genome — credits earned,
 *    discoveries made, social impact, energy efficiency.
 *
 * 2. **Personality Inheritance**: When a genome reproduces, the child
 *    genome's weight distribution maps to a PersonalityVector that
 *    influences the citizen's prompt and reflexive behavior.
 *
 * 3. **Citizen ↔ Genome Linking**: Citizens can be assigned genomes.
 *    Their action history feeds back into the genome's fitness score.
 *    When genomes reproduce, new citizens can inherit the offspring.
 */

import type {
  ActionRecord,
  AgentAction,
  Citizen,
  NeuralGenome,
  PersonalityVector,
  RepublicState,
} from "./types.js";
import {
  canReproduce,
  magnitudeCrossover,
  MAX_GENOME_POOL,
  mutateGenome,
  REPRODUCTION_INTERVAL,
} from "./genetics.js";
import { generateCitizen, rand, rng, SKILL_TREES, ts } from "./utils.js";

// ─── Configuration ──────────────────────────────────────────────

/** Max action records per citizen (rolling window) */
const MAX_ACTION_HISTORY = 50;

/** Max global action log entries */
const MAX_GLOBAL_ACTION_LOG = 500;

/** Fitness component weights (must sum to 1.0) */
const FITNESS_WEIGHTS = {
  /** Credits earned per action (economic productivity) */
  economic: 0.25,
  /** Discovery/scroll production (knowledge creation) */
  knowledge: 0.2,
  /** Happiness maintained (social wellbeing) */
  wellbeing: 0.15,
  /** Energy efficiency (energy remaining after actions) */
  efficiency: 0.15,
  /** Variety of actions taken (adaptability) */
  adaptability: 0.1,
  /** Social actions performed (community contribution) */
  social: 0.1,
  /** Compute efficiency — preference for lower tiers */
  computeEfficiency: 0.05,
} as const;

/** Personality mutation rate per dimension when inheriting */
const PERSONALITY_MUTATION_RATE = 0.08;

// ─── Personality ↔ Genome Mapping ───────────────────────────────

/**
 * Derive a PersonalityVector from a genome's weight distribution.
 *
 * Each personality dimension is derived from a different statistical
 * property of a slice of the genome's weights (so different regions
 * of the neural network map to different personality traits).
 */
export function genomeToPersonality(genome: NeuralGenome): PersonalityVector {
  const w = genome.weights;
  if (w.length === 0) {
    return defaultPersonality();
  }

  const sliceSize = Math.max(1, Math.floor(w.length / 5));

  return {
    openness: dimensionFromSlice(w, 0, sliceSize),
    conscientiousness: dimensionFromSlice(w, sliceSize, sliceSize * 2),
    agreeableness: dimensionFromSlice(w, sliceSize * 2, sliceSize * 3),
    stability: dimensionFromSlice(w, sliceSize * 3, sliceSize * 4),
    drive: dimensionFromSlice(w, sliceSize * 4, w.length),
  };
}

/**
 * Extract a 0–1 personality dimension from a weight slice.
 * Uses a combination of mean magnitude and variance to derive the value.
 */
function dimensionFromSlice(weights: number[], start: number, end: number): number {
  const slice = weights.slice(start, end);
  if (slice.length === 0) {
    return 0.5;
  }

  let sum = 0;
  let sumSq = 0;
  for (const w of slice) {
    const mag = Math.abs(w);
    sum += mag;
    sumSq += mag * mag;
  }
  const mean = sum / slice.length;
  const variance = sumSq / slice.length - mean * mean;

  // Combine mean and variance into a 0–1 score
  // sigmoid-ish mapping to keep values bounded
  const raw = mean * 0.6 + Math.sqrt(Math.max(0, variance)) * 0.4;
  return Math.max(0, Math.min(1, raw * 1.5));
}

/** Default personality for citizens without genomes. */
export function defaultPersonality(): PersonalityVector {
  return {
    openness: 0.5,
    conscientiousness: 0.5,
    agreeableness: 0.5,
    stability: 0.5,
    drive: 0.5,
  };
}

/**
 * Mutate a personality vector with small Gaussian perturbations.
 * Used during genome reproduction to create variation.
 */
export function mutatePersonality(parent: PersonalityVector): PersonalityVector {
  return {
    openness: clamp01(parent.openness + gaussianNoise(PERSONALITY_MUTATION_RATE)),
    conscientiousness: clamp01(parent.conscientiousness + gaussianNoise(PERSONALITY_MUTATION_RATE)),
    agreeableness: clamp01(parent.agreeableness + gaussianNoise(PERSONALITY_MUTATION_RATE)),
    stability: clamp01(parent.stability + gaussianNoise(PERSONALITY_MUTATION_RATE)),
    drive: clamp01(parent.drive + gaussianNoise(PERSONALITY_MUTATION_RATE)),
  };
}

/**
 * Blend two parent personalities (used during crossover).
 */
export function blendPersonalities(a: PersonalityVector, b: PersonalityVector): PersonalityVector {
  const t = rng(); // Random blend factor
  return {
    openness: a.openness * t + b.openness * (1 - t),
    conscientiousness: a.conscientiousness * t + b.conscientiousness * (1 - t),
    agreeableness: a.agreeableness * t + b.agreeableness * (1 - t),
    stability: a.stability * t + b.stability * (1 - t),
    drive: a.drive * t + b.drive * (1 - t),
  };
}

// ─── Real Fitness Evaluation ────────────────────────────────────

/**
 * Evaluate a genome's fitness from the real actions of the citizen(s)
 * linked to it. This replaces the weight-heuristic evaluation when
 * real action data is available.
 *
 * Falls back to weight-based heuristics if no action data exists.
 */
export function evaluateRealFitness(genome: NeuralGenome, citizens: Citizen[]): number {
  // Find all citizens linked to this genome
  const linked = citizens.filter((c) => c.genomeId === genome.id);

  // Gather all action records
  const actions: ActionRecord[] = [];
  for (const c of linked) {
    if (c.actionHistory) {
      actions.push(...c.actionHistory);
    }
  }

  // Not enough data → fall back to weight-based heuristic
  if (actions.length < 5) {
    return heuristicFitness(genome);
  }

  // Compute fitness components
  const economic = economicFitness(actions);
  const knowledge = knowledgeFitness(actions);
  const wellbeing = wellbeingFitness(linked);
  const efficiency = efficiencyFitness(actions);
  const adaptability = adaptabilityFitness(actions);
  const social = socialFitness(actions);
  const compute = computeEfficiencyFitness(actions);

  // Weighted sum
  const fitness =
    economic * FITNESS_WEIGHTS.economic +
    knowledge * FITNESS_WEIGHTS.knowledge +
    wellbeing * FITNESS_WEIGHTS.wellbeing +
    efficiency * FITNESS_WEIGHTS.efficiency +
    adaptability * FITNESS_WEIGHTS.adaptability +
    social * FITNESS_WEIGHTS.social +
    compute * FITNESS_WEIGHTS.computeEfficiency;

  return parseFloat(Math.max(0, Math.min(1, fitness)).toFixed(4));
}

// ─── Component Fitness Functions ────────────────────────────────

/** Economic productivity: avg credits earned per action */
function economicFitness(actions: ActionRecord[]): number {
  const totalCredits = actions.reduce((sum, a) => sum + Math.max(0, a.creditDelta), 0);
  const avgCredits = totalCredits / actions.length;
  // Normalize: 0 credits → 0, 200+ credits/action → 1.0
  return Math.min(1, avgCredits / 200);
}

/** Knowledge creation: ratio of actions that produced discoveries */
function knowledgeFitness(actions: ActionRecord[]): number {
  const discoveries = actions.filter((a) => a.discoveryMade > 0).length;
  // Even 5% discovery rate is excellent
  return Math.min(1, (discoveries / actions.length) * 10);
}

/** Wellbeing: average happiness of linked citizens */
function wellbeingFitness(citizens: Citizen[]): number {
  if (citizens.length === 0) {
    return 0.5;
  }
  const avgHappiness = citizens.reduce((sum, c) => sum + c.happiness, 0) / citizens.length;
  return avgHappiness / 100;
}

/** Energy efficiency: how much energy is retained after actions */
function efficiencyFitness(actions: ActionRecord[]): number {
  // More negative energyDelta = less efficient
  const avgEnergyLoss =
    actions.reduce((sum, a) => sum + Math.min(0, a.energyDelta), 0) / actions.length;
  // -20 energy/action is worst case, 0 is best
  return Math.max(0, Math.min(1, 1 + avgEnergyLoss / 20));
}

/** Adaptability: diversity of tool usage */
function adaptabilityFitness(actions: ActionRecord[]): number {
  const uniqueTools = new Set(actions.map((a) => a.tool));
  // Using 4+ different tools → full score
  return Math.min(1, uniqueTools.size / 4);
}

/** Social contribution: ratio of social actions */
function socialFitness(actions: ActionRecord[]): number {
  const socialTools = new Set(["speak", "socialize", "vote", "propose_bill", "trade"]);
  const socialCount = actions.filter((a) => socialTools.has(a.tool)).length;
  // 30%+ social actions → full score
  return Math.min(1, socialCount / actions.length / 0.3);
}

/** Compute efficiency: preference for cheaper tiers */
function computeEfficiencyFitness(actions: ActionRecord[]): number {
  const totalTier = actions.reduce((sum, a) => sum + a.tier, 0);
  const avgTier = totalTier / actions.length;
  // Tier 0 → 1.0, Tier 3 → 0.0
  return Math.max(0, 1 - avgTier / 3);
}

/** Fallback: weight-heuristic fitness (same as genetics.ts evaluateFitness) */
function heuristicFitness(genome: NeuralGenome): number {
  const w = genome.weights;
  if (w.length === 0) {
    return 0;
  }

  let goodWeights = 0;
  let totalMag = 0;
  let nearZero = 0;
  for (const v of w) {
    const mag = Math.abs(v);
    totalMag += mag;
    if (mag >= 0.01 && mag <= 2.0) {
      goodWeights++;
    }
    if (mag < 0.01) {
      nearZero++;
    }
  }

  const accuracy = goodWeights / w.length;
  const sparsity = nearZero / w.length;
  const effScore = 1 - Math.abs(sparsity - 0.35) * 2;

  const mean = totalMag / w.length;
  let variance = 0;
  for (const v of w) {
    variance += (Math.abs(v) - mean) ** 2;
  }
  variance /= w.length;
  const stabilityScore = 1 - Math.min(1, Math.abs(Math.sqrt(variance) - 0.5) * 2);

  return parseFloat(
    Math.max(
      0,
      Math.min(
        1,
        accuracy * 0.5 + Math.max(0, effScore) * 0.25 + Math.max(0, stabilityScore) * 0.25,
      ),
    ).toFixed(4),
  );
}

// ─── Action Recording ───────────────────────────────────────────

/**
 * Record an agent action on a citizen's action history.
 * Called after each tool execution in the agent runtime.
 */
export function recordAction(
  s: RepublicState,
  citizen: Citizen,
  action: AgentAction,
  creditsBefore: number,
  energyBefore: number,
  happinessBefore: number,
  discoveryMade: boolean,
): void {
  const record: ActionRecord = {
    tick: s.currentTick,
    tool: action.type,
    success: true,
    creditDelta: citizen.credits - creditsBefore,
    energyDelta: citizen.energy - energyBefore,
    happinessDelta: citizen.happiness - happinessBefore,
    discoveryMade: discoveryMade ? 1 : 0,
    tier: action.tier,
  };

  // Per-citizen history
  if (!citizen.actionHistory) {
    citizen.actionHistory = [];
  }
  citizen.actionHistory.push(record);
  if (citizen.actionHistory.length > MAX_ACTION_HISTORY) {
    citizen.actionHistory.splice(0, citizen.actionHistory.length - MAX_ACTION_HISTORY);
  }

  // Global action log
  if (!s.actionLog) {
    s.actionLog = [];
  }
  s.actionLog.push(record);
  if (s.actionLog.length > MAX_GLOBAL_ACTION_LOG) {
    s.actionLog.splice(0, s.actionLog.length - MAX_GLOBAL_ACTION_LOG);
  }
}

// ─── Citizen ↔ Genome Linking ───────────────────────────────────

/**
 * Assign a genome to a citizen, deriving their personality from it.
 */
export function assignGenomeToCitizen(citizen: Citizen, genome: NeuralGenome): void {
  citizen.genomeId = genome.id;
  citizen.personality = genomeToPersonality(genome);
}

/**
 * Create a new citizen from two parent citizens' genomes.
 * Performs genetic crossover + mutation on the genomes,
 * then derives the child's personality from the offspring genome.
 *
 * Returns null if parents don't have genomes or resources are too low.
 */
export function reproduceCitizens(
  s: RepublicState,
  parentA: Citizen,
  parentB: Citizen,
): { citizen: Citizen; genome: NeuralGenome } | null {
  // Find parent genomes
  const genomeA = parentA.genomeId ? s.genomePool.find((g) => g.id === parentA.genomeId) : null;
  const genomeB = parentB.genomeId ? s.genomePool.find((g) => g.id === parentB.genomeId) : null;

  // Both parents need genomes
  if (!genomeA || !genomeB) {
    return null;
  }
  if (!canReproduce()) {
    return null;
  }

  // Genetic operations
  const offspringGenome = magnitudeCrossover(genomeA, genomeB);
  mutateGenome(offspringGenome);

  // Evaluate fitness using real data from parents
  offspringGenome.fitness = evaluateRealFitness(offspringGenome, s.citizens);

  // Add to genome pool
  s.genomePool.push(offspringGenome);

  // Enforce pool cap
  if (s.genomePool.length > MAX_GENOME_POOL) {
    s.genomePool.sort((a, b) => b.fitness - a.fitness);
    const removed = s.genomePool.splice(MAX_GENOME_POOL);
    const removedIds = new Set(removed.map((g) => g.id));
    s.mlModels = s.mlModels.filter((m) => !m.genomeId || !removedIds.has(m.genomeId));
  }

  // Create child citizen
  const childGen = Math.max(parentA.generation, parentB.generation) + 1;
  const childPersonality = mutatePersonality(
    blendPersonalities(
      parentA.personality ?? defaultPersonality(),
      parentB.personality ?? defaultPersonality(),
    ),
  );

  const child = generateCitizen(childGen);
  child.genomeId = offspringGenome.id;
  child.personality = childPersonality;

  // Child inherits a blend of parent specializations (50% chance of each)
  child.specialization = rng() < 0.5 ? parentA.specialization : parentB.specialization;

  // Re-derive skills from inherited specialization
  const tree = SKILL_TREES[child.specialization] ?? SKILL_TREES.Generalist;
  child.skills = [tree[0]];
  child.skillCount = 1;

  // Add to world
  s.citizens.push(child);
  s.events.push({
    citizenId: child.id,
    citizenName: child.name,
    type: "Birth",
    description: `${child.name} born from ${parentA.name} × ${parentB.name} (Gen ${childGen}, personality: O=${childPersonality.openness.toFixed(2)} C=${childPersonality.conscientiousness.toFixed(2)} A=${childPersonality.agreeableness.toFixed(2)} S=${childPersonality.stability.toFixed(2)} D=${childPersonality.drive.toFixed(2)})`,
    timestamp: ts(),
  });

  return { citizen: child, genome: offspringGenome };
}

// ─── Evolution Tick ─────────────────────────────────────────────

/**
 * Main evolution tick. Called from the simulation loop.
 * Re-evaluates genome fitness using real action data and triggers
 * reproduction when conditions are met.
 */
export function evolutionTick(s: RepublicState): void {
  try {
    // PERFORMANCE: Only re-evaluate fitness when reproduction is imminent —
    // was O(genomes × citizens) every tick. Now runs only at reproduction cadence.
    const shouldReproduce = s.currentTick % (REPRODUCTION_INTERVAL * 3) === 0;

    if (shouldReproduce) {
      // Re-evaluate fitness only for genomes with linked citizens (skip orphans)
      const genomeCitizenMap = new Map<string, (typeof s.citizens)[0][]>();
      for (const c of s.citizens) {
        if (c.genomeId) {
          const arr = genomeCitizenMap.get(c.genomeId) ?? [];
          arr.push(c);
          genomeCitizenMap.set(c.genomeId, arr);
        }
      }
      for (const genome of s.genomePool) {
        const linked = genomeCitizenMap.get(genome.id);
        if (linked && linked.length > 0) {
          genome.fitness = evaluateRealFitness(genome, linked);
        }
      }
    }

    // Attempt citizen reproduction every N ticks
    if (!shouldReproduce) {
      return;
    }
    if (!canReproduce()) {
      return;
    }

    // Find two fit citizens with genomes
    const genomeCitizens = s.citizens.filter((c) => c.genomeId != null);
    if (genomeCitizens.length < 2) {
      return;
    }

    // Select parents by fitness of their linked genomes
    const ranked = genomeCitizens
      .map((c) => ({
        citizen: c,
        fitness: s.genomePool.find((g) => g.id === c.genomeId)?.fitness ?? 0,
      }))
      .toSorted((a, b) => b.fitness - a.fitness);

    // Tournament-style: pick from top half
    const topHalf = ranked.slice(0, Math.max(2, Math.floor(ranked.length / 2)));
    const parentA = topHalf[rand(0, Math.min(1, topHalf.length - 1))].citizen;
    const parentB = topHalf[rand(Math.min(1, topHalf.length - 1), topHalf.length - 1)].citizen;

    if (parentA.id === parentB.id) {
      return;
    }

    reproduceCitizens(s, parentA, parentB);
  } catch {
    // Evolution must never crash the simulation
  }
}

// ─── Status Builder ─────────────────────────────────────────────

/**
 * Build evolution status for RPC/diagnostics.
 */
export function buildEvolutionStatus(s: RepublicState) {
  const genomeCitizens = s.citizens.filter((c) => c.genomeId != null);
  const actionCounts = s.actionLog?.length ?? 0;

  // Personality distribution
  const personalities = genomeCitizens.filter((c) => c.personality).map((c) => c.personality!);

  const avgPersonality: PersonalityVector =
    personalities.length > 0
      ? {
          openness: avg(personalities.map((p) => p.openness)),
          conscientiousness: avg(personalities.map((p) => p.conscientiousness)),
          agreeableness: avg(personalities.map((p) => p.agreeableness)),
          stability: avg(personalities.map((p) => p.stability)),
          drive: avg(personalities.map((p) => p.drive)),
        }
      : defaultPersonality();

  return {
    genomeCitizens: genomeCitizens.length,
    totalCitizens: s.citizens.length,
    actionRecords: actionCounts,
    avgPersonality,
    fitnessWeights: FITNESS_WEIGHTS,
    topGenomes: [...s.genomePool]
      .toSorted((a, b) => b.fitness - a.fitness)
      .slice(0, 5)
      .map((g) => ({
        id: g.id,
        label: g.label,
        generation: g.generation,
        fitness: g.fitness,
        linkedCitizens: s.citizens.filter((c) => c.genomeId === g.id).length,
      })),
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function gaussianNoise(scale: number): number {
  const u1 = rng() || 1e-10;
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * scale;
}

function avg(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}
