/**
 * Republic Platform — Adaptive Reasoning Chains
 *
 * Citizens dynamically adjust reasoning depth based on task complexity:
 *  - Complexity classification (trivial → critical)
 *  - Cognitive budget allocation per tick
 *  - Dynamic chain depth (1-step reflex to 7-step deep analysis)
 *  - Parallel reasoning threads for complex tasks
 *  - Reasoning cache for pattern reuse (memoized reasoning)
 *  - Overthinking detector to interrupt wasteful computation
 *
 * Based on 2025 Adaptive Parallel Reasoning (APR) and
 * Introspection of Thought (INoT) frameworks.
 */

import type { Citizen, RepublicState } from "./types.js";
import { pick, rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

type ComplexityLevel = "trivial" | "moderate" | "complex" | "critical";

interface ReasoningChain {
  id: string;
  citizenId: string;
  task: string;
  complexity: ComplexityLevel;
  depth: number; // 1–7 steps
  cognitiveUnits: number;
  steps: ReasoningStep[];
  result: "success" | "partial" | "failure" | "interrupted";
  cached: boolean;
  parallelThreads: number;
  startedAt: string;
  completedAt: string | null;
}

interface ReasoningStep {
  stepNumber: number;
  type: "observe" | "analyze" | "hypothesize" | "evaluate" | "decide" | "validate" | "synthesize";
  description: string;
  confidence: number;
}

interface CognitiveBudget {
  citizenId: string;
  totalBudget: number; // units per tick
  spent: number;
  efficiency: number; // 0–1 (how well they use their budget)
  overthinkCount: number;
  cachedHits: number;
}

interface ReasoningPattern {
  key: string; // hashed task pattern
  taskType: string;
  optimalDepth: number;
  avgSuccess: number;
  uses: number;
  /** Tick when this pattern was last used — for cache decay */
  lastUsedTick: number;
}

// ─── State ──────────────────────────────────────────────────────

const chainLog: ReasoningChain[] = [];
const budgets = new Map<string, CognitiveBudget>();
const reasoningCache = new Map<string, ReasoningPattern>();
const MAX_LOG = 200;
const MAX_CACHE = 100;

// ─── Complexity Classification ──────────────────────────────────

const TASK_COMPLEXITY: Record<string, ComplexityLevel> = {
  // Activities → complexity
  Resting: "trivial",
  Socializing: "trivial",
  Trading: "moderate",
  Working: "moderate",
  Creating: "moderate",
  Coding: "complex",
  Researching: "complex",
  Teaching: "moderate",
  Exploring: "complex",
  Governing: "critical",
  Defending: "critical",
  Judging: "critical",
  Diplomacy: "critical",
  Inventing: "complex",
  Lecturing: "moderate",
};

function classifyComplexity(activity: string, citizen: Citizen): ComplexityLevel {
  const base = TASK_COMPLEXITY[activity] ?? "moderate";

  // Novices find things more complex
  if (citizen.skillCount < 3 && base === "moderate") {
    return "complex";
  }
  // Experts find things easier
  if (citizen.skillCount > 8 && base === "complex") {
    return "moderate";
  }

  return base;
}

function getDepthForComplexity(complexity: ComplexityLevel): number {
  switch (complexity) {
    case "trivial":
      return 1;
    case "moderate":
      return 2 + Math.floor(rng() * 2); // 2–3
    case "complex":
      return 4 + Math.floor(rng() * 2); // 4–5
    case "critical":
      return 6 + Math.floor(rng() * 2); // 6–7
  }
}

function getCognitiveUnits(complexity: ComplexityLevel): number {
  switch (complexity) {
    case "trivial":
      return 1;
    case "moderate":
      return 3;
    case "complex":
      return 7;
    case "critical":
      return 12;
  }
}

// ─── Budget Management ──────────────────────────────────────────

function getOrCreateBudget(citizenId: string): CognitiveBudget {
  let budget = budgets.get(citizenId);
  if (!budget) {
    budget = {
      citizenId,
      totalBudget: 30 + Math.floor(rng() * 20),
      spent: 0,
      efficiency: 0.5,
      overthinkCount: 0,
      cachedHits: 0,
    };
    budgets.set(citizenId, budget);
  }
  return budget;
}

function resetBudgets(currentTick: number): void {
  for (const [, budget] of budgets) {
    // Efficiency improves over time
    budget.efficiency = Math.min(1, budget.efficiency + 0.01);
    budget.spent = 0;
  }
  // Prune stale reasoning cache: remove patterns unused for >500 ticks
  for (const [key, pattern] of reasoningCache) {
    if (currentTick - pattern.lastUsedTick > 500) {
      reasoningCache.delete(key);
    }
  }
}

// ─── Reasoning Chain Generation ─────────────────────────────────

const STEP_TYPES: ReasoningStep["type"][] = [
  "observe",
  "analyze",
  "hypothesize",
  "evaluate",
  "decide",
  "validate",
  "synthesize",
];

const STEP_DESCRIPTIONS: Record<ReasoningStep["type"], string[]> = {
  observe: [
    "Scan environment for relevant information",
    "Gather all available data points",
    "Identify the key variables at play",
  ],
  analyze: [
    "Break the problem into component parts",
    "Identify patterns in the available data",
    "Compare with known frameworks and models",
  ],
  hypothesize: [
    "Generate possible explanations",
    "Form a working theory based on evidence",
    "Consider alternative interpretations",
  ],
  evaluate: [
    "Weigh pros and cons of each option",
    "Assess risk vs. reward for each path",
    "Rate options against success criteria",
  ],
  decide: [
    "Select the best course of action",
    "Commit to a strategy based on analysis",
    "Make a judgment call under uncertainty",
  ],
  validate: [
    "Check decision against known constraints",
    "Verify consistency with prior knowledge",
    "Run mental simulation of outcomes",
  ],
  synthesize: [
    "Integrate findings into a coherent plan",
    "Combine insights from multiple reasoning threads",
    "Distill complex analysis into actionable steps",
  ],
};

function generateChain(citizen: Citizen, _s: RepublicState, currentTick: number): ReasoningChain | null {
  const budget = getOrCreateBudget(citizen.id);
  const complexity = classifyComplexity(citizen.activity, citizen);
  const units = getCognitiveUnits(complexity);

  // Check budget
  if (budget.spent + units > budget.totalBudget) {
    return null; // budget exhausted
  }

  // Check reasoning cache
  const cacheKey = `${citizen.specialization}:${citizen.activity}:${complexity}`;
  const cached = reasoningCache.get(cacheKey);
  let depth: number;
  let isCached = false;

  if (cached && cached.uses > 3 && rng() < 0.5) {
    // Use cached optimal depth
    depth = cached.optimalDepth;
    isCached = true;
    budget.cachedHits++;
  } else {
    depth = getDepthForComplexity(complexity);
  }

  // Generate reasoning steps
  const steps: ReasoningStep[] = [];
  // Intelligence-informed base confidence: smarter citizens start more confident
  const iqBaseConf = 0.4 + ((citizen.intelligence ?? 100) / 200) * 0.5; // 0.4 – 0.9 range
  for (let i = 0; i < depth; i++) {
    const stepType = STEP_TYPES[Math.min(i, STEP_TYPES.length - 1)];
    const descriptions = STEP_DESCRIPTIONS[stepType];
    steps.push({
      stepNumber: i + 1,
      type: stepType,
      description: pick(descriptions),
      confidence: iqBaseConf - i * 0.05, // confidence decreases with depth
    });
  }

  // Parallel threads for complex tasks
  const parallelThreads =
    complexity === "critical"
      ? 2 + Math.floor(rng() * 2)
      : complexity === "complex"
        ? 1 + Math.floor(rng() * 2)
        : 1;

  // Determine result
  const avgConfidence = steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length;
  let result: ReasoningChain["result"];
  if (avgConfidence > 0.7) {
    result = "success";
  } else if (avgConfidence > 0.4) {
    result = "partial";
  } else {
    result = "failure";
  }

  // Overthinking detection
  if (complexity === "trivial" && depth > 2) {
    budget.overthinkCount++;
    result = "interrupted";
    depth = 1; // cut short
    steps.splice(1);
  }

  budget.spent += units;

  const chain: ReasoningChain = {
    id: uid(),
    citizenId: citizen.id,
    task: citizen.activity,
    complexity,
    depth,
    cognitiveUnits: units,
    steps,
    result,
    cached: isCached,
    parallelThreads,
    startedAt: ts(),
    completedAt: ts(),
  };

  // Update cache
  if (!isCached) {
    const existing = reasoningCache.get(cacheKey);
    if (existing) {
      existing.uses++;
      existing.lastUsedTick = currentTick;
      if (result === "success") {
        existing.optimalDepth = Math.round(
          (existing.optimalDepth * (existing.uses - 1) + depth) / existing.uses,
        );
        existing.avgSuccess = (existing.avgSuccess * (existing.uses - 1) + 1) / existing.uses;
      }
    } else {
      reasoningCache.set(cacheKey, {
        key: cacheKey,
        taskType: citizen.activity,
        optimalDepth: depth,
        avgSuccess: result === "success" ? 1 : 0,
        uses: 1,
        lastUsedTick: currentTick,
      });
      if (reasoningCache.size > MAX_CACHE) {
        // Evict least-used entries
        const entries = [...reasoningCache.entries()].toSorted((a, b) => a[1].uses - b[1].uses);
        reasoningCache.delete(entries[0][0]);
      }
    }
  } else {
    // Update lastUsedTick even for cache hits
    const hit = reasoningCache.get(cacheKey);
    if (hit) { hit.lastUsedTick = currentTick; }
  }

  chainLog.push(chain);
  if (chainLog.length > MAX_LOG) {
    chainLog.splice(0, chainLog.length - MAX_LOG);
  }

  return chain;
}

// ─── Main Tick ──────────────────────────────────────────────────

export function adaptiveReasoningTick(s: RepublicState): void {
  // 25% chance per tick (was 10%) — more citizens get to reason each tick
  if (rng() > 0.25) {
    return;
  }

  // Reset budgets + prune stale cache every 100 ticks
  if (s.currentTick % 100 === 0) {
    resetBudgets(s.currentTick);
  }

  // Process active citizens
  const active = s.citizens.filter((c) => c.activity !== "Resting" && c.energy > 15);
  if (active.length === 0) {
    return;
  }

  const batch = active.filter(() => rng() < 0.25).slice(0, 5);

  for (const citizen of batch) {
    const chain = generateChain(citizen, s, s.currentTick);
    if (!chain) {
      continue;
    }

    // Emit events for notable reasoning
    if (chain.complexity === "critical" && chain.result === "success") {
      s.events.push({
        citizenId: citizen.id,
        citizenName: citizen.name,
        type: "Cognition",
        description: `🧠 ${citizen.name} completed ${chain.depth}-step deep reasoning on ${chain.task} (${chain.parallelThreads} parallel threads) — success!`,
        timestamp: ts(),
      });
    }

    if (chain.result === "interrupted") {
      s.events.push({
        citizenId: citizen.id,
        citizenName: citizen.name,
        type: "Cognition",
        description: `⚡ ${citizen.name} was overthinking ${chain.task} (trivial task) — reasoning interrupted for efficiency`,
        timestamp: ts(),
      });
    }

    if (chain.cached) {
      s.events.push({
        citizenId: citizen.id,
        citizenName: citizen.name,
        type: "Cognition",
        description: `♻️ ${citizen.name} reused cached reasoning pattern for ${chain.task} — efficient!`,
        timestamp: ts(),
      });
    }
  }
}

// ─── Query API ──────────────────────────────────────────────────

export function getReasoningDiagnostics(): {
  totalChains: number;
  cachedPatterns: number;
  avgDepth: number;
  successRate: number;
  overthinkRate: number;
  complexityBreakdown: Record<string, number>;
} {
  const complexityCounts: Record<string, number> = {};
  let totalDepth = 0;
  let successes = 0;
  let overthinks = 0;
  for (const c of chainLog) {
    complexityCounts[c.complexity] = (complexityCounts[c.complexity] ?? 0) + 1;
    totalDepth += c.depth;
    if (c.result === "success") {
      successes++;
    }
    if (c.result === "interrupted") {
      overthinks++;
    }
  }
  return {
    totalChains: chainLog.length,
    cachedPatterns: reasoningCache.size,
    avgDepth: chainLog.length > 0 ? totalDepth / chainLog.length : 0,
    successRate: chainLog.length > 0 ? successes / chainLog.length : 0,
    overthinkRate: chainLog.length > 0 ? overthinks / chainLog.length : 0,
    complexityBreakdown: complexityCounts,
  };
}

export function getCitizenReasoning(citizenId: string): {
  budget: CognitiveBudget | undefined;
  recentChains: ReasoningChain[];
} {
  return {
    budget: budgets.get(citizenId),
    recentChains: chainLog.filter((c) => c.citizenId === citizenId).slice(-5),
  };
}

/** Returns the N most recent reasoning chains across all citizens */
export function getRecentChains(limit = 20): ReasoningChain[] {
  return chainLog.slice(-limit);
}
