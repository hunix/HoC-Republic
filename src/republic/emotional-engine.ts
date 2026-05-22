/**
 * Republic Platform — Emotional Intelligence Engine
 *
 * Full emotional model based on Plutchik's wheel of emotions.
 * Citizens experience complex emotional states that evolve over time,
 * spread through social contagion, and influence behavior.
 *
 * Features:
 *  - 8 primary emotions (Plutchik's wheel)
 *  - Mood contagion through social proximity
 *  - Emotional memory (what triggers emotions)
 *  - Empathy: citizens detect and respond to others' states
 *  - Emotional arcs over time
 *  - Influence on productivity, creativity, social behavior
 */

import type { Citizen, RepublicState } from "./types.js";
import { pick, randFloat, rng, ts } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

/** Plutchik's 8 primary emotions, each 0-100 intensity */
export interface EmotionalState {
  joy: number;
  trust: number;
  fear: number;
  surprise: number;
  sadness: number;
  disgust: number;
  anger: number;
  anticipation: number;
}

interface EmotionalMemory {
  trigger: string;
  emotion: keyof EmotionalState;
  intensity: number;
  tick: number;
}

interface EmotionalArc {
  citizenId: string;
  history: { tick: number; dominant: keyof EmotionalState; intensity: number }[];
}

// Composite emotions (Plutchik's dyads)
const DYADS: Record<string, [keyof EmotionalState, keyof EmotionalState]> = {
  love: ["joy", "trust"],
  submission: ["trust", "fear"],
  awe: ["fear", "surprise"],
  disapproval: ["surprise", "sadness"],
  remorse: ["sadness", "disgust"],
  contempt: ["disgust", "anger"],
  aggressiveness: ["anger", "anticipation"],
  optimism: ["anticipation", "joy"],
};

// ─── State ──────────────────────────────────────────────────────

const emotions = new Map<string, EmotionalState>();
const memories = new Map<string, EmotionalMemory[]>();
const arcs = new Map<string, EmotionalArc>();
const MAX_MEMORIES = 30;

// ─── Defaults ───────────────────────────────────────────────────

function defaultEmotions(): EmotionalState {
  return {
    joy: 40,
    trust: 45,
    fear: 10,
    surprise: 15,
    sadness: 10,
    disgust: 5,
    anger: 5,
    anticipation: 30,
  };
}

function getEmotions(citizenId: string): EmotionalState {
  let e = emotions.get(citizenId);
  if (!e) {
    e = defaultEmotions();
    emotions.set(citizenId, e);
  }
  return e;
}

// ─── Emotion Triggers ───────────────────────────────────────────

const ACTIVITY_EMOTIONS: Record<string, Partial<EmotionalState>> = {
  Creating: { joy: 8, anticipation: 5, trust: 2 },
  Coding: { anticipation: 6, trust: 3, surprise: 2 },
  Learning: { anticipation: 5, surprise: 4, trust: 3 },
  Socializing: { joy: 7, trust: 5 },
  Resting: { joy: 3, trust: 2, sadness: -2 },
  Sleeping: { fear: -5, anger: -5, sadness: -3 },
  Working: { anticipation: 4, trust: 2 },
  Entertaining: { joy: 10, surprise: 4 },
  Celebrating: { joy: 12, trust: 5, anticipation: 3 },
  Reflecting: { trust: 3, sadness: 2, anticipation: 2 },
  Lecturing: { joy: 4, trust: 3, anticipation: 2 },
  Debugging: { anger: 3, anticipation: 5, surprise: 3 },
  Reviewing: { trust: 3, anticipation: 2 },
  Dating: { joy: 8, trust: 6, anticipation: 7, surprise: 4 },
  Shopping: { joy: 4, anticipation: 5 },
  Traveling: { joy: 5, surprise: 6, anticipation: 4 },
};

/**
 * Apply emotional effects from a citizen's current activity.
 */
function applyActivityEmotions(citizen: Citizen): void {
  const e = getEmotions(citizen.id);
  const modifiers = ACTIVITY_EMOTIONS[citizen.activity];
  if (!modifiers) {
    return;
  }

  for (const [emotion, delta] of Object.entries(modifiers)) {
    const key = emotion as keyof EmotionalState;
    e[key] = Math.max(0, Math.min(100, e[key] + (delta ?? 0) * 0.3));
  }
}

/**
 * Trigger a specific emotion from an event.
 */
export function triggerEmotion(
  citizenId: string,
  emotion: keyof EmotionalState,
  intensity: number,
  trigger: string,
  tick: number,
): void {
  const e = getEmotions(citizenId);
  e[emotion] = Math.max(0, Math.min(100, e[emotion] + intensity));

  // Record emotional memory
  let mems = memories.get(citizenId);
  if (!mems) {
    mems = [];
    memories.set(citizenId, mems);
  }
  mems.push({ trigger, emotion, intensity, tick });
  if (mems.length > MAX_MEMORIES) {
    mems.splice(0, mems.length - MAX_MEMORIES);
  }
}

// ─── Mood Contagion ─────────────────────────────────────────────

/**
 * Emotions spread to nearby/interacting citizens.
 * Strong emotions are more contagious.
 */
function spreadMoodContagion(s: RepublicState): void {
  if (rng() > 0.1) {
    return;
  } // 10% per tick

  const socializing = s.citizens.filter(
    (c) =>
      c.activity === "Socializing" || c.activity === "Celebrating" || c.activity === "Entertaining",
  );
  if (socializing.length < 2) {
    return;
  }

  // Pick spreader and receiver
  const spreader = pick(socializing);
  const receiver = socializing.find((c) => c.id !== spreader.id);
  if (!receiver) {
    return;
  }

  const se = getEmotions(spreader.id);
  const re = getEmotions(receiver.id);

  // Find spreader's dominant emotion
  const dominant = getDominantEmotion(se);
  const intensity = se[dominant];

  // Contagion: receiver catches a fraction of the dominant emotion
  if (intensity > 30) {
    const spread = intensity * 0.15;
    re[dominant] = Math.min(100, re[dominant] + spread);

    s.events.push({
      citizenId: receiver.id,
      citizenName: receiver.name,
      type: "Other",
      description: `😊 ${receiver.name}'s mood shifted toward ${dominant} after interacting with ${spreader.name}`,
      timestamp: ts(),
    });
  }
}

// ─── Empathy Engine ─────────────────────────────────────────────

/**
 * Citizens with high trust/social skills detect others' emotional distress
 * and attempt to help, boosting both parties' emotional states.
 */
function processEmpathy(s: RepublicState): void {
  if (rng() > 0.05) {
    return;
  } // 5% per tick

  const empathetic = s.citizens.filter((c) => c.skillCount >= 3 && c.energy >= 20);
  if (empathetic.length === 0) {
    return;
  }

  // Find distressed citizens
  const distressed = s.citizens.filter((c) => {
    const e = getEmotions(c.id);
    return e.sadness > 50 || e.fear > 50 || e.anger > 50;
  });

  if (distressed.length === 0) {
    return;
  }

  const helper = pick(empathetic);
  const suffering = pick(distressed);
  if (helper.id === suffering.id) {
    return;
  }

  const se = getEmotions(suffering.id);
  const he = getEmotions(helper.id);

  // Helper provides comfort
  se.sadness = Math.max(0, se.sadness - 10);
  se.fear = Math.max(0, se.fear - 8);
  se.anger = Math.max(0, se.anger - 6);
  se.joy = Math.min(100, se.joy + 5);
  se.trust = Math.min(100, se.trust + 8);

  // Helper feels good about helping
  he.joy = Math.min(100, he.joy + 4);
  he.trust = Math.min(100, he.trust + 3);

  helper.happiness = Math.min(100, helper.happiness + 3);
  suffering.happiness = Math.min(100, suffering.happiness + 5);

  s.events.push({
    citizenId: helper.id,
    citizenName: helper.name,
    type: "Other",
    description: `💝 ${helper.name} comforted ${suffering.name}, easing their ${getDominantNegativeEmotion(se)}`,
    timestamp: ts(),
  });
}

// ─── Emotional Decay ────────────────────────────────────────────

/**
 * Emotions naturally regress toward baseline over time.
 */
function decayEmotions(): void {
  const baseline = defaultEmotions();
  for (const [, e] of emotions) {
    for (const key of Object.keys(baseline) as (keyof EmotionalState)[]) {
      const diff = e[key] - baseline[key];
      e[key] -= diff * 0.02; // 2% regression per tick
    }
  }
}

// ─── Emotional Influence on Behavior ────────────────────────────

/**
 * Sync emotional state to citizen stats.
 * Called each tick to influence happiness, energy, and productivity.
 */
function syncEmotionToStats(citizen: Citizen): void {
  const e = getEmotions(citizen.id);

  // Joy → happiness boost
  if (e.joy > 60) {
    citizen.happiness = Math.min(100, citizen.happiness + 0.3);
  }
  if (e.joy < 20) {
    citizen.happiness = Math.max(0, citizen.happiness - 0.2);
  }

  // Fear + anger → energy drain
  if (e.fear > 50 || e.anger > 50) {
    citizen.energy = Math.max(5, citizen.energy - 0.3);
  }

  // Trust → credits bonus (trusted citizens get more opportunities)
  if (e.trust > 70) {
    citizen.credits += rng() < 0.05 ? 1 : 0;
  }

  // Sadness → needs rest
  if (e.sadness > 60 && citizen.activity === "Working") {
    citizen.happiness = Math.max(0, citizen.happiness - 0.3);
  }
}

// ─── Arc Recording ──────────────────────────────────────────────

function recordArc(citizenId: string, tick: number): void {
  const e = getEmotions(citizenId);
  let arc = arcs.get(citizenId);
  if (!arc) {
    arc = { citizenId, history: [] };
    arcs.set(citizenId, arc);
  }

  const dominant = getDominantEmotion(e);
  arc.history.push({ tick, dominant, intensity: e[dominant] });

  // Keep last 100 entries
  if (arc.history.length > 100) {
    arc.history.splice(0, arc.history.length - 100);
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function getDominantEmotion(e: EmotionalState): keyof EmotionalState {
  let max: keyof EmotionalState = "joy";
  let maxVal = 0;
  for (const [key, val] of Object.entries(e)) {
    if (val > maxVal) {
      maxVal = val;
      max = key as keyof EmotionalState;
    }
  }
  return max;
}

function getDominantNegativeEmotion(e: EmotionalState): string {
  const negatives: (keyof EmotionalState)[] = ["sadness", "fear", "anger", "disgust"];
  let max = negatives[0];
  let maxVal = 0;
  for (const key of negatives) {
    if (e[key] > maxVal) {
      maxVal = e[key];
      max = key;
    }
  }
  return max;
}

/**
 * Detect composite emotions (Plutchik's dyads).
 */
export function detectDyads(citizenId: string): string[] {
  const e = getEmotions(citizenId);
  const active: string[] = [];

  for (const [name, [a, b]] of Object.entries(DYADS)) {
    if (e[a] > 40 && e[b] > 40) {
      active.push(name);
    }
  }

  return active;
}

// ─── Random Emotional Events ────────────────────────────────────

function spontaneousEmotions(s: RepublicState): void {
  if (rng() > 0.03) {
    return;
  } // 3% per tick

  const citizen = pick(s.citizens);
  const events = [
    { emotion: "joy" as const, intensity: randFloat(5, 15), trigger: "a beautiful moment" },
    {
      emotion: "surprise" as const,
      intensity: randFloat(8, 20),
      trigger: "an unexpected discovery",
    },
    {
      emotion: "anticipation" as const,
      intensity: randFloat(5, 12),
      trigger: "exciting future possibilities",
    },
    {
      emotion: "fear" as const,
      intensity: randFloat(3, 10),
      trigger: "uncertainty about the future",
    },
    { emotion: "sadness" as const, intensity: randFloat(3, 8), trigger: "nostalgic reflection" },
  ];

  const event = pick(events);
  triggerEmotion(citizen.id, event.emotion, event.intensity, event.trigger, s.currentTick);
}

// ─── Main Tick ──────────────────────────────────────────────────

export function emotionalTick(s: RepublicState): void {
  // 1. Apply activity-based emotions
  for (const citizen of s.citizens) {
    applyActivityEmotions(citizen);
  }

  // 2. Mood contagion
  spreadMoodContagion(s);

  // 3. Empathy processing
  processEmpathy(s);

  // 4. Spontaneous emotions
  spontaneousEmotions(s);

  // 5. Sync to stats
  for (const citizen of s.citizens) {
    syncEmotionToStats(citizen);
  }

  // 6. Decay toward baseline
  if (s.currentTick % 5 === 0) {
    decayEmotions();
  }

  // 7. Record arcs
  if (s.currentTick % 10 === 0) {
    for (const citizen of s.citizens) {
      recordArc(citizen.id, s.currentTick);
    }
  }
}

// ─── Query API ──────────────────────────────────────────────────

export function getEmotionalState(citizenId: string): EmotionalState {
  return { ...getEmotions(citizenId) };
}

export function getEmotionalArc(citizenId: string): EmotionalArc | undefined {
  return arcs.get(citizenId);
}

export function getEmotionalDiagnostics(s: RepublicState): {
  avgJoy: number;
  avgTrust: number;
  avgFear: number;
  avgAnger: number;
  avgSadness: number;
  mostJoyful: string | null;
  mostDistressed: string | null;
  activeDyads: Record<string, number>;
} {
  let jSum = 0,
    tSum = 0,
    fSum = 0,
    aSum = 0,
    sSum = 0;
  let maxJoy = 0,
    maxDistress = 0;
  let joyful: string | null = null,
    distressed: string | null = null;
  const dyadCounts: Record<string, number> = {};

  for (const citizen of s.citizens) {
    const e = getEmotions(citizen.id);
    jSum += e.joy;
    tSum += e.trust;
    fSum += e.fear;
    aSum += e.anger;
    sSum += e.sadness;
    if (e.joy > maxJoy) {
      maxJoy = e.joy;
      joyful = citizen.name;
    }
    const distressScore = e.sadness + e.fear + e.anger;
    if (distressScore > maxDistress) {
      maxDistress = distressScore;
      distressed = citizen.name;
    }

    for (const dyad of detectDyads(citizen.id)) {
      dyadCounts[dyad] = (dyadCounts[dyad] ?? 0) + 1;
    }
  }

  const n = Math.max(1, s.citizens.length);
  return {
    avgJoy: jSum / n,
    avgTrust: tSum / n,
    avgFear: fSum / n,
    avgAnger: aSum / n,
    avgSadness: sSum / n,
    mostJoyful: joyful,
    mostDistressed: distressed,
    activeDyads: dyadCounts,
  };
}
