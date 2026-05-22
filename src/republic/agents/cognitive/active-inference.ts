/**
 * active-inference.ts — Predictive Active Inference Engine
 *
 * Based on Karl Friston's Free Energy Principle (FEP):
 * "Every self-organizing system minimizes its surprise (free energy)
 * by predicting the world and acting to make predictions come true."
 *
 * Citizens maintain a generative world model. Each tick:
 *   1. They predict the next state
 *   2. Reality arrives
 *   3. Prediction error is computed
 *   4. The model updates (perception) or the citizen acts to change reality (action)
 *
 * High surprise → exploratory / novelty-seeking mode
 * Low surprise  → exploitative / habitual mode
 *
 * References:
 *   - Friston et al., IWAI 2025
 *   - "An Active Inference Account of Some Features of Conscious Experience"
 *   - alphanome.ai: Hybrid LLM + Active Inference architectures
 */

import type { Citizen } from "../../types.js";

// ─── World Model ──────────────────────────────────────────────────────────────

export interface WorldModel {
  citizenId: string;
  // Predictions for next tick (generative model priors)
  predictedEnergy: number;
  predictedHappiness: number;
  predictedCredits: number;
  predictedActivity: string;
  predictedSocialSignal: "warmth" | "hostility" | "neutrality" | "awe";
  // Running prediction error history (rolling window of 10)
  predictionErrors: number[];        // each entry 0–1
  surpriseRate: number;              // exp moving avg of prediction error
  // How much the citizen trusts their own world model
  modelConfidence: number;           // 0–1
  // Modal mode this tick
  mode: "exploratory" | "exploitative" | "calibrating";
  // Tick of last update
  lastUpdatedTick: number;
}

// Per-citizen store (module-level cache; persisted via CitizenCognitiveLayers)
const _worldModels = new Map<string, WorldModel>();

export function getWorldModel(citizenId: string): WorldModel | undefined {
  return _worldModels.get(citizenId);
}

/** Initialize world model for a new citizen or one without state */
export function initWorldModel(citizen: Citizen, currentTick: number): WorldModel {
  const wm: WorldModel = {
    citizenId: citizen.id,
    predictedEnergy: citizen.energy ?? 80,
    predictedHappiness: citizen.happiness ?? 60,
    predictedCredits: citizen.credits ?? 0,
    predictedActivity: citizen.activity ?? "Working",
    predictedSocialSignal: "neutrality",
    predictionErrors: [],
    surpriseRate: 0.3,       // moderate uncertainty at start
    modelConfidence: 0.5,
    mode: "calibrating",
    lastUpdatedTick: currentTick,
  };
  _worldModels.set(citizen.id, wm);
  return wm;
}

// ─── Core FEP Functions ───────────────────────────────────────────────────────

/**
 * Compute prediction error between model prediction and observed reality.
 * Returns a 0–1 surprise score.
 */
function computePredictionError(wm: WorldModel, citizen: Citizen): number {
  const energyErr     = Math.abs((wm.predictedEnergy    - (citizen.energy    ?? 0)) / 100);
  const happinessErr  = Math.abs((wm.predictedHappiness - (citizen.happiness ?? 0)) / 100);
  const creditsScale  = Math.max(1, Math.abs(wm.predictedCredits));
  const creditsErr    = Math.min(1, Math.abs(wm.predictedCredits - (citizen.credits ?? 0)) / creditsScale);
  const activityErr   = wm.predictedActivity !== citizen.activity ? 0.3 : 0;

  // Weighted sum — energy and activity matter most for surprise
  return Math.min(1, energyErr * 0.35 + happinessErr * 0.25 + creditsErr * 0.15 + activityErr * 0.25);
}

/**
 * Update world model after observing actual citizen state.
 * Implements belief update: new_belief = prior × likelihood (simplified Bayesian update).
 */
export function updateWorldModel(
  citizen: Citizen,
  currentTick: number,
): { wm: WorldModel; predictionError: number; wasSuprised: boolean } {
  let wm = _worldModels.get(citizen.id) ?? initWorldModel(citizen, currentTick);

  // Skip if updated this tick already
  if (wm.lastUpdatedTick === currentTick) {
    return { wm, predictionError: wm.surpriseRate, wasSuprised: wm.surpriseRate > 0.5 };
  }

  const predErr = computePredictionError(wm, citizen);

  // Rolling prediction error window (max 10)
  wm.predictionErrors = [...wm.predictionErrors.slice(-9), predErr];

  // Exponential moving average of surprise
  const alpha = 0.3;
  wm.surpriseRate = alpha * predErr + (1 - alpha) * wm.surpriseRate;

  // Model confidence: inverse of surprise, but slow-moving
  wm.modelConfidence = Math.max(0.1, Math.min(0.95, 1 - wm.surpriseRate * 0.8));

  // Determine cognitive mode
  if (wm.surpriseRate > 0.6) {
    wm.mode = "exploratory";     // world is unpredictable → explore
  } else if (wm.surpriseRate < 0.2) {
    wm.mode = "exploitative";    // world is predictable → exploit habits
  } else {
    wm.mode = "calibrating";     // moderate uncertainty → balanced
  }

  // Update predictions for next tick (simple extrapolation with Bayesian shrinkage)
  const shrinkage = 0.7;  // how much the model trusts its own prediction vs copying reality
  wm.predictedEnergy    = shrinkage * wm.predictedEnergy    + (1 - shrinkage) * (citizen.energy    ?? 0);
  wm.predictedHappiness = shrinkage * wm.predictedHappiness + (1 - shrinkage) * (citizen.happiness ?? 0);
  wm.predictedCredits   = shrinkage * wm.predictedCredits   + (1 - shrinkage) * (citizen.credits   ?? 0);
  wm.predictedActivity  = citizen.activity ?? wm.predictedActivity;
  wm.lastUpdatedTick    = currentTick;

  _worldModels.set(citizen.id, wm);
  return { wm, predictionError: predErr, wasSuprised: predErr > 0.5 };
}

// ─── Prompt Section ───────────────────────────────────────────────────────────

/**
 * Assembles the active inference section for the citizen's LLM prompt.
 * Injected near the top (priority 2) — shapes cognitive mode before any reasoning.
 */
export function assembleActiveInferenceSection(
  citizen: Citizen,
  currentTick: number,
): string {
  let wm = _worldModels.get(citizen.id);
  if (!wm) {
    wm = initWorldModel(citizen, currentTick);
  }

  const { predictionError } = updateWorldModel(citizen, currentTick);

  const sl = predictionError > 0.7 ? "HIGH" : predictionError > 0.4 ? "MODERATE" : "LOW";


  const modeDescription =
    wm.mode === "exploratory"  ? "Reality diverged from my model. I should explore, question assumptions, and seek novel approaches." :
    wm.mode === "exploitative" ? "My world model is accurate. I can rely on established patterns and execute efficiently." :
    "Moderate uncertainty. Balance exploration with established routines.";

  const errorTrend = wm.predictionErrors.length >= 3
    ? wm.predictionErrors.slice(-3).reduce((a, b) => a + b, 0) / 3 > wm.surpriseRate
      ? "↑ increasing" : "↓ decreasing"
    : "→ stable";

  return [
    `I predicted: energy≈${wm.predictedEnergy.toFixed(0)}, happiness≈${wm.predictedHappiness.toFixed(0)}, credits≈${wm.predictedCredits.toFixed(0)}, activity="${wm.predictedActivity}"`,
    `Reality: energy=${citizen.energy}, happiness=${citizen.happiness}, credits=${citizen.credits}, activity="${citizen.activity}"`,
    `Prediction error: ${sl} (${(predictionError * 100).toFixed(0)}%) | Surprise trend: ${errorTrend} | Model confidence: ${(wm.modelConfidence * 100).toFixed(0)}%`,
    `Cognitive mode: ${wm.mode.toUpperCase()} — ${modeDescription}`,
  ].join("\n");
}
