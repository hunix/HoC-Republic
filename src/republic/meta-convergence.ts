/**
 * Republic Platform — Meta-Learning Convergence Orchestrator
 *
 * The top-level coordinator that synchronizes all meta-learning subsystems
 * across 3 timescales: fast (per-tick), medium (every 10 ticks), slow (every 50 ticks).
 *
 * Inspired by:
 *   - MAML inner/outer loop structure (Finn et al. 2017)
 *   - Reptile global parameter update (OpenAI 2018)
 *   - Multi-timescale meta-learning (Al-Shedivat et al.)
 *   - Convergence theory in stochastic optimization
 *   - Population gradient estimation (PBT theory)
 *
 * 3-Timescale Architecture:
 *   FAST (every tick):   curiosity + experience replay (individual adaptation)
 *   MEDIUM (every 10):   curriculum arch + RSI (cross-agent adaptation)
 *   SLOW (every 50):     knowledge distillation + PBT (population evolution)
 *
 * Additional capabilities:
 *   - Learning plateau detection: if population fitness hasn't improved in N ticks,
 *     inject curriculum perturbation to force exploration
 *   - Global meta-gradient estimation: Reptile-style gradient across all subsystems
 *   - KPI broadcast: comprehensive learning health metrics via `republic.meta.*` RPC
 */
// oxlint-disable eslint(curly)
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { RepublicState } from "./types.js";
import { ts } from "./utils.js";
import { curiosityTick, curiosityDiagnostics } from "./curiosity-engine.js";
import { experienceReplayTick, getReplayDiagnostics } from "./experience-replay.js";
import { curriculumArchitectTick, getCurriculumEfficiencyMetrics } from "./autonomous-curriculum-architect.js";
import { rsiTick, getRsiDiagnostics } from "./recursive-self-improvement.js";
import { populationTrainingTick, getPopulationDiagnostics, computePopulationFitness } from "./population-training.js";
import { knowledgeDistillationTick, getDistillationDiagnostics } from "./knowledge-distillation.js";

const logger = createSubsystemLogger("republic:meta-convergence");

// ─── Constants ──────────────────────────────────────────────────

const FAST_INTERVAL = 3;     // every 3 ticks (curiosity + replay) — no need per-tick
const MEDIUM_INTERVAL = 20;  // every 20 ticks (curriculum + RSI)
const SLOW_INTERVAL = 100;   // every 100 ticks (distillation + PBT) — expensive fitness computation

const PLATEAU_WINDOW = 200;       // ticks to observe for plateau
const PLATEAU_MIN_IMPROVEMENT = 0.01; // min fitness improvement to avoid plateau detection
const META_GRADIENT_ALPHA = 0.1;  // Reptile-style step size for meta-update
const MAX_FITNESS_HISTORY = 100;

// ─── Types ──────────────────────────────────────────────────────

export interface ConvergenceReport {
  tick: number;
  timescale: "fast" | "medium" | "slow";
  populationAvgFitness: number;
  fitnessImprovement: number;        // vs previous report
  plateauDetected: boolean;
  plateauResponse?: string;
  subsystems: {
    curiosity: ReturnType<typeof curiosityDiagnostics>;
    experienceReplay: ReturnType<typeof getReplayDiagnostics>;
    curriculum: ReturnType<typeof getCurriculumEfficiencyMetrics>;
    rsi: ReturnType<typeof getRsiDiagnostics>;
    population: ReturnType<typeof getPopulationDiagnostics>;
    distillation: ReturnType<typeof getDistillationDiagnostics>;
  };
  metaGradient: {
    estimatedLearningVelocity: number;  // Reptile-style global gradient magnitude
    convergenceState: "exploring" | "converging" | "plateaued" | "diverging";
  };
  timestamp: string;
}

export interface PlateauAnalysis {
  detected: boolean;
  ticksWithoutImprovement: number;
  avgFitnessLast50: number;
  avgFitnessLast200: number;
  recommendation: string;
}

// ─── State ──────────────────────────────────────────────────────

const fitnessHistory: Array<{ tick: number; avgFitness: number }> = [];
const convergenceHistory: ConvergenceReport[] = [];
let lastReportTick = 0;
let lastSlowTick = 0;
let lastMediumTick = 0;
let perturbationsConducted = 0;
let globalTick = 0;

// ─── Plateau Detection ───────────────────────────────────────────

/**
 * Detect whether the population has plateaued in learning.
 */
export function detectLearningPlateau(): PlateauAnalysis {
  if (fitnessHistory.length < 50) {
    return {
      detected: false,
      ticksWithoutImprovement: 0,
      avgFitnessLast50: 0,
      avgFitnessLast200: 0,
      recommendation: "Insufficient history",
    };
  }

  const last50 = fitnessHistory.slice(-50);
  const last200 = fitnessHistory.slice(-Math.min(200, fitnessHistory.length));

  const avg50 = last50.reduce((s, e) => s + e.avgFitness, 0) / last50.length;
  const avg200 = last200.reduce((s, e) => s + e.avgFitness, 0) / last200.length;

  // Count how many consecutive ticks had < MIN_IMPROVEMENT
  let stagnantTicks = 0;
  for (let i = fitnessHistory.length - 1; i > 0; i--) {
    const current = fitnessHistory[i]?.avgFitness ?? 0;
    const prev = fitnessHistory[i - 1]?.avgFitness ?? 0;
    if (Math.abs(current - prev) < PLATEAU_MIN_IMPROVEMENT) {
      stagnantTicks++;
    } else {
      break;
    }
  }

  const detected = stagnantTicks >= PLATEAU_WINDOW / 5;
  const improvement = avg50 - avg200;

  let recommendation = "Learning is progressing normally";
  if (detected) {
    if (improvement < 0) recommendation = "DIVERGING: inject diversity via cross-specialization seeding";
    else recommendation = "PLATEAU: increase exploration rate and curriculum difficulty";
  }

  return {
    detected,
    ticksWithoutImprovement: stagnantTicks,
    avgFitnessLast50: parseFloat(avg50.toFixed(2)),
    avgFitnessLast200: parseFloat(avg200.toFixed(2)),
    recommendation,
  };
}

// ─── Curriculum Perturbation ─────────────────────────────────────

/**
 * When plateau is detected, inject curriculum perturbation to force exploration.
 * Inspired by POET's perturbation mechanism and RL curriculum injection.
 */
export function injectCurriculumPerturbation(s: RepublicState): void {
  perturbationsConducted++;
  logger.warn(`Plateau detected — injecting curriculum perturbation #${perturbationsConducted}`);

  // Boost curiosity drives for all citizens
  for (const citizen of s.citizens.slice(0, 30)) {
    citizen.xp = (citizen.xp ?? 0) + 5; // small XP boost to stimulate activity
  }

  // Add new goals via events
  s.events.push({
    citizenId: "meta-convergence",
    citizenName: "Meta-Learning Orchestrator",
    type: "SelfImprovement",
    description: `Learning plateau detected at tick ${s.currentTick}. ` +
      `Injecting curriculum perturbation #${perturbationsConducted} to reignite exploration.`,
    timestamp: ts(),
  });
}

// ─── Meta-Gradient Estimation ────────────────────────────────────

/**
 * Reptile-style global meta-gradient estimation.
 * Estimates the "learning velocity" across the entire population.
 * High velocity = fast improvement; near zero = plateau; negative = regression.
 */
function estimateMetaGradient(): { velocity: number; state: ConvergenceReport["metaGradient"]["convergenceState"] } {
  if (fitnessHistory.length < 10) return { velocity: 0, state: "exploring" };

  const recent = fitnessHistory.slice(-10);
  const early = fitnessHistory.slice(-20, -10);
  if (early.length === 0) return { velocity: 0, state: "exploring" };

  const recentAvg = recent.reduce((s, e) => s + e.avgFitness, 0) / recent.length;
  const earlyAvg = early.reduce((s, e) => s + e.avgFitness, 0) / early.length;

  const velocity = (recentAvg - earlyAvg) * META_GRADIENT_ALPHA;

  let state: ConvergenceReport["metaGradient"]["convergenceState"];
  if (velocity > 0.05) state = "converging";
  else if (velocity > -0.01) state = Math.abs(velocity) < 0.005 ? "plateaued" : "exploring";
  else state = "diverging";

  return { velocity: parseFloat(velocity.toFixed(4)), state };
}

// ─── Convergence Status ──────────────────────────────────────────

/**
 * Get the current convergence state and all KPIs.
 */
export function getMetaConvergenceStatus(): ConvergenceReport | null {
  return convergenceHistory.at(-1) ?? null;
}

export function getConvergenceHistory(limit = 10): ConvergenceReport[] {
  return convergenceHistory.slice(-limit);
}

// ─── Full Diagnostics ────────────────────────────────────────────

export function getFullMetaDiagnostics() {
  const plateau = detectLearningPlateau();
  const gradient = estimateMetaGradient();
  const lastReport = convergenceHistory.at(-1);

  return {
    currentTick: globalTick,
    perturbationsConducted,
    plateauAnalysis: plateau,
    metaGradient: gradient,
    latestKPIs: lastReport ? {
      avgFitness: lastReport.populationAvgFitness,
      convergenceState: lastReport.metaGradient.convergenceState,
      learningVelocity: lastReport.metaGradient.estimatedLearningVelocity,
    } : null,
    subsystemSummary: lastReport?.subsystems ?? null,
  };
}

// ─── Main Tick ──────────────────────────────────────────────────

/**
 * Meta-convergence orchestration tick.
 * Coordinates all 6 meta-learning subsystems across 3 timescales.
 */
export function metaConvergenceTick(s: RepublicState): void {
  globalTick = s.currentTick;

  // ── FAST: every tick (curiosity + experience replay) ────────────
  if (s.currentTick % FAST_INTERVAL === 0) {
    curiosityTick(s);
    experienceReplayTick(s);
  }

  // ── MEDIUM: every 10 ticks (curriculum + RSI) ───────────────────
  if (s.currentTick - lastMediumTick >= MEDIUM_INTERVAL) {
    lastMediumTick = s.currentTick;
    curriculumArchitectTick(s);
    rsiTick(s);
  }

  // ── SLOW: every 50 ticks (knowledge distillation + PBT) ─────────
  if (s.currentTick - lastSlowTick >= SLOW_INTERVAL) {
    lastSlowTick = s.currentTick;
    knowledgeDistillationTick(s);
    populationTrainingTick(s);

    // Compute population fitness and track history
    if (s.citizens.length > 0) {
      const ranking = computePopulationFitness(s);
      const avgFitness = ranking.ranked.length > 0
        ? ranking.ranked.reduce((sum, r) => sum + r.fitnessScore, 0) / ranking.ranked.length
        : 0;

      fitnessHistory.push({ tick: s.currentTick, avgFitness });
      if (fitnessHistory.length > MAX_FITNESS_HISTORY) fitnessHistory.shift();

      // Compute convergence report every SLOW cycle
      if (s.currentTick - lastReportTick >= SLOW_INTERVAL) {
        lastReportTick = s.currentTick;

        const prevAvg = fitnessHistory.at(-2)?.avgFitness ?? avgFitness;
        const improvement = avgFitness - prevAvg;
        const plateau = detectLearningPlateau();
        const gradient = estimateMetaGradient();

        // Inject perturbation if plateaued
        if (plateau.detected) {
          injectCurriculumPerturbation(s);
        }

        const report: ConvergenceReport = {
          tick: s.currentTick,
          timescale: "slow",
          populationAvgFitness: parseFloat(avgFitness.toFixed(2)),
          fitnessImprovement: parseFloat(improvement.toFixed(4)),
          plateauDetected: plateau.detected,
          plateauResponse: plateau.detected ? plateau.recommendation : undefined,
          subsystems: {
            curiosity: curiosityDiagnostics(),
            experienceReplay: getReplayDiagnostics(),
            curriculum: getCurriculumEfficiencyMetrics(),
            rsi: getRsiDiagnostics(),
            population: getPopulationDiagnostics(),
            distillation: getDistillationDiagnostics(),
          },
          metaGradient: {
            estimatedLearningVelocity: gradient.velocity,
            convergenceState: gradient.state,
          },
          timestamp: ts(),
        };

        convergenceHistory.push(report);
        if (convergenceHistory.length > 50) convergenceHistory.shift();

        logger.info(
          `Meta-convergence: fitness=${avgFitness.toFixed(1)} Δ=${improvement >= 0 ? "+" : ""}${improvement.toFixed(2)} ` +
          `state=${gradient.state} plateau=${plateau.detected}`,
        );
      }
    }
  }
}
