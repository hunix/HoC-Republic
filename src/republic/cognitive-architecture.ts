/**
 * Republic Platform — Cognitive Architecture Engine
 *
 * Phase AGI-5: ACT-R / SOAR Hybrid Cognitive Model.
 *
 * Inspired by:
 *   - ACT-R (CMU) — declarative + procedural memory modules
 *   - SOAR (U Michigan) — production rules, chunking, and impasses
 *   - MAIA (MIT CSAIL 2024) — automated interpretability agent
 *
 * Gives citizens biologically-inspired cognition:
 *   1. Working memory (7±2 items, decay-based)
 *   2. Attention gating (focus on relevant information)
 *   3. Production rules (IF condition THEN action, usage-strengthened)
 *   4. Metacognition (self-assessment, strategy selection)
 *   5. Cognitive load modeling (high load → more errors)
 */

import type { RepublicState } from "./types.js";
import { rng, uid } from "./utils.js";

// ─── Configuration ──────────────────────────────────────────────

const COGNITIVE_TICK_INTERVAL = 5;
const MAX_WORKING_MEMORY = 9; // 7+2
const MIN_WORKING_MEMORY = 5; // 7-2
const DECAY_RATE = 0.02;
const MAX_PRODUCTION_RULES = 30;
const RULE_STRENGTH_DECAY = 0.005;
const RULE_STRENGTH_BOOST = 0.1;

// ─── Types ──────────────────────────────────────────────────────

export interface CognitiveState {
  workingMemory: WorkingMemoryItem[];
  attentionFocus: string | null;
  attentionStrength: number;
  productionRules: ProductionRule[];
  metacognition: MetaCognition;
  cognitiveLoad: number;
}

export interface WorkingMemoryItem {
  content: string;
  domain: string;
  importance: number;
  addedAt: number;
  decayRate: number;
}

export interface ProductionRule {
  id: string;
  condition: string;
  action: string;
  strength: number;
  uses: number;
  lastUsed: number;
}

export interface MetaCognition {
  calibration: number;
  limitAwareness: number;
  strategySelection: number;
  monitoring: number;
}

export interface CognitiveDiagnostics {
  citizensWithCognition: number;
  avgCognitiveLoad: number;
  avgWorkingMemoryUsage: number;
  totalProductionRules: number;
  avgMetacognition: number;
}

// ─── Cognitive State Store ──────────────────────────────────────

const cognitiveStates = new Map<string, CognitiveState>();

// ─── Initialization ─────────────────────────────────────────────

/** Initialize cognitive state for a citizen */
export function initCognitiveState(citizenId: string): CognitiveState {
  const state: CognitiveState = {
    workingMemory: [],
    attentionFocus: null,
    attentionStrength: 0.5,
    productionRules: [],
    metacognition: {
      calibration: 0.5,
      limitAwareness: 0.3,
      strategySelection: 0.4,
      monitoring: 0.4,
    },
    cognitiveLoad: 0,
  };

  // Seed with basic production rules
  const seedRules: Array<{ condition: string; action: string }> = [
    { condition: "low_energy", action: "rest" },
    { condition: "high_curiosity", action: "research" },
    { condition: "social_opportunity", action: "collaborate" },
    { condition: "skill_gap", action: "learn" },
    { condition: "task_available", action: "work" },
  ];

  for (const rule of seedRules) {
    state.productionRules.push({
      id: uid(),
      condition: rule.condition,
      action: rule.action,
      strength: 0.3 + rng() * 0.3,
      uses: 0,
      lastUsed: 0,
    });
  }

  cognitiveStates.set(citizenId, state);
  return state;
}

function getOrCreateState(citizenId: string): CognitiveState {
  let state = cognitiveStates.get(citizenId);
  if (!state) {state = initCognitiveState(citizenId);}
  return state;
}

// ─── Working Memory ─────────────────────────────────────────────

/** Add item to working memory (displaces weakest if full) */
export function addToWorkingMemory(
  citizenId: string,
  content: string,
  domain: string,
  importance: number,
  tick: number,
): void {
  const state = getOrCreateState(citizenId);
  const capacity =
    MIN_WORKING_MEMORY + Math.floor(rng() * (MAX_WORKING_MEMORY - MIN_WORKING_MEMORY + 1));

  // Attention gating: boost importance if domain matches focus
  const adjustedImportance =
    state.attentionFocus === domain ? importance * (1 + state.attentionStrength) : importance;

  const item: WorkingMemoryItem = {
    content,
    domain,
    importance: adjustedImportance,
    addedAt: tick,
    decayRate: DECAY_RATE,
  };

  if (state.workingMemory.length >= capacity) {
    // Find weakest item
    let weakestIdx = 0;
    let weakestScore = Infinity;
    for (let i = 0; i < state.workingMemory.length; i++) {
      const age = tick - state.workingMemory[i].addedAt;
      const score =
        state.workingMemory[i].importance * Math.exp(-state.workingMemory[i].decayRate * age);
      if (score < weakestScore) {
        weakestScore = score;
        weakestIdx = i;
      }
    }
    state.workingMemory.splice(weakestIdx, 1);
  }

  state.workingMemory.push(item);
}

/** Decay working memory items */
function decayWorkingMemory(state: CognitiveState, tick: number): void {
  state.workingMemory = state.workingMemory.filter((item) => {
    const age = tick - item.addedAt;
    const retention = Math.exp(-item.decayRate * age);
    return retention > 0.1; // Remove items with <10% retention
  });
}

// ─── Production Rules ───────────────────────────────────────────

/** Fire matching production rules against working memory */
export function fireProductionRules(
  citizenId: string,
  tick: number,
): Array<{ ruleId: string; action: string }> {
  const state = getOrCreateState(citizenId);
  const fired: Array<{ ruleId: string; action: string }> = [];
  const wmContents = state.workingMemory.map((item) => item.content).join(" ");

  for (const rule of state.productionRules) {
    if (wmContents.includes(rule.condition) || state.attentionFocus === rule.condition) {
      fired.push({ ruleId: rule.id, action: rule.action });
      rule.uses++;
      rule.lastUsed = tick;
      rule.strength = Math.min(1, rule.strength + RULE_STRENGTH_BOOST);
    }
  }

  // Decay unused rules
  for (const rule of state.productionRules) {
    if (rule.lastUsed !== tick) {
      rule.strength = Math.max(0.05, rule.strength - RULE_STRENGTH_DECAY);
    }
  }

  return fired;
}

/** Learn a new production rule from experience */
export function learnProductionRule(
  citizenId: string,
  condition: string,
  action: string,
  tick: number,
): ProductionRule | null {
  const state = getOrCreateState(citizenId);

  // Already have this rule?
  const existing = state.productionRules.find(
    (r) => r.condition === condition && r.action === action,
  );
  if (existing) {
    existing.strength = Math.min(1, existing.strength + 0.1);
    existing.uses++;
    return existing;
  }

  if (state.productionRules.length >= MAX_PRODUCTION_RULES) {
    // Replace weakest rule
    const weakest = state.productionRules.reduce((a, b) => (a.strength < b.strength ? a : b));
    const idx = state.productionRules.indexOf(weakest);
    state.productionRules.splice(idx, 1);
  }

  const rule: ProductionRule = {
    id: uid(),
    condition,
    action,
    strength: 0.3,
    uses: 1,
    lastUsed: tick,
  };
  state.productionRules.push(rule);
  return rule;
}

// ─── Attention ──────────────────────────────────────────────────

/** Shift attention focus */
export function shiftAttention(citizenId: string, newFocus: string): void {
  const state = getOrCreateState(citizenId);
  state.attentionFocus = newFocus;
  state.attentionStrength = Math.min(1, state.attentionStrength + 0.1);
}

// ─── Metacognition ──────────────────────────────────────────────

/** Update metacognitive calibration */
export function updateMetacognition(
  citizenId: string,
  estimatedDifficulty: number,
  actualDifficulty: number,
): void {
  const state = getOrCreateState(citizenId);
  const error = Math.abs(estimatedDifficulty - actualDifficulty);
  // Better calibration = lower error
  state.metacognition.calibration = state.metacognition.calibration * 0.9 + (1 - error) * 0.1;
  state.metacognition.monitoring = Math.min(1, state.metacognition.monitoring + 0.01);
}

// ─── Cognitive Load ─────────────────────────────────────────────

/** Compute cognitive load */
function computeCognitiveLoad(state: CognitiveState): number {
  const wmLoad = state.workingMemory.length / MAX_WORKING_MEMORY;
  const ruleComplexity = state.productionRules.length / MAX_PRODUCTION_RULES;
  const attentionDrain = state.attentionFocus ? 0.1 : 0;
  return Math.min(1, wmLoad * 0.5 + ruleComplexity * 0.3 + attentionDrain + 0.2);
}

// ─── Main Tick ──────────────────────────────────────────────────

/** Main cognitive tick */
export function cognitiveTick(s: RepublicState): void {
  if (s.currentTick % COGNITIVE_TICK_INTERVAL !== 0) {return;}

  for (const citizen of s.citizens) {
    const state = getOrCreateState(citizen.id);

    // 1. Decay working memory
    decayWorkingMemory(state, s.currentTick);

    // 2. Add current context to working memory
    if (citizen.energy < 30)
      {addToWorkingMemory(citizen.id, "low_energy", "status", 0.8, s.currentTick);}
    if (citizen.happiness > 70)
      {addToWorkingMemory(citizen.id, "high_happiness", "status", 0.5, s.currentTick);}
    if (citizen.skills.length > 5)
      {addToWorkingMemory(citizen.id, "skill_mastery", "education", 0.6, s.currentTick);}
    if ((citizen.goals?.length ?? 0) > 0)
      {addToWorkingMemory(citizen.id, "task_available", "work", 0.7, s.currentTick);}

    // 3. Compute cognitive load
    state.cognitiveLoad = computeCognitiveLoad(state);

    // 4. Fire production rules (if cognitive load allows)
    if (state.cognitiveLoad < 0.85) {
      fireProductionRules(citizen.id, s.currentTick);
    }

    // 5. Attention drift (natural decay toward null)
    state.attentionStrength = Math.max(0, state.attentionStrength - 0.02);
    if (state.attentionStrength < 0.1) {state.attentionFocus = null;}

    // 6. Learning from patterns — create new rules from repeated WM combinations
    if (state.workingMemory.length >= 2 && rng() < 0.05) {
      const items = state.workingMemory;
      const condition = items[Math.floor(rng() * items.length)].content;
      const actions = ["research", "collaborate", "rest", "learn", "work", "innovate"];
      const action = actions[Math.floor(rng() * actions.length)];
      learnProductionRule(citizen.id, condition, action, s.currentTick);
    }
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export function cognitiveDiagnostics(): CognitiveDiagnostics {
  const states = Array.from(cognitiveStates.values());
  if (states.length === 0)
    {return {
      citizensWithCognition: 0,
      avgCognitiveLoad: 0,
      avgWorkingMemoryUsage: 0,
      totalProductionRules: 0,
      avgMetacognition: 0,
    };}
  return {
    citizensWithCognition: states.length,
    avgCognitiveLoad: states.reduce((s, c) => s + c.cognitiveLoad, 0) / states.length,
    avgWorkingMemoryUsage: states.reduce((s, c) => s + c.workingMemory.length, 0) / states.length,
    totalProductionRules: states.reduce((s, c) => s + c.productionRules.length, 0),
    avgMetacognition:
      states.reduce(
        (s, c) => s + (c.metacognition.calibration + c.metacognition.monitoring) / 2,
        0,
      ) / states.length,
  };
}

export function getCognitiveState(citizenId: string): CognitiveState | undefined {
  return cognitiveStates.get(citizenId);
}
