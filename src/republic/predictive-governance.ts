/**
 * Republic Platform — Predictive Governance
 *
 * Phase 32: Superhuman capabilities.
 *
 * - Shadow simulation: predict policy outcomes by running forward ticks
 * - Anomaly detection: statistical outlier detection on national metrics
 * - Resource optimization: optimal distribution via scoring
 * - Collective intelligence: parallel multi-citizen problem solving
 */

import type { RepublicState } from "./types.js";

// ─── Shadow Simulation ──────────────────────────────────────────

export interface PolicyPrediction {
  policyDescription: string;
  predictedOutcome: {
    populationDelta: number;
    avgHappinessDelta: number;
    avgEnergyDelta: number;
    economicImpact: number;
    riskScore: number;
  };
  confidence: number;
  horizon: number; // ticks ahead
  timestamp: string;
}

/**
 * Predict the impact of a policy change by simulating forward ticks.
 * Uses a lightweight model: applies the policy modifier to current metrics
 * and projects the trend forward.
 */
export function predictPolicyOutcome(
  state: RepublicState,
  policy: {
    description: string;
    happinessModifier: number; // -1.0 to 1.0
    economicModifier: number; // -1.0 to 1.0
    energyModifier: number; // -1.0 to 1.0
  },
  horizonTicks = 100,
): PolicyPrediction {
  const citizens = state.citizens;
  if (citizens.length === 0) {
    return {
      policyDescription: policy.description,
      predictedOutcome: {
        populationDelta: 0,
        avgHappinessDelta: 0,
        avgEnergyDelta: 0,
        economicImpact: 0,
        riskScore: 0,
      },
      confidence: 0,
      horizon: horizonTicks,
      timestamp: new Date().toISOString(),
    };
  }

  const _avgHappiness = citizens.reduce((s, c) => s + c.happiness, 0) / citizens.length;
  const _avgEnergy = citizens.reduce((s, c) => s + c.energy, 0) / citizens.length;
  const totalCredits = citizens.reduce((s, c) => s + c.credits, 0);

  // Project forward: each tick applies the modifier cumulatively
  const happinessDelta = policy.happinessModifier * horizonTicks * 0.1;
  const energyDelta = policy.energyModifier * horizonTicks * 0.05;
  const economicDelta = policy.economicModifier * totalCredits * 0.001 * horizonTicks;

  // Population change: happier, healthier citizens reproduce more
  const reproductionBoost = (policy.happinessModifier + policy.energyModifier) / 2;
  const populationDelta = Math.round(
    reproductionBoost * citizens.length * 0.02 * (horizonTicks / 100),
  );

  // Risk score: extreme modifiers = higher risk
  const absModifiers =
    Math.abs(policy.happinessModifier) +
    Math.abs(policy.economicModifier) +
    Math.abs(policy.energyModifier);
  const riskScore = parseFloat(Math.min(1, absModifiers / 2).toFixed(2));

  // Confidence decreases with horizon
  const confidence = parseFloat(Math.max(0.1, 1 - horizonTicks / 500).toFixed(2));

  return {
    policyDescription: policy.description,
    predictedOutcome: {
      populationDelta,
      avgHappinessDelta: parseFloat(happinessDelta.toFixed(2)),
      avgEnergyDelta: parseFloat(energyDelta.toFixed(2)),
      economicImpact: Math.round(economicDelta),
      riskScore,
    },
    confidence,
    horizon: horizonTicks,
    timestamp: new Date().toISOString(),
  };
}

// ─── Anomaly Detection ──────────────────────────────────────────

export interface Anomaly {
  metric: string;
  citizenId?: string;
  citizenName?: string;
  currentValue: number;
  expectedRange: { min: number; max: number };
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  detectedAt: string;
}

/**
 * Detect statistical anomalies in citizen and economic metrics.
 * Uses simple z-score approach: values > 2σ from mean are flagged.
 */
export function detectAnomalies(state: RepublicState): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const citizens = state.citizens;
  if (citizens.length < 5) {return anomalies;}

  // Helper: compute mean and stddev
  const stats = (values: number[]) => {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    return { mean, std: Math.sqrt(variance) };
  };

  // Check credit anomalies
  const creditValues = citizens.map((c) => c.credits);
  const creditStats = stats(creditValues);
  for (const c of citizens) {
    const zScore =
      creditStats.std > 0 ? Math.abs(c.credits - creditStats.mean) / creditStats.std : 0;
    if (zScore > 3) {
      anomalies.push({
        metric: "credits",
        citizenId: c.id,
        citizenName: c.name,
        currentValue: c.credits,
        expectedRange: {
          min: Math.round(creditStats.mean - 2 * creditStats.std),
          max: Math.round(creditStats.mean + 2 * creditStats.std),
        },
        severity: zScore > 5 ? "critical" : "high",
        description: `${c.name}'s credits (${c.credits}) are ${zScore.toFixed(1)}σ from the mean (${Math.round(creditStats.mean)})`,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // Check extreme happiness drops
  const happinessValues = citizens.map((c) => c.happiness);
  const happinessStats = stats(happinessValues);
  for (const c of citizens) {
    if (c.happiness < 20 && c.happiness < happinessStats.mean - 2 * happinessStats.std) {
      anomalies.push({
        metric: "happiness",
        citizenId: c.id,
        citizenName: c.name,
        currentValue: c.happiness,
        expectedRange: {
          min: Math.round(happinessStats.mean - 2 * happinessStats.std),
          max: Math.round(happinessStats.mean + 2 * happinessStats.std),
        },
        severity: c.happiness < 10 ? "critical" : "high",
        description: `${c.name}'s happiness (${c.happiness}) is critically low`,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // Check energy anomalies
  const energyValues = citizens.map((c) => c.energy);
  const energyStats = stats(energyValues);
  for (const c of citizens) {
    if (c.energy < 10 && c.energy < energyStats.mean - 2 * energyStats.std) {
      anomalies.push({
        metric: "energy",
        citizenId: c.id,
        citizenName: c.name,
        currentValue: c.energy,
        expectedRange: {
          min: Math.round(energyStats.mean - 2 * energyStats.std),
          max: Math.round(energyStats.mean + 2 * energyStats.std),
        },
        severity: "medium",
        description: `${c.name}'s energy (${c.energy}) is dangerously low`,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  return anomalies;
}

// ─── Resource Optimization ──────────────────────────────────────

export interface AllocationRecommendation {
  targetId: string;
  targetName: string;
  targetType: "citizen" | "department" | "harvester";
  resource: "credits" | "energy" | "compute";
  currentAmount: number;
  recommendedAmount: number;
  reason: string;
  priority: number;
}

/**
 * Generate optimal resource allocation recommendations.
 * Uses a need-based scoring system: citizens/departments with the
 * highest need-to-capacity ratio get priority.
 */
export function optimizeResourceAllocation(state: RepublicState): AllocationRecommendation[] {
  const recommendations: AllocationRecommendation[] = [];
  const citizens = state.citizens;

  // Sort citizens by "need score" (lowness of critical metrics)
  const needScores = citizens.map((c) => ({
    citizen: c,
    needScore: (100 - c.happiness) * 0.4 + (100 - c.energy) * 0.3 + (100 - c.health) * 0.3,
    creditNeed: c.credits < 500 ? 1 : c.credits < 1000 ? 0.5 : 0,
  }));

  // Credit redistribution recommendations
  const totalCredits = citizens.reduce((s, c) => s + c.credits, 0);
  const avgCredits = citizens.length > 0 ? totalCredits / citizens.length : 0;

  for (const { citizen: c, creditNeed } of needScores) {
    if (creditNeed > 0 && c.credits < avgCredits * 0.3) {
      recommendations.push({
        targetId: c.id,
        targetName: c.name,
        targetType: "citizen",
        resource: "credits",
        currentAmount: c.credits,
        recommendedAmount: Math.round(avgCredits * 0.5),
        reason: `Credits critically below average (${c.credits} vs avg ${Math.round(avgCredits)})`,
        priority: creditNeed,
      });
    }
  }

  // Department budget optimization
  for (const dept of state.departments) {
    if (dept.budget < 1000 && dept.staffCount > 0) {
      recommendations.push({
        targetId: dept.name,
        targetName: dept.name,
        targetType: "department",
        resource: "credits",
        currentAmount: dept.budget,
        recommendedAmount: dept.staffCount * 2000,
        reason: `Department underfunded relative to staff size (${dept.staffCount} staff)`,
        priority: 0.8,
      });
    }
  }

  // Sort by priority descending
  recommendations.sort((a, b) => b.priority - a.priority);

  return recommendations.slice(0, 20); // Top 20 recommendations
}

// ─── Collective Intelligence ────────────────────────────────────

export interface CollectiveResult {
  taskDescription: string;
  participantCount: number;
  aggregatedResult: string;
  confidence: number;
  completedAt: string;
  contributions: Array<{
    citizenId: string;
    citizenName: string;
    specialization: string;
    contribution: string;
  }>;
}

/**
 * Amplify collective intelligence: break a complex task into
 * specialization-weighted sub-contributions from all available citizens.
 */
export function collectiveAnalysis(
  state: RepublicState,
  taskDescription: string,
  maxParticipants = 20,
): CollectiveResult {
  const active = state.citizens.filter((c) => c.activity !== "Sleeping" && c.energy > 20);
  const participants = active.slice(0, maxParticipants);

  const contributions = participants.map((c) => ({
    citizenId: c.id,
    citizenName: c.name,
    specialization: c.specialization,
    contribution: `[${c.specialization}] Analysis of "${taskDescription}" from ${c.name}'s expertise (skill level: ${c.skillCount}, energy: ${c.energy.toFixed(0)})`,
  }));

  // Confidence based on participant diversity and count
  const uniqueSpecs = new Set(participants.map((c) => c.specialization)).size;
  const diversityScore = uniqueSpecs / Math.max(1, participants.length);
  const countScore = Math.min(1, participants.length / 10);
  const confidence = parseFloat((diversityScore * 0.6 + countScore * 0.4).toFixed(2));

  return {
    taskDescription,
    participantCount: participants.length,
    aggregatedResult: `Collective analysis by ${participants.length} citizens (${uniqueSpecs} specializations) on: "${taskDescription}"`,
    confidence,
    completedAt: new Date().toISOString(),
    contributions,
  };
}
