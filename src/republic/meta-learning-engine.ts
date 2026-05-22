/**
 * Republic Platform — Meta-Learning Engine (Gödel Agent)
 *
 * Phase AGI-3: Recursive Self-Improvement of Learning Algorithms.
 *
 * Inspired by:
 *   - Gödel Agent (arXiv 2024) — self-referential recursive improvement
 *   - AlphaEvolve (DeepMind 2025) — evolutionary coding agent
 *   - SOAR Method (ICLR 2025) — self-improving evolutionary loops
 *
 * The learning systems (curiosity, research, education, economy) have
 * tunable parameters. This engine evolves those parameters via:
 *   1. Parameter registration from each engine
 *   2. Mutation generation (perturbation-based)
 *   3. A/B testing on citizen subpopulations
 *   4. Selection of successful mutations
 *   5. Generational tracking and metric history
 */

import type { RepublicState } from "./types.js";
import { rng, uid } from "./utils.js";
import {
  selectBestStrategy,
  recordMutationOutcome,
} from "./cognition/reflective-meta-learner.js";

// ─── Configuration ──────────────────────────────────────────────

/** Meta-generation length in ticks */
const META_GENERATION_LENGTH = 500;

/** Default A/B test duration in ticks (overridden by reflective-meta-learner) */
const DEFAULT_AB_TEST_DURATION = 100;

/** Default minimum improvement threshold (overridden by reflective-meta-learner) */
const DEFAULT_MIN_IMPROVEMENT_THRESHOLD = 0.05;

/** Default max mutations per generation (overridden by reflective-meta-learner) */
const DEFAULT_MAX_MUTATIONS_PER_GEN = 5;

/** Default perturbation range ±% (overridden by reflective-meta-learner) */
const DEFAULT_PERTURBATION_RANGE = 0.15;

/** Max metric history entries */
const MAX_METRIC_HISTORY = 200;

/** Constitutional guardrail: max metric drop allowed */
const MAX_ALLOWED_DROP = 0.2;

// ─── Types ──────────────────────────────────────────────────────

export interface EngineParameter {
  id: string;
  engineName: string;
  paramName: string;
  currentValue: number;
  minValue: number;
  maxValue: number;
  description: string;
  targetMetric: string;
}

export interface ParameterMutation {
  id: string;
  parameters: Array<{ paramId: string; oldValue: number; newValue: number }>;
  proposedBy: string;
  rationale: string;
  targetMetric: string;
  status: "proposed" | "testing" | "accepted" | "rejected";
  testResults?: {
    controlMetric: number;
    mutantMetric: number;
    improvement: number;
    sampleSize: number;
  };
  createdAt: number;
}

export interface MetaStrategy {
  engineName: string;
  population: ParameterMutation[];
  champion: ParameterMutation | null;
  generation: number;
  metricHistory: Array<{ tick: number; metric: number }>;
}

export interface MetaLearningDiagnostics {
  strategies: Array<{ engineName: string; generation: number; champion: string | null }>;
  totalMutations: number;
  acceptedMutations: number;
  avgImprovement: number;
  currentGeneration: number;
}

// ─── State ──────────────────────────────────────────────────────

const registeredParams: EngineParameter[] = [];
const strategies = new Map<string, MetaStrategy>();
const allMutations: ParameterMutation[] = [];
let globalGeneration = 0;
let lastGenerationTick = 0;

// ─── Parameter Registration ─────────────────────────────────────

/** Register tunable parameters from an engine */
export function registerParameters(
  engineName: string,
  params: Array<Omit<EngineParameter, "id">>,
): void {
  for (const p of params) {
    const existing = registeredParams.find(
      (e) => e.engineName === p.engineName && e.paramName === p.paramName,
    );
    if (existing) {continue;}

    registeredParams.push({ ...p, id: uid() });
  }

  // Ensure strategy exists for this engine
  if (!strategies.has(engineName)) {
    strategies.set(engineName, {
      engineName,
      population: [],
      champion: null,
      generation: 0,
      metricHistory: [],
    });
  }
}

// ─── Metric Collection ──────────────────────────────────────────

/** Get current performance metrics for all engines */
export function getEngineMetrics(s: RepublicState): Record<string, number> {
  const metrics: Record<string, number> = {};

  // Curiosity: avg XP per citizen
  const avgXP =
    s.citizens.reduce((sum, c) => sum + (c.xp ?? 0), 0) / Math.max(1, s.citizens.length);
  metrics["curiosity_effectiveness"] = Math.min(1, avgXP / 200);

  // Research: articles per 100 ticks
  const articleCount = s.knowledgeBase?.length ?? 0;
  metrics["research_output"] = Math.min(1, articleCount / Math.max(1, s.currentTick / 100));

  // Education: avg skill count
  const avgSkills =
    s.citizens.reduce((sum, c) => sum + c.skills.length, 0) / Math.max(1, s.citizens.length);
  metrics["education_effectiveness"] = Math.min(1, avgSkills / 10);

  // Economy: GDP proxy (total credits)
  const totalCredits = s.citizens.reduce((sum, c) => sum + c.credits, 0);
  metrics["economic_output"] = Math.min(1, totalCredits / (s.citizens.length * 200));

  // Evolution: avg fitness
  const avgFitness =
    s.genomePool.length > 0
      ? s.genomePool.reduce((sum, g) => sum + g.fitness, 0) / s.genomePool.length
      : 0;
  metrics["evolution_fitness"] = Math.min(1, avgFitness);

  // Social: avg happiness
  metrics["social_wellbeing"] =
    s.citizens.reduce((sum, c) => sum + c.happiness, 0) / Math.max(1, s.citizens.length) / 100;

  // Overall
  const values = Object.values(metrics);
  metrics["overall"] = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);

  return metrics;
}

// ─── Mutation Generation ────────────────────────────────────────

/** Generate candidate mutations for an engine, using reflective-meta-learner strategy */
function generateMutations(engineName: string, citizenId: string): ParameterMutation[] {
  const engineParams = registeredParams.filter((p) => p.engineName === engineName);
  if (engineParams.length === 0) {return [];}

  // Phase 7: Get evolved strategy from reflective-meta-learner
  const strategy = selectBestStrategy(engineName);
  const perturbationRange = strategy.perturbationRange || DEFAULT_PERTURBATION_RANGE;
  const maxMutations = strategy.mutationsPerGeneration || DEFAULT_MAX_MUTATIONS_PER_GEN;

  const mutations: ParameterMutation[] = [];
  const count = Math.min(maxMutations, engineParams.length);

  for (let i = 0; i < count; i++) {
    const param = engineParams[Math.floor(rng() * engineParams.length)];
    const perturbation = 1 + (rng() * 2 - 1) * perturbationRange;
    const newValue = Math.max(
      param.minValue,
      Math.min(param.maxValue, param.currentValue * perturbation),
    );

    mutations.push({
      id: uid(),
      parameters: [{ paramId: param.id, oldValue: param.currentValue, newValue }],
      proposedBy: citizenId,
      rationale: `Perturbation of ${param.paramName} by ${((perturbation - 1) * 100).toFixed(1)}% (strategy: ${strategy.name})`,
      targetMetric: param.targetMetric,
      status: "proposed",
      createdAt: Date.now(),
    });
  }

  return mutations;
}

/** Propose a parameter change (called by citizens during research) */
export function proposeParameterChange(
  citizenId: string,
  engineName: string,
  paramName: string,
  newValue: number,
  rationale: string,
): ParameterMutation | null {
  const param = registeredParams.find(
    (p) => p.engineName === engineName && p.paramName === paramName,
  );
  if (!param) {return null;}

  const clamped = Math.max(param.minValue, Math.min(param.maxValue, newValue));

  const mutation: ParameterMutation = {
    id: uid(),
    parameters: [{ paramId: param.id, oldValue: param.currentValue, newValue: clamped }],
    proposedBy: citizenId,
    rationale,
    targetMetric: param.targetMetric,
    status: "proposed",
    createdAt: Date.now(),
  };

  allMutations.push(mutation);
  return mutation;
}

// ─── A/B Testing ────────────────────────────────────────────────

/** Evaluate a mutation via simulated A/B testing, using evolved strategy thresholds */
function evaluateMutation(
  mutation: ParameterMutation,
  metrics: Record<string, number>,
  engineName: string,
): void {
  mutation.status = "testing";

  // Phase 7: Get evolved strategy thresholds
  const strategy = selectBestStrategy(engineName);
  const improvementThreshold = strategy.improvementThreshold || DEFAULT_MIN_IMPROVEMENT_THRESHOLD;
  const testDuration = strategy.testDuration || DEFAULT_AB_TEST_DURATION;

  // Simulated A/B test: control = current metric, mutant = perturbed estimate
  const controlMetric = metrics[mutation.targetMetric] ?? 0.5;

  // Simulate mutant performance with some noise
  const paramChange = mutation.parameters[0];
  const changeRatio = paramChange
    ? paramChange.newValue / Math.max(0.001, paramChange.oldValue)
    : 1;
  const mutantMetric = controlMetric * (0.9 + changeRatio * 0.1) + (rng() - 0.5) * 0.05;

  const improvement = mutantMetric - controlMetric;

  mutation.testResults = {
    controlMetric,
    mutantMetric,
    improvement,
    sampleSize: testDuration,
  };

  // Accept or reject
  const accepted = improvement > improvementThreshold && improvement > -MAX_ALLOWED_DROP;
  mutation.status = accepted ? "accepted" : "rejected";

  if (accepted) {
    // Apply the mutation to the registered parameter
    for (const change of mutation.parameters) {
      const param = registeredParams.find((p) => p.id === change.paramId);
      if (param) {param.currentValue = change.newValue;}
    }
  }

  // Phase 7: Feed outcome back to reflective-meta-learner
  const paramName = mutation.parameters[0]
    ? registeredParams.find((p) => p.id === mutation.parameters[0].paramId)?.paramName ?? "unknown"
    : "unknown";

  recordMutationOutcome(
    engineName,
    strategy.id,
    accepted,
    improvement,
    improvementThreshold,
    paramName,
    Date.now(),
  );
}

// ─── Main Tick ──────────────────────────────────────────────────

/** Main meta-learning tick — evolves engine parameters */
export function metaLearningTick(s: RepublicState): void {
  // Only run at meta-generation boundaries
  if (s.currentTick - lastGenerationTick < META_GENERATION_LENGTH) {return;}
  lastGenerationTick = s.currentTick;
  globalGeneration++;

  // 1. Measure current performance metrics
  const metrics = getEngineMetrics(s);

  // 2. For each registered strategy, generate and evaluate mutations
  for (const [engineName, strategy] of strategies) {
    // Record current metric
    const metricValue = metrics[`${engineName}_effectiveness`] ?? metrics["overall"] ?? 0;
    strategy.metricHistory.push({ tick: s.currentTick, metric: metricValue });
    if (strategy.metricHistory.length > MAX_METRIC_HISTORY) {
      strategy.metricHistory = strategy.metricHistory.slice(-MAX_METRIC_HISTORY);
    }

    // Pick a random citizen as "proposer"
    const proposer =
      s.citizens.length > 0 ? s.citizens[Math.floor(rng() * s.citizens.length)] : null;
    if (!proposer) {continue;}

    // Generate mutations
    const mutations = generateMutations(engineName, proposer.id);

    // Evaluate each mutation
    for (const mutation of mutations) {
      evaluateMutation(mutation, metrics, engineName);
      strategy.population.push(mutation);
      allMutations.push(mutation);

      // Track champion (best accepted mutation)
      if (
        mutation.status === "accepted" &&
        mutation.testResults &&
        (!strategy.champion ||
          (strategy.champion.testResults &&
            mutation.testResults.improvement > strategy.champion.testResults.improvement))
      ) {
        strategy.champion = mutation;
      }
    }

    strategy.generation = globalGeneration;

    // XP reward for citizens who proposed successful mutations
    for (const m of mutations) {
      if (m.status === "accepted") {
        const citizen = s.citizens.find((c) => c.id === m.proposedBy);
        if (citizen && citizen.xp !== undefined) {
          citizen.xp += 10;
        }
      }
    }

    // Cap population
    if (strategy.population.length > 50) {
      strategy.population = strategy.population.slice(-50);
    }
  }

  // Cap global mutations
  if (allMutations.length > 500) {
    allMutations.splice(0, allMutations.length - 500);
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export function metaLearningDiagnostics(): MetaLearningDiagnostics {
  const accepted = allMutations.filter((m) => m.status === "accepted");
  const improvements = accepted.filter((m) => m.testResults).map((m) => m.testResults!.improvement);

  return {
    strategies: Array.from(strategies.values()).map((s) => ({
      engineName: s.engineName,
      generation: s.generation,
      champion: s.champion?.id ?? null,
    })),
    totalMutations: allMutations.length,
    acceptedMutations: accepted.length,
    avgImprovement:
      improvements.length > 0 ? improvements.reduce((a, b) => a + b, 0) / improvements.length : 0,
    currentGeneration: globalGeneration,
  };
}

/** Get registered parameters */
export function getRegisteredParameters(): EngineParameter[] {
  return [...registeredParams];
}

/** Get all mutations */
export function getMutations(): ParameterMutation[] {
  return [...allMutations];
}
