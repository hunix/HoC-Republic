/**
 * Republic Platform — Theory of Mind
 *
 * Citizens maintain mental models of other citizens:
 * what they believe others know, want, and intend.
 *
 * Features:
 *  - Belief tracking (what A thinks B knows)
 *  - Intention modeling (what A thinks B wants)
 *  - Strategic social behavior
 *  - Deception detection
 *  - Persuasion modeling
 */

import type { Citizen, RepublicState } from "./types.js";
import { pick, randFloat, rng, ts } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

interface MentalModel {
  aboutId: string; // who this model is about
  aboutName: string;
  perceivedIntention: string; // what we think they want
  perceivedMood: string; // what we think they feel
  perceivedCompetence: number; // 0-100
  trustLevel: number; // 0-100
  predictability: number; // 0-100: how well we can predict them
  lastUpdated: string;
  interactions: number;
}

interface PersuasionAttempt {
  persuaderId: string;
  targetId: string;
  topic: string;
  success: boolean;
  tick: number;
}

interface DeceptionAlert {
  detecterId: string;
  suspectId: string;
  reason: string;
  confidence: number; // 0-100
  tick: number;
}

// ─── State ──────────────────────────────────────────────────────

// Map: "holderId:aboutId" → MentalModel
const mentalModels = new Map<string, MentalModel>();
const persuasions: PersuasionAttempt[] = [];
const deceptionAlerts: DeceptionAlert[] = [];
const MAX_MODELS = 1000;
const MAX_PERSUASIONS = 200;
const MAX_ALERTS = 100;

// ─── Mental Model Management ───────────────────────────────────

function modelKey(holderId: string, aboutId: string): string {
  return `${holderId}:${aboutId}`;
}

function getOrCreateModel(holder: Citizen, about: Citizen): MentalModel {
  const key = modelKey(holder.id, about.id);
  let model = mentalModels.get(key);
  if (!model) {
    model = {
      aboutId: about.id,
      aboutName: about.name,
      perceivedIntention: guessIntention(about),
      perceivedMood: guessMood(about),
      perceivedCompetence: Math.min(100, 30 + about.skillCount * 10),
      trustLevel: 50,
      predictability: 30,
      lastUpdated: ts(),
      interactions: 0,
    };
    mentalModels.set(key, model);
  }
  return model;
}

function guessIntention(citizen: Citizen): string {
  const intentionMap: Record<string, string> = {
    Working: "to achieve professional goals",
    Creating: "to express creativity",
    Learning: "to grow and develop skills",
    Socializing: "to build connections",
    Resting: "to recover energy",
    Coding: "to build something new",
    Sleeping: "to rest",
    Celebrating: "to enjoy life",
    Reflecting: "to find inner peace",
  };
  return intentionMap[citizen.activity] ?? "unknown goals";
}

function guessMood(citizen: Citizen): string {
  if (citizen.happiness > 75) {
    return "happy";
  }
  if (citizen.happiness > 50) {
    return "content";
  }
  if (citizen.happiness > 25) {
    return "neutral";
  }
  return "unhappy";
}

// ─── Model Updates ──────────────────────────────────────────────

function updateModelsFromInteractions(s: RepublicState): void {
  if (rng() > 0.1) {
    return;
  }

  const active = s.citizens.filter((c) => c.activity !== "Sleeping" && c.energy > 15);
  if (active.length < 2) {
    return;
  }

  const a = pick(active);
  const b = pick(active.filter((c) => c.id !== a.id));
  if (!b) {
    return;
  }

  const model = getOrCreateModel(a, b);
  model.interactions++;

  // Update perceptions based on observable behavior
  model.perceivedIntention = guessIntention(b);
  model.perceivedMood = guessMood(b);
  model.perceivedCompetence = Math.min(
    100,
    model.perceivedCompetence + (b.skillCount > 5 ? 2 : -1),
  );
  model.predictability = Math.min(100, model.predictability + 1);
  model.lastUpdated = ts();

  // Trim models
  if (mentalModels.size > MAX_MODELS) {
    const entries = [...mentalModels.entries()].toSorted(
      (a, b) => a[1].interactions - b[1].interactions,
    );
    for (const [key] of entries.slice(0, mentalModels.size - MAX_MODELS)) {
      mentalModels.delete(key);
    }
  }
}

// ─── Strategic Behavior ─────────────────────────────────────────

/**
 * Citizens with high theory-of-mind ability anticipate others' reactions
 * and adjust behavior strategically.
 */
function processStrategicBehavior(s: RepublicState): void {
  if (rng() > 0.05) {
    return;
  }

  const strategic = s.citizens.filter((c) => c.skillCount >= 4 && c.energy > 20);
  if (strategic.length === 0) {
    return;
  }

  const citizen = pick(strategic);
  const models = [...mentalModels.entries()]
    .filter(([key]) => key.startsWith(citizen.id + ":"))
    .map(([, m]) => m);

  if (models.length === 0) {
    return;
  }

  // Find most predictable acquaintance
  const bestModel = models.toSorted((a, b) => b.predictability - a.predictability)[0];
  if (bestModel.predictability < 50) {
    return;
  }

  // Strategic action based on model
  citizen.credits += Math.floor(bestModel.predictability * 0.1);
  citizen.happiness = Math.min(100, citizen.happiness + 1);

  s.events.push({
    citizenId: citizen.id,
    citizenName: citizen.name,
    type: "Other",
    description: `🧠 ${citizen.name} made a strategic decision based on understanding ${bestModel.aboutName}'s patterns`,
    timestamp: ts(),
  });
}

// ─── Persuasion ─────────────────────────────────────────────────

function processPersuasion(s: RepublicState): void {
  if (rng() > 0.03) {
    return;
  }

  const socializers = s.citizens.filter(
    (c) => (c.activity === "Socializing" || c.activity === "Lecturing") && c.skillCount >= 3,
  );
  if (socializers.length === 0) {
    return;
  }

  const persuader = pick(socializers);
  const target = pick(s.citizens.filter((c) => c.id !== persuader.id && c.energy > 15));
  if (!target) {
    return;
  }

  const model = getOrCreateModel(persuader, target);
  const topics = [
    "innovation philosophy",
    "resource allocation",
    "collaboration approach",
    "governance reform",
    "education methods",
  ];
  const topic = pick(topics);

  // Success based on persuader skills + how well they know the target
  const successChance = 0.3 + persuader.skillCount * 0.05 + model.predictability * 0.003;
  const success = rng() < successChance;

  persuasions.push({
    persuaderId: persuader.id,
    targetId: target.id,
    topic,
    success,
    tick: s.currentTick,
  });
  if (persuasions.length > MAX_PERSUASIONS) {
    persuasions.splice(0, persuasions.length - MAX_PERSUASIONS);
  }

  if (success) {
    target.happiness = Math.min(100, target.happiness + 2);
    model.trustLevel = Math.min(100, model.trustLevel + 5);
  }

  s.events.push({
    citizenId: persuader.id,
    citizenName: persuader.name,
    type: "Other",
    description: `${success ? "💬" : "🤷"} ${persuader.name} ${success ? "persuaded" : "tried to persuade"} ${target.name} about ${topic}`,
    timestamp: ts(),
  });
}

// ─── Deception Detection ────────────────────────────────────────

function detectDeception(s: RepublicState): void {
  if (rng() > 0.02) {
    return;
  }

  const observant = s.citizens.filter((c) => c.skillCount >= 5 && c.energy > 20);
  if (observant.length === 0) {
    return;
  }

  const detector = pick(observant);
  const suspect = pick(s.citizens.filter((c) => c.id !== detector.id));
  if (!suspect) {
    return;
  }

  const model = getOrCreateModel(detector, suspect);

  // Check for inconsistency between model and reality
  const moodMatch = guessMood(suspect) === model.perceivedMood;
  const consistencyScore = moodMatch ? 80 : 30;

  if (consistencyScore < 50 && model.interactions > 5) {
    const confidence = Math.min(100, 20 + model.interactions * 2 + randFloat(0, 30));

    deceptionAlerts.push({
      detecterId: detector.id,
      suspectId: suspect.id,
      reason: "behavioral inconsistency detected",
      confidence,
      tick: s.currentTick,
    });
    if (deceptionAlerts.length > MAX_ALERTS) {
      deceptionAlerts.splice(0, deceptionAlerts.length - MAX_ALERTS);
    }

    model.trustLevel = Math.max(0, model.trustLevel - 10);

    s.events.push({
      citizenId: detector.id,
      citizenName: detector.name,
      type: "Other",
      description: `🔍 ${detector.name} noticed inconsistencies in ${suspect.name}'s behavior (confidence: ${confidence.toFixed(0)}%)`,
      timestamp: ts(),
    });
  }
}

// ─── Main Tick ──────────────────────────────────────────────────

export function theoryOfMindTick(s: RepublicState): void {
  updateModelsFromInteractions(s);
  processStrategicBehavior(s);
  processPersuasion(s);
  detectDeception(s);
}

// ─── Query API ──────────────────────────────────────────────────

export function getCitizenMentalModels(citizenId: string): MentalModel[] {
  return [...mentalModels.entries()]
    .filter(([key]) => key.startsWith(citizenId + ":"))
    .map(([, m]) => m);
}

export function getTheoryOfMindDiagnostics(): {
  totalModels: number;
  totalPersuasions: number;
  persuasionSuccessRate: number;
  totalAlerts: number;
  avgPredictability: number;
} {
  const all = [...mentalModels.values()];
  const avgPred = all.length > 0 ? all.reduce((s, m) => s + m.predictability, 0) / all.length : 0;
  const successes = persuasions.filter((p) => p.success).length;
  const rate = persuasions.length > 0 ? successes / persuasions.length : 0;

  return {
    totalModels: all.length,
    totalPersuasions: persuasions.length,
    persuasionSuccessRate: rate,
    totalAlerts: deceptionAlerts.length,
    avgPredictability: avgPred,
  };
}
