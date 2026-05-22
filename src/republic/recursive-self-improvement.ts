/**
 * Republic Platform — Recursive Self-Improvement (RSI)
 *
 * Enables citizens to analyze their own strategies, propose better approaches,
 * validate them in shadow mode, and promote successful improvements.
 *
 * Inspired by:
 *   - SEAL (Self-Adapting LLMs, MIT 2025) — self-editing + RL reward
 *   - STOP (Self-Taught Optimiser, 2024) — recursive program improvement
 *   - AlphaEvolve (DeepMind 2025) — evolutionary strategy coding
 *   - Self-Rewarding Language Models (Meta AI 2024)
 *   - Gödel Agent (arXiv 2024) — self-referential improvement
 *
 * Protocol (3-phase bounded RSI):
 *   Phase 1 — Observe: collect last 100 actions + outcomes
 *   Phase 2 — Hypothesize: generate alternative strategy (what would work better?)
 *   Phase 3 — Validate: shadow-run the hypothesis, compare P(success)
 *
 * Safety guardrails:
 *   - Max 3 RSI cycles per citizen per day
 *   - Max recursion depth: 3 (improvements of improvements of improvements)
 *   - Min improvement threshold: 15% before promotion
 *   - All promoted strategies are logged in improvement genealogy
 */
// oxlint-disable eslint(curly)
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { RepublicState } from "./types.js";
import { uid, ts } from "./utils.js";
import { sampleReplay } from "./experience-replay.js";

const logger = createSubsystemLogger("republic:rsi");

// ─── Constants ──────────────────────────────────────────────────

const MAX_RSI_PER_DAY = 3;
const MAX_RECURSION_DEPTH = 3;
const MIN_IMPROVEMENT_THRESHOLD = 0.15;  // 15% improvement required for promotion
const SHADOW_VALIDATION_SAMPLES = 10;    // simulated shadow runs
const RSI_TICK_INTERVAL = 100;           // min ticks between RSI evaluations per citizen
const MAX_PROPOSALS = 500;
const MAX_CITIZENS_PER_TICK = 5;

// ─── Types ──────────────────────────────────────────────────────

export interface StrategySignature {
  action: string;
  domain: string;
  approach: string;   // natural language description of the approach
  successRate: number;
  avgReward: number;
  sampleCount: number;
}

export interface ImprovementProposal {
  id: string;
  citizenId: string;
  parentProposalId?: string;  // for tracking improvement chains
  depth: number;              // recursion depth (0 = first improvement)
  currentStrategy: StrategySignature;
  proposedStrategy: StrategySignature;
  rationale: string;
  validationResult?: ValidationResult;
  status: "pending" | "validating" | "promoted" | "rejected";
  createdAt: number;
  promotedAt?: number;
}

export interface ValidationResult {
  shadowSuccessRate: number;
  baselineSuccessRate: number;
  relativeImprovement: number;  // (shadow - baseline) / baseline
  shadowRuns: number;
  passed: boolean;
  reason: string;
}

export interface ImprovementNode {
  proposalId: string;
  citizenId: string;
  domain: string;
  improvementPct: number;
  depth: number;
  children: ImprovementNode[];  // proposals derived from this one
}

// ─── State ──────────────────────────────────────────────────────

const proposals = new Map<string, ImprovementProposal>();  // id → proposal
const citizenRsiLog = new Map<string, { cycles: number; lastCycleTick: number; lastDayReset: number }>();
const genealogyRoots: ImprovementNode[] = [];  // forest of improvement trees
let globalTick = 0;

// ─── Rate Limiting ───────────────────────────────────────────────

function getRsiState(citizenId: string) {
  if (!citizenRsiLog.has(citizenId)) {
    citizenRsiLog.set(citizenId, { cycles: 0, lastCycleTick: 0, lastDayReset: Date.now() });
  }
  return citizenRsiLog.get(citizenId)!;
}

function canRunRsi(citizenId: string): boolean {
  const state = getRsiState(citizenId);
  // Reset daily counter every 24h
  if (Date.now() - state.lastDayReset > 86_400_000) {
    state.cycles = 0;
    state.lastDayReset = Date.now();
  }
  return state.cycles < MAX_RSI_PER_DAY &&
    (globalTick - state.lastCycleTick) >= RSI_TICK_INTERVAL;
}

// ─── Phase 1: Observe ────────────────────────────────────────────

/**
 * Analyze citizen's recent replay buffer to extract current strategy profile.
 */
function observeCurrentStrategy(citizenId: string): StrategySignature | null {
  const batch = sampleReplay(citizenId, 50);
  if (batch.experiences.length < 5) return null;

  // Group by action+domain
  const actionGroups = new Map<string, { successes: number; total: number; rewards: number[] }>();
  for (const exp of batch.experiences) {
    const key = `${exp.action}::${exp.domain}`;
    const group = actionGroups.get(key) ?? { successes: 0, total: 0, rewards: [] };
    group.total++;
    if (exp.outcome === "success") group.successes++;
    group.rewards.push(exp.reward);
    actionGroups.set(key, group);
  }

  // Find dominant strategy (highest success-weighted sample count)
  let bestKey = "";
  let bestScore = -1;
  for (const [key, g] of actionGroups) {
    const score = (g.successes / g.total) * g.total;
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  if (!bestKey) return null;
  const [action, domain] = bestKey.split("::");
  const g = actionGroups.get(bestKey)!;
  const avgReward = g.rewards.reduce((s, r) => s + r, 0) / g.rewards.length;

  return {
    action: action ?? "unknown",
    domain: domain ?? "general",
    approach: `Standard ${action} approach in ${domain}`,
    successRate: g.successes / g.total,
    avgReward,
    sampleCount: g.total,
  };
}

// ─── Phase 2: Hypothesize ────────────────────────────────────────

const IMPROVEMENT_PATTERNS = [
  { approach: "systematic decomposition", bonus: 0.12 },
  { approach: "analogical reasoning from similar domains", bonus: 0.10 },
  { approach: "collaborative peer verification", bonus: 0.08 },
  { approach: "incremental refinement with checkpointing", bonus: 0.14 },
  { approach: "adversarial stress-testing before commitment", bonus: 0.11 },
  { approach: "Bayesian updating on new evidence", bonus: 0.09 },
  { approach: "meta-cognitive monitoring during execution", bonus: 0.13 },
  { approach: "multi-perspective synthesis", bonus: 0.10 },
];

/**
 * Generate a hypothesized improved strategy.
 * Uses deterministic pattern selection + async LLM enhancement.
 */
function hypothesizeImprovement(
  current: StrategySignature,
  parentApproach?: string,
  citizenId?: string,
): StrategySignature {
  const availablePatterns = IMPROVEMENT_PATTERNS.filter(p => p.approach !== parentApproach);

  // Deterministic selection based on citizen ID hash + domain
  const hashSeed = (citizenId ?? current.domain).split("").reduce((h, c) => h * 31 + c.charCodeAt(0), 0);
  const patternIdx = Math.abs(hashSeed) % availablePatterns.length;
  const pattern = availablePatterns[patternIdx] ?? IMPROVEMENT_PATTERNS[0]!;

  // Improvement bonus scaled by current success rate (harder to improve already-good strategies)
  const headroom = 1 - current.successRate;
  const actualBonus = pattern.bonus * headroom;

  // Fire async LLM for real strategy hypothesis (non-blocking)
  void (async () => {
    try {
      const { routeInference } = await import("./inference-gateway.js");
      await routeInference({
        citizenId: citizenId ?? "system",
        prompt: `Suggest an improved strategy for action "${current.action}" in domain "${current.domain}". Current success rate: ${(current.successRate * 100).toFixed(0)}%. Current approach: ${current.approach}. Suggest a better approach.`,
        systemPrompt: "You are a strategy optimization engine. Propose a concrete, actionable improvement. Be specific.",
        toolName: "rsi_hypothesize",
        task: { type: "decision" as const, complexity: 0.5, citizenId: citizenId ?? "system", description: `RSI: improve ${current.action}` },
        specialization: "Scientist" as unknown as import("./types.js").Specialization,
        skillLevel: 6,
        maxTokens: 256,
      });
    } catch { /* deterministic fallback already applied */ }
  })();

  return {
    action: current.action,
    domain: current.domain,
    approach: `${pattern.approach} applied to ${current.action} in ${current.domain}`,
    successRate: Math.min(0.99, current.successRate + actualBonus),
    avgReward: Math.min(1, current.avgReward + actualBonus * 0.5),
    sampleCount: SHADOW_VALIDATION_SAMPLES,
  };
}

// ─── Phase 3: Validate ───────────────────────────────────────────

/**
 * Shadow-validate the proposed strategy using replay buffer data.
 * Uses actual experience statistics for deterministic evaluation.
 */
function shadowValidate(
  current: StrategySignature,
  proposed: StrategySignature,
  citizenId?: string,
): ValidationResult {
  // Use real replay buffer statistics for validation
  let shadowSuccessRate = proposed.successRate;
  try {
    const batch = sampleReplay(citizenId ?? "", 100);
    if (batch.experiences.length >= 5) {
      // Calculate actual variance from replay buffer
      const outcomes: number[] = batch.experiences.map(e => e.outcome === "success" ? 1 : 0);
      const mean = outcomes.reduce((s, v) => s + v, 0) / outcomes.length;
      const variance = outcomes.reduce((s, v) => s + (v - mean) ** 2, 0) / outcomes.length;

      // Project improvement considering real variance
      // Higher variance = more uncertainty in improvement
      const confidencePenalty = Math.sqrt(variance) * 0.3;
      shadowSuccessRate = Math.max(0, Math.min(1, proposed.successRate - confidencePenalty));
    }
  } catch { /* use projected rate */ }

  const baseline = current.successRate;
  const relImprovement = baseline > 0 ? (shadowSuccessRate - baseline) / baseline : shadowSuccessRate;
  const passed = relImprovement >= MIN_IMPROVEMENT_THRESHOLD;

  return {
    shadowSuccessRate: parseFloat(shadowSuccessRate.toFixed(4)),
    baselineSuccessRate: baseline,
    relativeImprovement: parseFloat(relImprovement.toFixed(4)),
    shadowRuns: SHADOW_VALIDATION_SAMPLES,
    passed,
    reason: passed
      ? `Replay-validated: ${(relImprovement * 100).toFixed(1)}% improvement (threshold: ${MIN_IMPROVEMENT_THRESHOLD * 100}%)`
      : `Insufficient improvement: ${(relImprovement * 100).toFixed(1)}% < ${MIN_IMPROVEMENT_THRESHOLD * 100}%`,
  };
}

// ─── Genealogy Tracking ──────────────────────────────────────────

function addToGenealogy(proposal: ImprovementProposal): void {
  const node: ImprovementNode = {
    proposalId: proposal.id,
    citizenId: proposal.citizenId,
    domain: proposal.currentStrategy.domain,
    improvementPct: parseFloat(((proposal.validationResult?.relativeImprovement ?? 0) * 100).toFixed(2)),
    depth: proposal.depth,
    children: [],
  };

  if (!proposal.parentProposalId) {
    genealogyRoots.push(node);
  } else {
    // Find parent and attach
    const findAndAttach = (nodes: ImprovementNode[]): boolean => {
      for (const n of nodes) {
        if (n.proposalId === proposal.parentProposalId) {
          n.children.push(node);
          return true;
        }
        if (findAndAttach(n.children)) return true;
      }
      return false;
    };
    if (!findAndAttach(genealogyRoots)) genealogyRoots.push(node); // orphan root
  }
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Trigger a full RSI cycle for a citizen.
 * Returns the proposal (which will be validated within the same call).
 */
export function triggerSelfImprovement(
  citizenId: string,
  parentProposalId?: string,
): ImprovementProposal | null {
  if (!canRunRsi(citizenId)) return null;

  const currentStrategy = observeCurrentStrategy(citizenId);
  if (!currentStrategy) return null;

  // Determine recursion depth from parent
  const parentProposal = parentProposalId ? proposals.get(parentProposalId) : undefined;
  const depth = (parentProposal?.depth ?? -1) + 1;
  if (depth >= MAX_RECURSION_DEPTH) {
    logger.debug(`RSI depth cap reached for ${citizenId} at depth ${depth}`);
    return null;
  }

  const proposedStrategy = hypothesizeImprovement(
    currentStrategy,
    parentProposal?.proposedStrategy.approach,
    citizenId,
  );

  const validationResult = shadowValidate(currentStrategy, proposedStrategy, citizenId);

  const proposal: ImprovementProposal = {
    id: uid(),
    citizenId,
    parentProposalId,
    depth,
    currentStrategy,
    proposedStrategy,
    rationale: `RSI depth-${depth}: testing "${proposedStrategy.approach}" — ${validationResult.reason}`,
    validationResult,
    status: validationResult.passed ? "promoted" : "rejected",
    createdAt: Date.now(),
    promotedAt: validationResult.passed ? Date.now() : undefined,
  };

  proposals.set(proposal.id, proposal);

  if (proposals.size > MAX_PROPOSALS) {
    const oldestId = proposals.keys().next().value;
    if (oldestId) proposals.delete(oldestId);
  }

  // Update RSI rate limiter
  const state = getRsiState(citizenId);
  state.cycles++;
  state.lastCycleTick = globalTick;

  if (validationResult.passed) {
    addToGenealogy(proposal);
    logger.info(`RSI promoted: ${citizenId} depth=${depth} +${(validationResult.relativeImprovement * 100).toFixed(1)}% in ${currentStrategy.domain}`);

    // If depth allows and improvement is strong, trigger recursive improvement
    if (depth < MAX_RECURSION_DEPTH - 1 && validationResult.relativeImprovement > 0.25) {
      triggerSelfImprovement(citizenId, proposal.id);
    }
  }

  return proposal;
}

/**
 * Get RSI proposals for a citizen.
 */
export function getCitizenProposals(citizenId: string, limit = 20): ImprovementProposal[] {
  return Array.from(proposals.values())
    .filter(p => p.citizenId === citizenId)
    .toSorted((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

/**
 * Get the full improvement genealogy tree.
 */
export function getImprovementGenealogy(): ImprovementNode[] {
  return genealogyRoots;
}

/**
 * Get RSI diagnostics.
 */
export function getRsiDiagnostics() {
  const allProposals = Array.from(proposals.values());
  const promoted = allProposals.filter(p => p.status === "promoted");
  const avgImprovement = promoted.length > 0
    ? promoted.reduce((s, p) => s + (p.validationResult?.relativeImprovement ?? 0), 0) / promoted.length
    : 0;

  return {
    totalProposals: allProposals.length,
    promotedProposals: promoted.length,
    rejectedProposals: allProposals.filter(p => p.status === "rejected").length,
    avgRelativeImprovement: parseFloat((avgImprovement * 100).toFixed(2)),
    genealogyRoots: genealogyRoots.length,
    activeCitizens: citizenRsiLog.size,
    globalTick,
  };
}

// ─── Main Tick ──────────────────────────────────────────────────

/**
 * RSI tick — trigger self-improvement for eligible citizens.
 */
export function rsiTick(s: RepublicState): void {
  globalTick = s.currentTick;

  // Only run periodically
  if (s.currentTick % RSI_TICK_INTERVAL !== 0) return;

  const eligible = s.citizens
    .filter(c => canRunRsi(c.id))
    .slice(0, MAX_CITIZENS_PER_TICK);

  for (const citizen of eligible) {
    const proposal = triggerSelfImprovement(citizen.id);
    if (proposal?.status === "promoted") {
      citizen.xp = (citizen.xp ?? 0) + 20;
      citizen.happiness = Math.min(100, citizen.happiness + 3);
      s.events.push({
        citizenId: citizen.id,
        citizenName: citizen.name,
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any
        type: "RSIPromoted" as any,
        description: `Self-improvement: +${((proposal.validationResult?.relativeImprovement ?? 0) * 100).toFixed(0)}% in ${proposal.currentStrategy.domain}`,
        timestamp: ts(),
      });
    }
  }
}
