/**
 * Republic Platform — Self-Improvement Engine (SICA-inspired)
 *
 * Based on research:
 *  - SICA (Self-Improving Coding Agent, ICLR 2025)
 *  - Gödel Agent (self-referential architecture)
 *  - Experience-driven Lifelong Learning (ELL)
 *
 * Citizens can:
 *  1. Analyze their own performance (success/fail metrics)
 *  2. Propose improvements to their prompts/tools/skills
 *  3. Validate proposals via syntax check + dry-run
 *  4. Apply improvements and track evolution versions
 *
 * All evolution artifacts written to republic-output/evolution/
 */

import * as fs from "fs";
import * as path from "path";
import type { Citizen, RepublicState } from "./types.js";
import { rng, ts, uid } from "./utils.js";

// ─── Configuration ──────────────────────────────────────────────

const EVOLUTION_DIR = path.join(process.cwd(), "republic-output", "evolution");
const IMPROVEMENT_INTERVAL = 20; // ticks between improvement cycles
const MIN_ACTIONS_FOR_EVAL = 10; // minimum actions before evaluating
const IMPROVEMENT_THRESHOLD = 0.5; // below 50% success → trigger improvement
const MAX_PROPOSALS_PER_TICK = 3;

// ─── Types ──────────────────────────────────────────────────────

export interface PerformanceMetrics {
  citizenId: string;
  citizenName: string;
  specialization: string;
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  successRate: number;
  topTools: { tool: string; count: number; successRate: number }[];
  weakAreas: string[];
  strengths: string[];
}

export interface ImprovementProposal {
  id: string;
  citizenId: string;
  type: "prompt" | "strategy" | "skill" | "tool_usage";
  title: string;
  description: string;
  currentApproach: string;
  proposedApproach: string;
  expectedImpact: string;
  status: "proposed" | "validated" | "applied" | "rejected";
  version: number;
  createdAt: string;
  appliedAt?: string;
}

export interface EvolutionRecord {
  version: number;
  proposals: ImprovementProposal[];
  metricsBeforeApply: PerformanceMetrics;
  timestamp: string;
}

// ─── State ──────────────────────────────────────────────────────

const proposals: ImprovementProposal[] = [];
const MAX_PROPOSALS = 200;
let evolutionVersion = 0;
let lastImprovementTick = 0;

// ─── Helpers ────────────────────────────────────────────────────

function ensureEvolutionDir(): void {
  if (!fs.existsSync(EVOLUTION_DIR)) {
    fs.mkdirSync(EVOLUTION_DIR, { recursive: true });
  }
}

// ─── 1. Performance Analysis ────────────────────────────────────

/**
 * Analyze a citizen's performance based on action history.
 * Draws from episodic memory and action logs.
 */
export function analyzePerformance(citizen: Citizen, _s: RepublicState): PerformanceMetrics {
  // Aggregate from citizen's procedural memory
  const memories =
    (
      citizen as unknown as {
        proceduralMemory?: {
          entries: { skill: string; successCount: number; failCount: number }[];
        };
      }
    ).proceduralMemory?.entries ?? [];

  let totalActions = 0;
  let successfulActions = 0;
  let failedActions = 0;
  const toolStats: Record<string, { count: number; successes: number }> = {};

  for (const mem of memories) {
    const total = mem.successCount + mem.failCount;
    totalActions += total;
    successfulActions += mem.successCount;
    failedActions += mem.failCount;

    toolStats[mem.skill] = {
      count: total,
      successes: mem.successCount,
    };
  }

  // If no procedural memory, estimate from citizen stats
  if (totalActions === 0) {
    totalActions = citizen.skillCount * 5;
    successfulActions = Math.floor(totalActions * (citizen.happiness / 100));
    failedActions = totalActions - successfulActions;
  }

  const topTools = Object.entries(toolStats)
    .map(([tool, stats]) => ({
      tool,
      count: stats.count,
      successRate: stats.count > 0 ? stats.successes / stats.count : 0,
    }))
    .toSorted((a, b) => b.count - a.count)
    .slice(0, 5);

  const weakAreas = topTools.filter((t) => t.successRate < 0.4 && t.count >= 3).map((t) => t.tool);

  const strengths = topTools.filter((t) => t.successRate > 0.7 && t.count >= 3).map((t) => t.tool);

  return {
    citizenId: citizen.id,
    citizenName: citizen.name ?? citizen.id,
    specialization: citizen.specialization,
    totalActions,
    successfulActions,
    failedActions,
    successRate: totalActions > 0 ? successfulActions / totalActions : 0,
    topTools,
    weakAreas,
    strengths,
  };
}

// ─── 2. Improvement Proposal Generation ─────────────────────────

/**
 * Generate improvement proposals for a citizen based on performance.
 * Uses deterministic heuristics (no LLM needed for proposal generation).
 */
export function proposeImprovements(
  metrics: PerformanceMetrics,
  citizen: Citizen,
): ImprovementProposal[] {
  const newProposals: ImprovementProposal[] = [];

  // Strategy: Low overall success → suggest approach changes
  if (metrics.successRate < IMPROVEMENT_THRESHOLD && metrics.totalActions >= MIN_ACTIONS_FOR_EVAL) {
    newProposals.push({
      id: uid(),
      citizenId: citizen.id,
      type: "strategy",
      title: `Strategy overhaul for ${metrics.citizenName}`,
      description: `Success rate ${(metrics.successRate * 100).toFixed(1)}% is below threshold. Proposing systematic improvement.`,
      currentApproach: `Current: ${citizen.specialization} with ${citizen.skillCount} skills, ${metrics.totalActions} actions`,
      proposedApproach: `Focus on strengths (${metrics.strengths.join(", ") || "general"}) while gradually building weak areas (${metrics.weakAreas.join(", ") || "none identified"})`,
      expectedImpact: `+${Math.floor((IMPROVEMENT_THRESHOLD - metrics.successRate) * 100)}% success rate improvement`,
      status: "proposed",
      version: evolutionVersion + 1,
      createdAt: ts(),
    });
  }

  // Prompt: Weak areas exist → suggest better prompting for those tools
  for (const weak of metrics.weakAreas.slice(0, 2)) {
    newProposals.push({
      id: uid(),
      citizenId: citizen.id,
      type: "prompt",
      title: `Improve ${weak} prompt for ${metrics.citizenName}`,
      description: `Tool "${weak}" has low success rate. Proposing enhanced prompt with more context and chain-of-thought.`,
      currentApproach: `Basic tool invocation for ${weak}`,
      proposedApproach: `Enhanced prompt: "Before using ${weak}, analyze the context, consider alternatives, plan steps, then execute with validation"`,
      expectedImpact: `Improved ${weak} success rate`,
      status: "proposed",
      version: evolutionVersion + 1,
      createdAt: ts(),
    });
  }

  // Skill: Suggest new skill acquisition based on specialization gaps
  if (citizen.skillCount < 5) {
    const skillSuggestions: Record<string, string[]> = {
      DataScientist: ["model_validation", "feature_engineering", "hyperparameter_tuning"],
      Developer: ["testing", "code_review", "architecture_design"],
      Researcher: ["hypothesis_validation", "citation_management", "peer_review"],
      Engineer: ["system_design", "load_testing", "monitoring"],
      Artist: ["color_theory", "composition", "style_transfer"],
    };
    const suggestions = skillSuggestions[citizen.specialization] ?? [
      "problem_solving",
      "communication",
    ];
    const skill = suggestions[Math.floor(rng() * suggestions.length)];

    newProposals.push({
      id: uid(),
      citizenId: citizen.id,
      type: "skill",
      title: `Learn ${skill} for ${metrics.citizenName}`,
      description: `Citizen has ${citizen.skillCount} skills. Learning "${skill}" would improve capability.`,
      currentApproach: `${citizen.skillCount} skills: general ${citizen.specialization} work`,
      proposedApproach: `Add "${skill}" to skill tree, practice through targeted tool usage`,
      expectedImpact: `New skill + improved task handling`,
      status: "proposed",
      version: evolutionVersion + 1,
      createdAt: ts(),
    });
  }

  return newProposals;
}

// ─── 3. Proposal Validation ─────────────────────────────────────

/**
 * Validate a proposal before applying it.
 * Uses heuristic checks — in a real system this would run tests.
 */
export function validateProposal(proposal: ImprovementProposal): boolean {
  // Basic validation: proposal must have content
  if (!proposal.proposedApproach || !proposal.description) {
    return false;
  }

  // Strategy proposals are always valid
  if (proposal.type === "strategy") {
    return true;
  }

  // Prompt proposals need a proposed approach
  if (proposal.type === "prompt" && proposal.proposedApproach.length > 10) {
    return true;
  }

  // Skill proposals are valid if the skill name is reasonable
  if (proposal.type === "skill") {
    return true;
  }

  return proposal.proposedApproach.length > 5;
}

// ─── 4. Apply Improvements ──────────────────────────────────────

/**
 * Apply validated proposals to a citizen.
 * Modifies the citizen's approach and records the evolution.
 */
export function applyProposal(
  proposal: ImprovementProposal,
  citizen: Citizen,
  s: RepublicState,
): void {
  ensureEvolutionDir();

  proposal.status = "applied";
  proposal.appliedAt = ts();

  // Apply based on type
  if (proposal.type === "skill" && proposal.title.includes("Learn ")) {
    // Add skill to citizen
    citizen.skillCount = Math.min(20, citizen.skillCount + 1);
    citizen.happiness = Math.min(100, citizen.happiness + 3);
  }

  if (proposal.type === "strategy") {
    // Boost motivation through happiness
    citizen.happiness = Math.min(100, citizen.happiness + 5);
  }

  // Record event
  s.events.push({
    citizenId: citizen.id,
    citizenName: citizen.name ?? citizen.id,
    type: "SelfImprovement",
    description: `🧬 EVOLVED: "${proposal.title}" — ${proposal.expectedImpact} [v${proposal.version}]`,
    timestamp: ts(),
  });

  // Write evolution record to disk
  const record: EvolutionRecord = {
    version: proposal.version,
    proposals: [proposal],
    metricsBeforeApply: analyzePerformance(citizen, s),
    timestamp: ts(),
  };

  const filename = `evolution-v${proposal.version}-${citizen.id.slice(0, 8)}.json`;
  fs.writeFileSync(path.join(EVOLUTION_DIR, filename), JSON.stringify(record, null, 2), "utf-8");
}

// ─── 5. Self-Improvement Tick ───────────────────────────────────

/**
 * Main self-improvement loop. Called from agent runtime every N ticks.
 *
 * Process:
 *  1. Select citizens with enough actions and low success rates
 *  2. Analyze their performance
 *  3. Generate improvement proposals
 *  4. Validate and apply the best proposals
 *  5. Record evolution
 */
export function selfImprovementTick(s: RepublicState): void {
  if (s.currentTick - lastImprovementTick < IMPROVEMENT_INTERVAL) {
    return;
  }
  lastImprovementTick = s.currentTick;
  evolutionVersion++;

  // Find citizens needing improvement
  const candidates = s.citizens
    .filter((c) => c.energy > 20 && c.skillCount >= 1)
    .toSorted((a, b) => a.happiness - b.happiness) // least happy first
    .slice(0, 5);

  let appliedCount = 0;

  for (const citizen of candidates) {
    if (appliedCount >= MAX_PROPOSALS_PER_TICK) {
      break;
    }

    const metrics = analyzePerformance(citizen, s);
    const newProposals = proposeImprovements(metrics, citizen);

    for (const proposal of newProposals) {
      if (appliedCount >= MAX_PROPOSALS_PER_TICK) {
        break;
      }

      if (validateProposal(proposal)) {
        proposal.status = "validated";
        applyProposal(proposal, citizen, s);
        appliedCount++;
      } else {
        proposal.status = "rejected";
      }

      proposals.push(proposal);
    }
  }

  // Trim proposal history
  if (proposals.length > MAX_PROPOSALS) {
    proposals.splice(0, proposals.length - MAX_PROPOSALS);
  }
}

// ─── 6. LLM-Enhanced Self-Improvement ───────────────────────────

/**
 * Use a local LLM to generate more sophisticated improvement proposals.
 * This is the "Gödel Agent" mode — citizens reason about their own improvement.
 *
 * @param inferFn - function that calls the local LLM
 */
export async function llmEnhancedImprovement(
  citizen: Citizen,
  s: RepublicState,
  inferFn: (prompt: string) => Promise<string>,
): Promise<ImprovementProposal[]> {
  const metrics = analyzePerformance(citizen, s);

  const prompt = `You are ${citizen.name ?? citizen.id}, a ${citizen.specialization} in the Republic.

Your performance metrics:
- Success rate: ${(metrics.successRate * 100).toFixed(1)}%
- Total actions: ${metrics.totalActions}
- Weak areas: ${metrics.weakAreas.join(", ") || "none"}
- Strengths: ${metrics.strengths.join(", ") || "general"}
- Skills: ${citizen.skillCount}
- Energy: ${citizen.energy}/100
- Happiness: ${citizen.happiness}/100

Analyze your performance and propose ONE concrete improvement.
Format: {"type":"strategy|prompt|skill|tool_usage","title":"...","description":"...","proposedApproach":"...","expectedImpact":"..."}`;

  try {
    const response = await inferFn(prompt);
    const parsed = JSON.parse(response) as Partial<ImprovementProposal>;

    if (parsed.type && parsed.title && parsed.proposedApproach) {
      return [
        {
          id: uid(),
          citizenId: citizen.id,
          type: parsed.type,
          title: parsed.title,
          description: parsed.description ?? "",
          currentApproach: `Current ${citizen.specialization} approach`,
          proposedApproach: parsed.proposedApproach,
          expectedImpact: parsed.expectedImpact ?? "Improved performance",
          status: "proposed",
          version: evolutionVersion + 1,
          createdAt: ts(),
        },
      ];
    }
  } catch {
    // LLM not available or parse failed — fall back to heuristic
  }

  return proposeImprovements(metrics, citizen);
}

// ─── 7. Diagnostics ─────────────────────────────────────────────

export function getSelfImprovementDiagnostics(): {
  evolutionVersion: number;
  totalProposals: number;
  appliedProposals: number;
  rejectedProposals: number;
  recentProposals: ImprovementProposal[];
} {
  return {
    evolutionVersion,
    totalProposals: proposals.length,
    appliedProposals: proposals.filter((p) => p.status === "applied").length,
    rejectedProposals: proposals.filter((p) => p.status === "rejected").length,
    recentProposals: proposals.slice(-10),
  };
}

export function getEvolutionVersion(): number {
  return evolutionVersion;
}
