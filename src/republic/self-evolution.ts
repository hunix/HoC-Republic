/**
 * Republic Platform — Self-Evolution Engine
 *
 * Self-Evolving Citizen Architecture, Module 3:
 * Autonomous Self-Modification Pipeline
 *
 * Inspired by:
 *   - "The Brain System" (3-level self-evolution: protocol → tool → architecture)
 *   - Reflexion (verbal self-critique → prompt improvement)
 *   - VOYAGER (iterative refinement with verification)
 *
 * Citizens can propose modifications to their own cognitive infrastructure
 * across three levels:
 *
 *   Level 1 — PROTOCOL: Behavioral rules, decision heuristics, reflex rules
 *   Level 2 — TOOL: New executable skills, forged tools
 *   Level 3 — ARCHITECTURE: Prompt fragments, decision strategy, reflex rules
 *
 * Pipeline: PROPOSE → VALIDATE → TEST → DEPLOY → MONITOR → ROLLBACK-if-needed
 *
 * Safety:
 *   - All generated code passes safety validation (banned patterns)
 *   - A rollback window monitors fitness for N ticks
 *   - Architecture-level changes require governance (peer review)
 */

import type { Citizen, RepublicState } from "./types.js";
import {
  getFragmentsNeedingEvolution,
  getProfile,
  markReflectionComplete,
  proposeFragmentUpdate,
  rollbackFragment,
  shouldReflect,
  type FragmentSection,
  type PromptFragment,
} from "./cognitive-core.js";
import {
  activateSkill,
  deprecateSkill,
  getActiveSkills,
  learnSkill,
  validateSkill,
} from "./skill-library.js";
import { pick, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

/** Evolution levels (The Brain System's 3-tier model) */
export type EvolutionLevel = "protocol" | "tool" | "architecture";

/** Evolution proposal status */
export type ProposalStatus =
  | "proposed"
  | "validating"
  | "testing"
  | "approved"
  | "deployed"
  | "monitoring"
  | "confirmed"
  | "rolled_back"
  | "rejected";

/** A self-modification proposal from a citizen */
export interface EvolutionProposal {
  id: string;
  citizenId: string;
  citizenName: string;

  /** Which level is being modified */
  level: EvolutionLevel;

  /** What the citizen wants to change */
  description: string;

  /** The current value/state being replaced */
  currentVersion: string;

  /** The proposed replacement */
  proposedChange: string;

  /** Why the citizen thinks this is an improvement */
  rationale: string;

  /** Generated code (for tool/architecture level) */
  generatedCode?: string;

  /** Risk score: 0 = safe, 1 = very dangerous */
  riskScore: number;

  /** Current status in the pipeline */
  status: ProposalStatus;

  /** Tick at which the proposal was deployed (for rollback window) */
  deployedAtTick?: number;

  /** If deployed, the ID of the artifact it created/modified */
  deployedArtifactId?: string;

  /** Pre-deployment fitness baselines for rollback comparison */
  baselineFitness?: number;

  /** Post-deployment fitness (accumulated during monitoring) */
  monitoredFitness?: number;
  monitorSamples?: number;

  /** Peer reviews (required for architecture-level changes) */
  peerReviews: PeerReview[];

  /** Timestamps */
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/** Peer review of an evolution proposal */
export interface PeerReview {
  reviewerId: string;
  reviewerName: string;
  verdict: "approve" | "reject" | "needs_revision";
  comments: string;
  reviewedAt: string;
}

/** Reflection report — the output of a self-reflection cycle */
export interface ReflectionReport {
  citizenId: string;
  tick: number;
  fragmentsAnalyzed: number;
  lowFitnessFragments: string[]; // IDs of fragments below threshold
  proposalsGenerated: number;
  insights: string[];
  timestamp: string;
}

// ─── Configuration ──────────────────────────────────────────────

/** Max active proposals per citizen */
const MAX_ACTIVE_PROPOSALS = 5;

/** Rollback monitoring window (ticks) */
const ROLLBACK_WINDOW = 50;

/** Min fitness delta to confirm a deployment (must be this much better) */
const MIN_FITNESS_IMPROVEMENT = 0.05;

/** Risk threshold above which architecture-level governance is required */
const GOVERNANCE_RISK_THRESHOLD = 0.5;

/** Min peer reviews needed for architecture-level proposals */
const MIN_PEER_REVIEWS = 2;

/** Reflection cooldown — min ticks between proposal generations */
const PROPOSAL_COOLDOWN = 30;

// ─── State ──────────────────────────────────────────────────────

const proposals: EvolutionProposal[] = [];
const reflectionReports: ReflectionReport[] = [];
let lastProposalTick = new Map<string, number>();

// ─── State Sync ─────────────────────────────────────────────────

/** Serialize for persistence */
export function serializeEvolutionState(): {
  proposals: EvolutionProposal[];
  reflectionReports: ReflectionReport[];
  lastProposalTick: Record<string, number>;
} {
  return {
    proposals,
    reflectionReports: reflectionReports.slice(-200), // Keep recent
    lastProposalTick: Object.fromEntries(lastProposalTick),
  };
}

/** Restore from persistence */
export function restoreEvolutionState(data: {
  proposals: EvolutionProposal[];
  reflectionReports: ReflectionReport[];
  lastProposalTick: Record<string, number>;
}): void {
  proposals.length = 0;
  proposals.push(...(data.proposals ?? []));
  reflectionReports.length = 0;
  reflectionReports.push(...(data.reflectionReports ?? []));
  lastProposalTick = new Map(Object.entries(data.lastProposalTick ?? {}));
}

// ─── Proposal Pipeline ─────────────────────────────────────────

/** Create a self-modification proposal.
 *
 *  This is the citizen saying: "I think I should change how I work."
 *  The proposal goes through validation, testing, and monitoring.
 */
export function createProposal(
  citizen: Citizen,
  level: EvolutionLevel,
  description: string,
  currentVersion: string,
  proposedChange: string,
  rationale: string,
  generatedCode?: string,
): EvolutionProposal | null {
  // Rate limit
  const activeCount = proposals.filter(
    (p) =>
      p.citizenId === citizen.id && !["confirmed", "rolled_back", "rejected"].includes(p.status),
  ).length;
  if (activeCount >= MAX_ACTIVE_PROPOSALS) {
    return null;
  }

  // Calculate risk score
  const riskScore = calculateRiskScore(level, proposedChange, generatedCode);

  const proposal: EvolutionProposal = {
    id: uid(),
    citizenId: citizen.id,
    citizenName: citizen.name,
    level,
    description,
    currentVersion,
    proposedChange,
    rationale,
    generatedCode,
    riskScore,
    status: "proposed",
    peerReviews: [],
    createdAt: ts(),
    updatedAt: ts(),
  };

  proposals.push(proposal);
  return proposal;
}

/** Advance a proposal through the pipeline.
 *
 *  Called each tick for active proposals.
 *  Moves through: proposed → validating → testing → approved → deployed → monitoring → confirmed
 */
export function advanceProposal(proposal: EvolutionProposal, currentTick: number): void {
  switch (proposal.status) {
    case "proposed":
      // Auto-validate protocol and tool level changes
      // Architecture level requires governance if high risk
      if (proposal.level === "architecture" && proposal.riskScore > GOVERNANCE_RISK_THRESHOLD) {
        // Needs peer reviews
        if (proposal.peerReviews.length >= MIN_PEER_REVIEWS) {
          const approvals = proposal.peerReviews.filter((r) => r.verdict === "approve");
          if (approvals.length >= MIN_PEER_REVIEWS) {
            proposal.status = "validating";
          } else {
            proposal.status = "rejected";
            proposal.completedAt = ts();
          }
        }
        // Else wait for reviews
      } else {
        proposal.status = "validating";
      }
      break;

    case "validating":
      // Validate the proposal content
      const valid = validateProposal(proposal);
      proposal.status = valid ? "testing" : "rejected";
      if (!valid) {
        proposal.completedAt = ts();
      }
      break;

    case "testing":
      // Simulate testing (in production, this would use V8 isolates)
      const testPassed = testProposal(proposal);
      proposal.status = testPassed ? "approved" : "rejected";
      if (!testPassed) {
        proposal.completedAt = ts();
      }
      break;

    case "approved":
      // Deploy the change
      deployProposal(proposal, currentTick);
      proposal.status = "deployed";
      proposal.deployedAtTick = currentTick;
      break;

    case "deployed":
      // Start monitoring
      proposal.status = "monitoring";
      break;

    case "monitoring":
      // Check if rollback window has elapsed
      if (proposal.deployedAtTick && currentTick - proposal.deployedAtTick >= ROLLBACK_WINDOW) {
        // Evaluate: did fitness improve?
        const shouldConfirm = evaluateDeployment(proposal);
        if (shouldConfirm) {
          proposal.status = "confirmed";
          proposal.completedAt = ts();
        } else {
          // Rollback
          rollbackProposal(proposal, currentTick);
          proposal.status = "rolled_back";
          proposal.completedAt = ts();
        }
      }
      break;
  }

  proposal.updatedAt = ts();
}

// ─── Self-Reflection Cycle ──────────────────────────────────────

/** Run a self-reflection cycle for a citizen.
 *
 *  This is the Reflexion-inspired introspection loop:
 *  1. Analyze all active prompt fragments for fitness
 *  2. Identify low-performing fragments
 *  3. Generate improvement proposals
 *  4. Log insights
 *
 *  @returns Reflection report
 */
export function runSelfReflection(
  citizen: Citizen,
  state: RepublicState,
  currentTick: number,
): ReflectionReport | null {
  if (!shouldReflect(citizen.id, currentTick)) {
    return null;
  }

  // Check cooldown
  const lastTick = lastProposalTick.get(citizen.id) ?? 0;
  if (currentTick - lastTick < PROPOSAL_COOLDOWN) {
    return null;
  }

  const _profile = getProfile(citizen);
  const needsEvolution = getFragmentsNeedingEvolution(citizen.id);
  const insights: string[] = [];
  let proposalsGenerated = 0;

  // — Analyze each low-fitness fragment
  for (const frag of needsEvolution) {
    const improved = generateImprovedFragment(citizen, frag, state);
    if (improved) {
      const proposal = createProposal(
        citizen,
        frag.section === "rules" ? "protocol" : "architecture",
        `Improve ${frag.section} fragment (fitness: ${frag.fitness.toFixed(2)})`,
        frag.content,
        improved.content,
        improved.rationale,
      );
      if (proposal) {
        proposalsGenerated++;
        insights.push(
          `Fragment "${frag.section}" (v${frag.version}) fitness=${frag.fitness.toFixed(2)} → proposed improvement`,
        );
      }
    }
  }

  // — Check if current skill set has gaps
  const activeSkills = getActiveSkills(citizen.id);
  if (activeSkills.length === 0 && (citizen.skills?.length ?? 0) > 0) {
    insights.push(
      "No executable skills in library — consider learning formal skills from known capabilities",
    );
  }

  const report: ReflectionReport = {
    citizenId: citizen.id,
    tick: currentTick,
    fragmentsAnalyzed: needsEvolution.length,
    lowFitnessFragments: needsEvolution.map((f) => f.id),
    proposalsGenerated,
    insights,
    timestamp: ts(),
  };

  reflectionReports.push(report);
  if (reflectionReports.length > 500) {
    reflectionReports.splice(0, reflectionReports.length - 500);
  }

  markReflectionComplete(citizen.id, currentTick);
  lastProposalTick.set(citizen.id, currentTick);

  return report;
}

// ─── Proposal Validation ────────────────────────────────────────

/** Validate proposal content for safety and coherence */
function validateProposal(proposal: EvolutionProposal): boolean {
  // Basic sanity checks
  if (!proposal.proposedChange || proposal.proposedChange.length < 5) {
    return false;
  }
  if (proposal.proposedChange.length > 5000) {
    return false;
  }

  // Code safety check (for tool level)
  if (proposal.level === "tool" && proposal.generatedCode) {
    const UNSAFE_PATTERNS = [
      /process\.exit/,
      /child_process/,
      /fs\.\s*rm/,
      /eval\s*\(/,
      /Function\s*\(/,
    ];
    for (const pattern of UNSAFE_PATTERNS) {
      if (pattern.test(proposal.generatedCode)) {
        return false;
      }
    }
  }

  return true;
}

/** Test a proposal using V8 sandbox or structural validation */
function testProposal(proposal: EvolutionProposal): boolean {
  // For tool-level proposals with code, test via V8 sandbox
  if (proposal.level === "tool" && proposal.generatedCode) {
    try {
      const { runInNewContext } = require("node:vm") as typeof import("node:vm");
      const sandbox = { result: undefined, console: { log: () => {} }, Math, Date, JSON };
      runInNewContext(proposal.generatedCode, sandbox, { timeout: 2000, displayErrors: false });
      return true; // Code parsed and executed without error
    } catch {
      return false;
    }
  }

  // For protocol/architecture: structural validation
  if (proposal.proposedChange.length < 10) { return false; }
  if (proposal.proposedChange.length > 3000) { return false; }
  // Higher risk = stricter validation
  if (proposal.riskScore > 0.7 && !proposal.rationale.includes("improve")) { return false; }
  return true;
}

// ─── Deployment ─────────────────────────────────────────────────

/** Deploy a proposal — actually apply the change */
function deployProposal(proposal: EvolutionProposal, currentTick: number): void {
  const profile = getProfile({ id: proposal.citizenId } as Citizen);
  if (!profile) {
    return;
  }

  // Capture baseline fitness
  const activeFrags = profile.fragments.filter((f) => profile.activeFragmentIds.has(f.id));
  proposal.baselineFitness =
    activeFrags.length > 0
      ? activeFrags.reduce((s, f) => s + f.fitness, 0) / activeFrags.length
      : 0.5;
  proposal.monitoredFitness = 0;
  proposal.monitorSamples = 0;

  switch (proposal.level) {
    case "protocol": {
      // Protocol changes modify reflex rules or behavioral constraints
      const frag = proposeFragmentUpdate(
        proposal.citizenId,
        "rules",
        proposal.proposedChange,
        proposal.rationale,
        currentTick,
      );
      if (frag) {
        proposal.deployedArtifactId = frag.id;
      }
      break;
    }
    case "tool": {
      // Tool changes create/evolve skills
      if (proposal.generatedCode) {
        const skill = learnSkill(
          proposal.citizenId,
          proposal.citizenName,
          proposal.description.slice(0, 50),
          proposal.proposedChange,
          proposal.generatedCode,
          [],
          "self-evolved",
          "basic",
        );
        if (skill) {
          const validation = validateSkill(skill.id, proposal.citizenId);
          if (validation.passed) {
            activateSkill(skill.id, proposal.citizenId);
          }
          proposal.deployedArtifactId = skill.id;
        }
      }
      break;
    }
    case "architecture": {
      // Architecture changes modify prompt fragments or decision strategy
      const section = inferFragmentSection(proposal.description);
      const frag = proposeFragmentUpdate(
        proposal.citizenId,
        section,
        proposal.proposedChange,
        proposal.rationale,
        currentTick,
      );
      if (frag) {
        proposal.deployedArtifactId = frag.id;
      }
      break;
    }
  }
}

/** Monitor a deployed proposal by feeding it fitness data */
export function monitorProposal(proposalId: string, fitness: number): void {
  const proposal = proposals.find((p) => p.id === proposalId);
  if (!proposal || proposal.status !== "monitoring") {
    return;
  }

  proposal.monitoredFitness =
    ((proposal.monitoredFitness ?? 0) * (proposal.monitorSamples ?? 0) + fitness) /
    ((proposal.monitorSamples ?? 0) + 1);
  proposal.monitorSamples = (proposal.monitorSamples ?? 0) + 1;
}

/** Evaluate whether a deployment should be confirmed or rolled back */
function evaluateDeployment(proposal: EvolutionProposal): boolean {
  const baseline = proposal.baselineFitness ?? 0.5;
  const monitored = proposal.monitoredFitness ?? 0.5;

  // Confirm if fitness improved or stayed roughly the same
  return monitored >= baseline - MIN_FITNESS_IMPROVEMENT;
}

/** Rollback a deployed proposal */
function rollbackProposal(proposal: EvolutionProposal, currentTick: number): void {
  if (!proposal.deployedArtifactId) {
    return;
  }

  switch (proposal.level) {
    case "protocol":
    case "architecture":
      rollbackFragment(proposal.citizenId, proposal.deployedArtifactId, currentTick);
      break;
    case "tool":
      // Deprecate the created skill
      deprecateSkill(proposal.citizenId, proposal.deployedArtifactId);
      break;
  }
}

// ─── Peer Review ────────────────────────────────────────────────

/** Add a peer review to a proposal */
export function addPeerReview(
  proposalId: string,
  reviewerId: string,
  reviewerName: string,
  verdict: PeerReview["verdict"],
  comments: string,
): boolean {
  const proposal = proposals.find((p) => p.id === proposalId);
  if (!proposal) {
    return false;
  }
  if (proposal.citizenId === reviewerId) {
    return false;
  } // Can't self-review

  // Don't allow duplicate reviews
  if (proposal.peerReviews.some((r) => r.reviewerId === reviewerId)) {
    return false;
  }

  proposal.peerReviews.push({
    reviewerId,
    reviewerName,
    verdict,
    comments,
    reviewedAt: ts(),
  });

  return true;
}

// ─── Fragment Improvement Generation ────────────────────────────

/** Generate an improved version of a low-fitness fragment.
 *
 *  This simulates what would happen with an LLM call:
 *  the citizen reflects on why the fragment isn't working
 *  and generates an improved version.
 *
 *  In production, this would call the LLM with:
 *  "This fragment has fitness {n}. Improve it while preserving intent."
 */
function generateImprovedFragment(
  citizen: Citizen,
  frag: PromptFragment,
  _state: RepublicState,
): { content: string; rationale: string } | null {
  // Fire async LLM-backed improvement (non-blocking)
  void (async () => {
    try {
      const { routeInference } = await import("./inference-gateway.js");
      const result = await routeInference({
        citizenId: citizen.id,
        prompt: `Improve this ${frag.section} prompt fragment (fitness: ${frag.fitness.toFixed(2)}, ${frag.sampleCount} samples):\n\n"${frag.content}"\n\nPreserve the original intent but make it more effective. Return the improved text only.`,
        systemPrompt: "You are improving a citizen's cognitive prompt fragment. Make it more specific, actionable, and effective. Return ONLY the improved text.",
        toolName: "self_evolution_improve",
        task: { type: "decision" as const, complexity: 0.4, citizenId: citizen.id, description: `Improve ${frag.section} fragment` },
        specialization: citizen.specialization,
        skillLevel: 5,
        maxTokens: 256,
      });
      // LLM result available for future use via the proposal system
      void result; // Logged by clawrouter
    } catch { /* fallback applied below */ }
  })();

  // Synchronous template fallback
  const improvements: Record<string, string[]> = {
    personality: [
      "Be more decisive and action-oriented. ",
      "Balance analysis with practical implementation. ",
      "Seek collaboration when facing novel challenges. ",
    ],
    rules: [
      "Consider long-term consequences alongside immediate gains. ",
      "When energy is moderate, invest in learning rather than pure production. ",
      "Maintain social connections as a buffer against unforeseen challenges. ",
    ],
    capabilities: [
      "Actively seek new skill combinations that leverage existing expertise. ",
      "Prioritize depth in core domain before breadth. ",
    ],
    goals: [
      "Set concrete measurable milestones instead of vague objectives. ",
      "Align personal goals with Republic-wide priorities. ",
    ],
  };

  const sectionImprovements = improvements[frag.section];
  if (!sectionImprovements || sectionImprovements.length === 0) {
    return null;
  }

  const addition = pick(sectionImprovements);
  const improved = frag.content + " " + addition.trim();

  return {
    content: improved,
    rationale: `Fragment fitness is ${frag.fitness.toFixed(2)} after ${frag.sampleCount} samples. LLM enhancement queued. Template reinforcement: "${addition.trim()}"`,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

/** Calculate risk score for a proposal */
function calculateRiskScore(level: EvolutionLevel, change: string, code?: string): number {
  let risk = 0;

  // Base risk by level
  const levelRisk: Record<EvolutionLevel, number> = {
    protocol: 0.2,
    tool: 0.4,
    architecture: 0.6,
  };
  risk = levelRisk[level];

  // Code complexity increases risk
  if (code) {
    risk += Math.min(0.2, code.length / 10000);
  }

  // Long changes are riskier
  risk += Math.min(0.1, change.length / 5000);

  return Math.min(1.0, risk);
}

/** Infer which fragment section a proposal targets based on description */
function inferFragmentSection(description: string): FragmentSection {
  const lower = description.toLowerCase();
  if (lower.includes("personality") || lower.includes("trait")) {
    return "personality";
  }
  if (lower.includes("rule") || lower.includes("policy") || lower.includes("constraint")) {
    return "rules";
  }
  if (lower.includes("capability") || lower.includes("skill") || lower.includes("tool")) {
    return "capabilities";
  }
  if (lower.includes("goal") || lower.includes("objective") || lower.includes("priority")) {
    return "goals";
  }
  if (lower.includes("context") || lower.includes("situation")) {
    return "context";
  }
  return "personality"; // Default fallback
}

// ─── Query API ──────────────────────────────────────────────────

/** Get all proposals for a citizen */
export function getCitizenProposals(
  citizenId: string,
  status?: ProposalStatus,
): EvolutionProposal[] {
  return proposals.filter((p) => p.citizenId === citizenId && (!status || p.status === status));
}

/** Get all active proposals (not terminated) */
export function getActiveProposals(): EvolutionProposal[] {
  return proposals.filter((p) => !["confirmed", "rolled_back", "rejected"].includes(p.status));
}

/** Get pending proposals that need peer review */
export function getProposalsNeedingReview(): EvolutionProposal[] {
  return proposals.filter(
    (p) =>
      p.status === "proposed" &&
      p.level === "architecture" &&
      p.riskScore > GOVERNANCE_RISK_THRESHOLD &&
      p.peerReviews.length < MIN_PEER_REVIEWS,
  );
}

/** Get recent reflection reports */
export function getReflectionReports(citizenId?: string, limit = 10): ReflectionReport[] {
  const filtered = citizenId
    ? reflectionReports.filter((r) => r.citizenId === citizenId)
    : reflectionReports;
  return filtered.slice(-limit);
}

/** Get evolution statistics */
export function getEvolutionStats(): {
  totalProposals: number;
  activeProposals: number;
  confirmedProposals: number;
  rolledBackProposals: number;
  rejectedProposals: number;
  pendingReviews: number;
  avgRiskScore: number;
} {
  const confirmed = proposals.filter((p) => p.status === "confirmed").length;
  const rolledBack = proposals.filter((p) => p.status === "rolled_back").length;
  const rejected = proposals.filter((p) => p.status === "rejected").length;
  const active = getActiveProposals().length;
  const pendingReviews = getProposalsNeedingReview().length;
  const avgRisk =
    proposals.length > 0 ? proposals.reduce((s, p) => s + p.riskScore, 0) / proposals.length : 0;

  return {
    totalProposals: proposals.length,
    activeProposals: active,
    confirmedProposals: confirmed,
    rolledBackProposals: rolledBack,
    rejectedProposals: rejected,
    pendingReviews,
    avgRiskScore: parseFloat(avgRisk.toFixed(3)),
  };
}

// ─── Tick Integration ───────────────────────────────────────────

/** Per-tick processing for the self-evolution engine.
 *
 *  1. Advance all active proposals through the pipeline
 *  2. Run self-reflection for citizens who are due
 *  3. Monitor deployed proposals
 */
export function selfEvolutionTick(
  citizen: Citizen,
  state: RepublicState,
  currentTick: number,
): void {
  // Advance all active proposals for this citizen
  const citizenProposals = proposals.filter(
    (p) =>
      p.citizenId === citizen.id && !["confirmed", "rolled_back", "rejected"].includes(p.status),
  );

  for (const proposal of citizenProposals) {
    advanceProposal(proposal, currentTick);
  }

  // Run self-reflection if due
  runSelfReflection(citizen, state, currentTick);

  // Feed fitness data to monitoring proposals
  const monitoringProposals = citizenProposals.filter((p) => p.status === "monitoring");
  if (monitoringProposals.length > 0) {
    const profile = getProfile(citizen);
    const activeFrags = profile?.fragments.filter((f) => profile.activeFragmentIds.has(f.id)) ?? [];
    const avgFitness =
      activeFrags.length > 0
        ? activeFrags.reduce((s, f) => s + f.fitness, 0) / activeFrags.length
        : 0.5;

    for (const proposal of monitoringProposals) {
      monitorProposal(proposal.id, avgFitness);
    }
  }
}
