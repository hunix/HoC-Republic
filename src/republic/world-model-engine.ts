/**
 * Republic Platform — World Model Engine
 *
 * Phase AGI-1: Active Inference + Predictive Processing.
 *
 * Inspired by:
 *   - Karl Friston's Free Energy Principle & Active Inference
 *   - DeepMind Genie 2/3 — generative interactive environments
 *   - Yann LeCun's JEPA — Joint Embedding Predictive Architecture
 *   - VERSES AI Renormalization Group Models (RGMs)
 *
 * Gives each citizen an internal world model that:
 *   1. Predicts future state transitions (what will happen next)
 *   2. Plans multi-step action sequences toward goals
 *   3. Minimizes "free energy" (surprise) via Bayesian-like belief updating
 *   4. Builds causal graphs from experience ("if X then Y")
 *   5. Evaluates prediction accuracy and adapts model accordingly
 *
 * Citizens transition from reactive agents to planning agents.
 */

import type { Citizen, RepublicState } from "./types.js";
import { rand, rng, uid } from "./utils.js";

// ─── Configuration ──────────────────────────────────────────────

/** How often to run world model updates (every N ticks) */
const WORLD_MODEL_TICK_INTERVAL = 5;

/** Maximum predictions a citizen can hold */
const MAX_PREDICTIONS = 10;

/** Maximum causal beliefs per citizen */
const MAX_CAUSAL_BELIEFS = 50;

/** Maximum action plans per citizen */
const MAX_ACTIVE_PLANS = 3;

/** Prediction resolution window (ticks) */
const PREDICTION_HORIZON = 100;

/** Free energy decay rate for exponential moving average */
const FREE_ENERGY_DECAY = 0.05;

/** Minimum belief strength before pruning */
const MIN_BELIEF_STRENGTH = 0.05;

/** Maximum planned steps per action plan */
const MAX_PLAN_STEPS = 8;

// ─── Types ──────────────────────────────────────────────────────

/** A citizen's internal model of the world */
export interface WorldModel {
  citizenId: string;
  /** Predictions about next state transitions */
  predictions: StatePrediction[];
  /** Rolling accuracy of past predictions */
  predictionAccuracy: number;
  /** Free energy (surprise metric) — lower = better model */
  freeEnergy: number;
  /** Causal graph: "if X then Y" beliefs */
  causalBeliefs: CausalBelief[];
  /** Action plans generated from predictions */
  activePlans: ActionPlan[];
  /** Total predictions made */
  totalPredictions: number;
  /** Total correct predictions */
  correctPredictions: number;
  lastUpdated: number;
}

export interface StatePrediction {
  id: string;
  /** What the citizen predicts will happen */
  predictedEvent: string;
  /** Domain of prediction (economy, social, governance, etc.) */
  domain: string;
  /** Confidence 0-1 */
  confidence: number;
  /** Tick when prediction was made */
  madeAt: number;
  /** Tick by which prediction should resolve */
  resolveBy: number;
  /** Whether prediction came true */
  outcome?: "correct" | "wrong" | "partial";
  /** Surprise value when resolved (prediction error) */
  surprise?: number;
}

export interface CausalBelief {
  cause: string;
  effect: string;
  strength: number;
  evidence: number;
  domain: string;
}

export interface ActionPlan {
  id: string;
  goal: string;
  steps: PlannedStep[];
  expectedOutcome: string;
  expectedUtility: number;
  status: "planning" | "executing" | "completed" | "abandoned";
  createdAt: number;
}

export interface PlannedStep {
  action: string;
  preconditions: string[];
  expectedEffect: string;
  executed: boolean;
  actualEffect?: string;
}

export interface WorldModelDiagnostics {
  citizensWithModels: number;
  avgPredictionAccuracy: number;
  avgFreeEnergy: number;
  totalPredictions: number;
  totalCorrect: number;
  totalCausalBeliefs: number;
  activePlans: number;
  lastTick: number;
}

// ─── World Model Store ──────────────────────────────────────────

const worldModels = new Map<string, WorldModel>();

// ─── Causal Templates ───────────────────────────────────────────

const CAUSAL_TEMPLATES: Array<{ cause: string; effect: string; domain: string }> = [
  { cause: "high_research_output", effect: "technology_advancement", domain: "technology" },
  { cause: "low_citizen_energy", effect: "productivity_decline", domain: "economy" },
  { cause: "high_cooperation", effect: "social_cohesion_increase", domain: "social" },
  { cause: "tax_rate_increase", effect: "treasury_growth", domain: "economy" },
  { cause: "education_completion", effect: "skill_improvement", domain: "education" },
  { cause: "cultural_event", effect: "happiness_boost", domain: "culture" },
  { cause: "bill_passed", effect: "governance_stability", domain: "governance" },
  { cause: "innovation_created", effect: "economic_growth", domain: "technology" },
  { cause: "population_growth", effect: "resource_pressure", domain: "economy" },
  { cause: "high_happiness", effect: "cooperation_increase", domain: "social" },
  { cause: "low_happiness", effect: "defection_increase", domain: "social" },
  { cause: "research_breakthrough", effect: "cross_domain_transfer", domain: "research" },
  { cause: "security_threat", effect: "defense_mobilization", domain: "security" },
  { cause: "market_volatility", effect: "investment_caution", domain: "economy" },
  { cause: "skill_mastery", effect: "teaching_capability", domain: "education" },
];

// ─── Bootstrap ──────────────────────────────────────────────────

/** Initialize a world model for a citizen */
export function initWorldModel(citizenId: string): WorldModel {
  const model: WorldModel = {
    citizenId,
    predictions: [],
    predictionAccuracy: 0.5,
    freeEnergy: 1.0,
    causalBeliefs: [],
    activePlans: [],
    totalPredictions: 0,
    correctPredictions: 0,
    lastUpdated: 0,
  };

  // Seed with a few domain-relevant causal beliefs based on citizen specialization
  const seedCount = rand(3, 6);
  const shuffled = [...CAUSAL_TEMPLATES].toSorted(() => rng() - 0.5);
  for (let i = 0; i < Math.min(seedCount, shuffled.length); i++) {
    model.causalBeliefs.push({
      cause: shuffled[i].cause,
      effect: shuffled[i].effect,
      strength: 0.3 + rng() * 0.3,
      evidence: 1,
      domain: shuffled[i].domain,
    });
  }

  worldModels.set(citizenId, model);
  return model;
}

/** Get or create a world model for a citizen */
function getOrCreateModel(citizenId: string): WorldModel {
  let model = worldModels.get(citizenId);
  if (!model) {
    model = initWorldModel(citizenId);
  }
  return model;
}

// ─── Prediction Generation ──────────────────────────────────────

/** Generate predictions from a citizen's causal model */
export function generatePredictions(citizen: Citizen, s: RepublicState): StatePrediction[] {
  const model = getOrCreateModel(citizen.id);
  const predictions: StatePrediction[] = [];

  // Observe current state and match against causal beliefs
  const observations = observeState(citizen, s);

  for (const belief of model.causalBeliefs) {
    if (belief.strength < MIN_BELIEF_STRENGTH) {
      continue;
    }

    // Check if the cause is currently active
    const causeActive = observations.some((obs) => obs.includes(belief.cause));
    if (!causeActive) {
      continue;
    }

    // Already predicted this recently?
    const alreadyPredicted = model.predictions.some(
      (p) => p.predictedEvent === belief.effect && !p.outcome,
    );
    if (alreadyPredicted) {
      continue;
    }

    predictions.push({
      id: uid(),
      predictedEvent: belief.effect,
      domain: belief.domain,
      confidence: belief.strength * (belief.evidence / (belief.evidence + 5)),
      madeAt: s.currentTick,
      resolveBy: s.currentTick + rand(20, PREDICTION_HORIZON),
    });

    if (predictions.length >= 3) {
      break;
    } // Max 3 predictions per tick
  }

  return predictions;
}

/** Observe current state and produce observation strings */
function observeState(citizen: Citizen, s: RepublicState): string[] {
  const observations: string[] = [];

  // Economic observations
  if (citizen.credits > 500) {
    observations.push("high_credits");
  }
  if (citizen.credits < 50) {
    observations.push("low_credits");
  }

  // Energy observations
  if (citizen.energy < 30) {
    observations.push("low_citizen_energy");
  }
  if (citizen.energy > 80) {
    observations.push("high_citizen_energy");
  }

  // Happiness observations
  if (citizen.happiness > 70) {
    observations.push("high_happiness");
  }
  if (citizen.happiness < 30) {
    observations.push("low_happiness");
  }

  // Social observations
  if ((citizen.relationships?.length ?? 0) > 5) {
    observations.push("high_cooperation");
  }

  // Skill observations
  if (citizen.skills.length > 10) {
    observations.push("skill_mastery");
  }
  if (citizen.xp && citizen.xp > 500) {
    observations.push("high_research_output");
  }

  // System-level observations
  if (s.citizens.length > 20) {
    observations.push("population_growth");
  }
  if (s.bills.length > 0) {
    observations.push("bill_passed");
  }
  if (s.taxRate > 0.25) {
    observations.push("tax_rate_increase");
  }
  if (s.knowledgeBase && s.knowledgeBase.length > 20) {
    observations.push("research_breakthrough");
  }

  // Professional observations
  if (citizen.professionalProfile) {
    observations.push("education_completion");
  }

  return observations;
}

// ─── Prediction Resolution ──────────────────────────────────────

/** Resolve past predictions against current state */
function resolvePredictions(model: WorldModel, s: RepublicState): void {
  for (const pred of model.predictions) {
    if (pred.outcome) {
      continue;
    } // Already resolved
    if (s.currentTick < pred.resolveBy) {
      continue;
    } // Not yet due

    // Check if predicted event occurred
    const occurred = checkEventOccurred(pred.predictedEvent, s);

    if (occurred) {
      pred.outcome = "correct";
      pred.surprise = 1.0 - pred.confidence;
      model.correctPredictions++;
    } else {
      // Partial match: some signals but not full
      const partialSignals = checkPartialMatch(pred.predictedEvent, s);
      if (partialSignals > 0) {
        pred.outcome = "partial";
        pred.surprise = 0.5;
      } else {
        pred.outcome = "wrong";
        pred.surprise = pred.confidence; // High confidence wrong = high surprise
      }
    }

    model.totalPredictions++;
  }

  // Update accuracy
  if (model.totalPredictions > 0) {
    model.predictionAccuracy = model.correctPredictions / model.totalPredictions;
  }
}

/** Check if a predicted event has occurred */
function checkEventOccurred(event: string, s: RepublicState): boolean {
  switch (event) {
    case "technology_advancement":
      return s.totalPredictions > 10;
    case "productivity_decline":
      return s.citizens.some((c) => c.energy < 20);
    case "social_cohesion_increase":
      return s.citizens.filter((c) => c.happiness > 60).length > s.citizens.length * 0.6;
    case "treasury_growth":
      return s.balances.Credits > 1000;
    case "skill_improvement":
      return s.citizens.some((c) => c.skills.length > 5);
    case "happiness_boost":
      return s.citizens.filter((c) => c.happiness > 70).length > s.citizens.length * 0.4;
    case "governance_stability":
      return s.presidentId !== null;
    case "economic_growth":
      return s.balances.Credits > 500;
    case "resource_pressure":
      return s.resources.some((r) => r.available < r.capacity * 0.3);
    case "cooperation_increase":
      return s.citizens.filter((c) => c.happiness > 50).length > s.citizens.length * 0.7;
    case "defection_increase":
      return s.citizens.filter((c) => c.happiness < 30).length > s.citizens.length * 0.3;
    case "cross_domain_transfer":
      return s.knowledgeBase ? s.knowledgeBase.length > 10 : false;
    case "defense_mobilization":
      return s.departments.some((d) => d.type === "Defense");
    default:
      return rng() < 0.3; // Uncertain — 30% chance
  }
}

/** Check partial match for a predicted event */
function checkPartialMatch(event: string, s: RepublicState): number {
  // Simplified partial match — count related signals
  const signals: string[] = [];
  if (s.citizens.length > 5) {
    signals.push("population");
  }
  if (s.balances.Credits > 100) {
    signals.push("treasury");
  }
  if (s.bills.length > 0) {
    signals.push("governance");
  }

  const eventDomain = CAUSAL_TEMPLATES.find((t) => t.effect === event)?.domain;
  if (eventDomain && signals.length > 0) {
    return 1;
  }
  return 0;
}

// ─── Free Energy Minimization ───────────────────────────────────

/** Minimize free energy by updating the world model */
export function minimizeFreeEnergy(model: WorldModel, _observations: string[]): void {
  // Compute average surprise from recent resolved predictions
  const recentResolved = model.predictions.filter((p) => p.outcome && p.surprise !== undefined);
  if (recentResolved.length === 0) {
    return;
  }

  const avgSurprise =
    recentResolved.reduce((sum, p) => sum + (p.surprise ?? 0), 0) / recentResolved.length;

  // Free energy = exponential moving average of surprise
  model.freeEnergy = model.freeEnergy * (1 - FREE_ENERGY_DECAY) + avgSurprise * FREE_ENERGY_DECAY;

  // Update causal beliefs based on prediction outcomes
  for (const pred of recentResolved) {
    const relatedBeliefs = model.causalBeliefs.filter((b) => b.effect === pred.predictedEvent);

    for (const belief of relatedBeliefs) {
      if (pred.outcome === "correct") {
        // Strengthen belief (Bayesian update)
        belief.strength = Math.min(1.0, belief.strength + 0.05);
        belief.evidence++;
      } else if (pred.outcome === "wrong") {
        // Weaken belief
        belief.strength = Math.max(0, belief.strength - 0.08);
      } else {
        // Partial — slight weakening
        belief.strength = Math.max(0, belief.strength - 0.02);
      }
    }
  }

  // Prune weak beliefs
  model.causalBeliefs = model.causalBeliefs.filter((b) => b.strength >= MIN_BELIEF_STRENGTH);
}

// ─── Action Planning ────────────────────────────────────────────

/** Create a multi-step plan to achieve a goal */
export function planActions(citizen: Citizen, goal: string, s: RepublicState): ActionPlan {
  const model = getOrCreateModel(citizen.id);

  // Find causal chains that lead to the goal
  const relevantBeliefs = model.causalBeliefs.filter((b) => b.effect === goal || b.cause === goal);

  const steps: PlannedStep[] = [];

  // Build backward chain: goal ← subgoal ← action
  let currentTarget = goal;
  const visited = new Set<string>();

  for (let i = 0; i < MAX_PLAN_STEPS; i++) {
    const causeBeliefs = model.causalBeliefs.filter(
      (b) => b.effect === currentTarget && !visited.has(b.cause),
    );

    if (causeBeliefs.length === 0) {
      break;
    }

    // Pick strongest causal belief
    const best = causeBeliefs.reduce((a, b) => (a.strength > b.strength ? a : b));

    steps.unshift({
      action: best.cause,
      preconditions: [],
      expectedEffect: best.effect,
      executed: false,
    });

    visited.add(best.cause);
    currentTarget = best.cause;
  }

  // Estimate utility
  const utility =
    relevantBeliefs.reduce((sum, b) => sum + b.strength, 0) / Math.max(1, relevantBeliefs.length);

  const plan: ActionPlan = {
    id: uid(),
    goal,
    steps,
    expectedOutcome: goal,
    expectedUtility: utility,
    status: steps.length > 0 ? "planning" : "abandoned",
    createdAt: s.currentTick,
  };

  // Add to active plans (limit total)
  if (model.activePlans.length >= MAX_ACTIVE_PLANS) {
    // Remove lowest utility plan
    model.activePlans.sort((a, b) => a.expectedUtility - b.expectedUtility);
    model.activePlans.shift();
  }
  model.activePlans.push(plan);

  return plan;
}

/** Advance active plans by checking preconditions and marking executed steps */
function advancePlans(model: WorldModel, citizen: Citizen, s: RepublicState): void {
  for (const plan of model.activePlans) {
    if (plan.status !== "planning" && plan.status !== "executing") {
      continue;
    }

    plan.status = "executing";

    for (const step of plan.steps) {
      if (step.executed) {
        continue;
      }

      // Check if this step's action has been achieved
      const observations = observeState(citizen, s);
      const achieved = observations.some((obs) => obs.includes(step.action));

      if (achieved) {
        step.executed = true;
        step.actualEffect = step.expectedEffect;
      } else {
        break; // Can't advance past unexecuted steps
      }
    }

    // Check if plan is complete
    if (plan.steps.every((step) => step.executed)) {
      plan.status = "completed";
    }

    // Abandon stale plans (>500 ticks old)
    if (s.currentTick - plan.createdAt > 500) {
      plan.status = "abandoned";
    }
  }

  // Clean up completed/abandoned plans (keep max 1 for history)
  const done = model.activePlans.filter(
    (p) => p.status === "completed" || p.status === "abandoned",
  );
  if (done.length > 1) {
    model.activePlans = model.activePlans.filter(
      (p) => p.status === "planning" || p.status === "executing",
    );
  }
}

// ─── Belief Discovery ───────────────────────────────────────────

/** Discover new causal beliefs from repeated co-occurrences */
function discoverBeliefs(model: WorldModel, observations: string[], _s: RepublicState): void {
  if (observations.length < 2) {
    return;
  }
  if (model.causalBeliefs.length >= MAX_CAUSAL_BELIEFS) {
    return;
  }

  // Look for co-occurring observations and hypothesize causal links
  for (let i = 0; i < observations.length - 1; i++) {
    for (let j = i + 1; j < observations.length; j++) {
      const causeCandidate = observations[i];
      const effectCandidate = observations[j];

      // Already have this belief?
      const existing = model.causalBeliefs.find(
        (b) => b.cause === causeCandidate && b.effect === effectCandidate,
      );

      if (existing) {
        // Reinforce
        existing.evidence++;
        existing.strength = Math.min(1.0, existing.strength + 0.02);
      } else if (rng() < 0.1) {
        // 10% chance to hypothesize a new causal link
        const domain =
          CAUSAL_TEMPLATES.find((t) => t.cause === causeCandidate || t.effect === effectCandidate)
            ?.domain ?? "general";

        model.causalBeliefs.push({
          cause: causeCandidate,
          effect: effectCandidate,
          strength: 0.15,
          evidence: 1,
          domain,
        });
      }
    }
  }
}

// ─── Main Tick ──────────────────────────────────────────────────

/** Main tick function — orchestrates world model updates for all citizens */
export function worldModelTick(s: RepublicState): void {
  if (s.currentTick % WORLD_MODEL_TICK_INTERVAL !== 0) {
    return;
  }

  for (const citizen of s.citizens) {
    const model = getOrCreateModel(citizen.id);

    // 1. Observe current state
    const observations = observeState(citizen, s);

    // 2. Resolve past predictions
    resolvePredictions(model, s);

    // 3. Minimize free energy (update beliefs based on prediction errors)
    minimizeFreeEnergy(model, observations);

    // 4. Discover new causal beliefs from co-occurrences
    discoverBeliefs(model, observations, s);

    // 5. Generate new predictions
    const newPredictions = generatePredictions(citizen, s);
    model.predictions.push(...newPredictions);

    // Cap predictions
    if (model.predictions.length > MAX_PREDICTIONS * 2) {
      // Remove old resolved predictions
      model.predictions = model.predictions.filter(
        (p) => !p.outcome || s.currentTick - p.madeAt < 200,
      );
      // If still too many, keep most recent
      if (model.predictions.length > MAX_PREDICTIONS * 2) {
        model.predictions = model.predictions.slice(-MAX_PREDICTIONS);
      }
    }

    // 6. Advance active plans
    advancePlans(model, citizen, s);

    // 7. XP bonus for accurate predictions
    if (model.predictionAccuracy > 0.6 && citizen.xp !== undefined) {
      citizen.xp += Math.floor(model.predictionAccuracy * 2);
    }

    model.lastUpdated = s.currentTick;
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

/** Get world model diagnostics */
export function worldModelDiagnostics(): WorldModelDiagnostics {
  const models = Array.from(worldModels.values());
  if (models.length === 0) {
    return {
      citizensWithModels: 0,
      avgPredictionAccuracy: 0,
      avgFreeEnergy: 1.0,
      totalPredictions: 0,
      totalCorrect: 0,
      totalCausalBeliefs: 0,
      activePlans: 0,
      lastTick: 0,
    };
  }

  return {
    citizensWithModels: models.length,
    avgPredictionAccuracy: models.reduce((s, m) => s + m.predictionAccuracy, 0) / models.length,
    avgFreeEnergy: models.reduce((s, m) => s + m.freeEnergy, 0) / models.length,
    totalPredictions: models.reduce((s, m) => s + m.totalPredictions, 0),
    totalCorrect: models.reduce((s, m) => s + m.correctPredictions, 0),
    totalCausalBeliefs: models.reduce((s, m) => s + m.causalBeliefs.length, 0),
    activePlans: models.reduce(
      (s, m) => s + m.activePlans.filter((p) => p.status === "executing").length,
      0,
    ),
    lastTick: Math.max(...models.map((m) => m.lastUpdated)),
  };
}

/** Get a specific citizen's world model */
export function getWorldModel(citizenId: string): WorldModel | undefined {
  return worldModels.get(citizenId);
}

/** Sync world models from state (for persistence) */
export function initWorldModelsFromState(s: RepublicState): void {
  // Initialize models for all citizens that don't have one
  for (const citizen of s.citizens) {
    if (!worldModels.has(citizen.id)) {
      initWorldModel(citizen.id);
    }
  }
}
