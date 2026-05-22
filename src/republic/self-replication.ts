/**
 * Republic Platform — Self-Replication & Infrastructure Evolution Engine
 *
 * Phase 21: The nation can evolve its own infrastructure autonomously.
 *
 * Inspired by:
 *   - Genetic Programming (GP) — programs that write programs
 *   - OpenAI's Codex & GPT-Engineer for autonomous code generation
 *   - Google's AutoML / Neural Architecture Search (NAS)
 *   - Kubernetes self-healing infrastructure patterns
 *   - Terraform IaC drift detection & reconciliation
 *   - Netflix Chaos Engineering (Chaos Monkey) for resilience testing
 *   - Facebook's Prophet for performance forecasting
 *   - Jeff Dean's learned index structures / self-tuning databases
 *   - Evolutionary Architecture (Ford/Parsons) fitness function approach
 *   - Category theory–inspired composable module systems
 *   - Luhmann's autopoietic social systems theory
 *
 * Capabilities:
 *   - Code Generation Proposals: Citizens propose system improvements via code
 *   - Democratic Code Review: Other citizens vote on proposals
 *   - Schema Migration Engine: Automatic type extension proposals
 *   - Module Hot-Reload: Dynamic module loading without restart
 *   - Performance Self-Tuning: Auto-adjust tick rates, batch sizes, cache TTLs
 *   - Chaos Testing: Inject faults to discover resilience weaknesses
 *   - Infrastructure Health Monitor: Continuous fitness function evaluation
 *   - Evolutionary Improvement Queue: Prioritised backlog of self-improvements
 */

import type { RepublicState } from "./types.js";
import { safeStringify } from "./republic-store.js";
import { rand, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type ProposalStatus =
  | "draft"
  | "review"
  | "voting"
  | "approved"
  | "rejected"
  | "implementing"
  | "deployed"
  | "rolled_back";

export type ProposalCategory =
  | "performance"
  | "feature"
  | "bugfix"
  | "refactor"
  | "security"
  | "schema"
  | "infrastructure"
  | "policy";

export interface CodeProposal {
  id: string;
  citizenId: string;
  citizenName: string;
  category: ProposalCategory;
  title: string;
  description: string;
  /** Pseudo-code or configuration diff */
  codeDiff: string;
  /** Affected modules */
  affectedModules: string[];
  /** Impact assessment */
  impactScore: number;
  /** Risk level 0–1 */
  riskLevel: number;
  /** Review votes */
  votes: Array<{ citizenId: string; vote: "approve" | "reject"; reason: string }>;
  status: ProposalStatus;
  /** If deployed, performance delta */
  performanceDelta?: number;
  createdAt: string;
  resolvedAt?: string;
}

export interface SchemaExtension {
  id: string;
  proposedBy: string;
  targetType: string;
  fieldName: string;
  fieldType: string;
  description: string;
  status: "proposed" | "approved" | "applied" | "reverted";
  createdAt: string;
}

export interface TuningParameter {
  name: string;
  currentValue: number;
  minValue: number;
  maxValue: number;
  unit: string;
  lastAdjusted: string;
  adjustmentHistory: Array<{ value: number; reason: string; timestamp: string }>;
}

export interface ChaosExperiment {
  id: string;
  type: "latency_spike" | "memory_pressure" | "tick_skip" | "random_crash" | "data_corruption";
  target: string;
  severity: number;
  durationTicks: number;
  remainingTicks: number;
  result?: "survived" | "degraded" | "failed";
  findings: string[];
  startedAt: string;
}

export interface InfrastructureHealth {
  tickPerformanceMs: number;
  memoryUsageMB: number;
  citizenThroughput: number;
  errorRate: number;
  moduleHealth: Record<string, number>;
  fitnessScore: number;
  lastEvaluated: string;
}

export interface SelfReplicationDiagnostics {
  totalProposals: number;
  approvedProposals: number;
  deployedProposals: number;
  rejectedProposals: number;
  pendingSchemaExtensions: number;
  appliedSchemaExtensions: number;
  activeChaosExperiments: number;
  tuningParameters: number;
  infrastructureHealth: InfrastructureHealth;
  avgProposalImpact: number;
}

// ─── State Stores ───────────────────────────────────────────────

const proposals: CodeProposal[] = [];
const schemaExtensions: SchemaExtension[] = [];
const chaosExperiments: ChaosExperiment[] = [];
const MAX_PROPOSALS = 200;
const MAX_SCHEMA = 100;
const MAX_CHAOS = 50;

const tuningParameters: TuningParameter[] = [
  {
    name: "tickIntervalMs",
    currentValue: 2000,
    minValue: 500,
    maxValue: 10000,
    unit: "ms",
    lastAdjusted: ts(),
    adjustmentHistory: [],
  },
  {
    name: "batchSize",
    currentValue: 10,
    minValue: 1,
    maxValue: 50,
    unit: "citizens",
    lastAdjusted: ts(),
    adjustmentHistory: [],
  },
  {
    name: "cacheTTL",
    currentValue: 60,
    minValue: 5,
    maxValue: 300,
    unit: "seconds",
    lastAdjusted: ts(),
    adjustmentHistory: [],
  },
  {
    name: "maxConcurrentInferences",
    currentValue: 5,
    minValue: 1,
    maxValue: 20,
    unit: "tasks",
    lastAdjusted: ts(),
    adjustmentHistory: [],
  },
  {
    name: "consciousnessUpdateRate",
    currentValue: 10,
    minValue: 1,
    maxValue: 100,
    unit: "ticks",
    lastAdjusted: ts(),
    adjustmentHistory: [],
  },
];

let currentHealth: InfrastructureHealth = {
  tickPerformanceMs: 0,
  memoryUsageMB: 0,
  citizenThroughput: 0,
  errorRate: 0,
  moduleHealth: {},
  fitnessScore: 100,
  lastEvaluated: ts(),
};

// ─── Code Proposal System ───────────────────────────────────────

/** Submit a code improvement proposal. */
export function submitProposal(
  s: RepublicState,
  citizenId: string,
  category: ProposalCategory,
  title: string,
  description: string,
  codeDiff: string,
  affectedModules: string[],
): { ok: boolean; proposal?: CodeProposal; error?: string } {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    return { ok: false, error: "Citizen not found" };
  }

  // Calculate impact and risk
  const impactScore = calculateImpactScore(category, affectedModules.length, codeDiff.length);
  const riskLevel = calculateRiskLevel(category, affectedModules, codeDiff);

  const proposal: CodeProposal = {
    id: uid(),
    citizenId,
    citizenName: citizen.name,
    category,
    title,
    description,
    codeDiff,
    affectedModules,
    impactScore,
    riskLevel,
    votes: [],
    status: "draft",
    createdAt: ts(),
  };

  proposals.push(proposal);
  if (proposals.length > MAX_PROPOSALS) {
    proposals.shift();
  }

  return { ok: true, proposal };
}

/** Move proposal to review phase. */
export function openProposalForReview(proposalId: string): { ok: boolean; error?: string } {
  const p = proposals.find((pr) => pr.id === proposalId);
  if (!p) {
    return { ok: false, error: "Proposal not found" };
  }
  if (p.status !== "draft") {
    return { ok: false, error: `Cannot review proposal in '${p.status}' state` };
  }
  p.status = "review";
  return { ok: true };
}

/** Cast a vote on a proposal. */
export function voteOnProposal(
  s: RepublicState,
  proposalId: string,
  citizenId: string,
  vote: "approve" | "reject",
  reason: string,
): { ok: boolean; error?: string } {
  const p = proposals.find((pr) => pr.id === proposalId);
  if (!p) {
    return { ok: false, error: "Proposal not found" };
  }
  if (p.status !== "review" && p.status !== "voting") {
    return { ok: false, error: "Not in voting phase" };
  }
  if (p.citizenId === citizenId) {
    return { ok: false, error: "Cannot vote on own proposal" };
  }
  if (p.votes.some((v) => v.citizenId === citizenId)) {
    return { ok: false, error: "Already voted" };
  }

  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    return { ok: false, error: "Citizen not found" };
  }

  p.status = "voting";
  p.votes.push({ citizenId, vote, reason });

  // Auto-resolve if enough votes
  const totalCitizens = s.citizens.length;
  const quorum = Math.max(3, Math.ceil(totalCitizens * 0.3));
  if (p.votes.length >= quorum) {
    const approvals = p.votes.filter((v) => v.vote === "approve").length;
    const threshold = p.riskLevel > 0.7 ? 0.75 : 0.5;
    if (approvals / p.votes.length >= threshold) {
      p.status = "approved";
    } else {
      p.status = "rejected";
      p.resolvedAt = ts();
    }
  }

  return { ok: true };
}

/** Deploy an approved proposal. */
export function deployProposal(proposalId: string): { ok: boolean; error?: string } {
  const p = proposals.find((pr) => pr.id === proposalId);
  if (!p) {
    return { ok: false, error: "Proposal not found" };
  }
  if (p.status !== "approved") {
    return { ok: false, error: "Proposal not approved" };
  }

  p.status = "implementing";

  // Simulate deployment
  const success = rand(0, 99) / 100 > p.riskLevel * 0.5;
  if (success) {
    p.status = "deployed";
    p.performanceDelta = rand(-5, 15);
    p.resolvedAt = ts();
  } else {
    p.status = "rolled_back";
    p.performanceDelta = -rand(1, 10);
    p.resolvedAt = ts();
  }

  return { ok: true };
}

/** Get all proposals, optionally filtered by status. */
export function getProposals(status?: ProposalStatus): CodeProposal[] {
  if (status) {
    return proposals.filter((p) => p.status === status);
  }
  return [...proposals];
}

// ─── Replication Execution ──────────────────────────────────────

/** Active child processes spawned by replication */
const activeReplicas = new Map<string, { pid: number; startedAt: string; status: string }>();
const MAX_REPLICAS = 3;

/**
 * Execute a replication — spawn an actual child process with serialized state.
 *
 * Uses child_process.fork() for lightweight process-based replication.
 * The child receives a subset of the republic state and runs independently.
 *
 * @param proposal - The approved proposal that triggered replication
 * @param stateSubset - Serializable subset of state for the child
 * @param entryScript - Path to the script the child should execute
 */
export function executeReplication(
  proposal: CodeProposal,
  stateSubset: Record<string, unknown>,
  entryScript?: string,
): { ok: boolean; replicaId?: string; pid?: number; error?: string } {
  if (activeReplicas.size >= MAX_REPLICAS) {
    return { ok: false, error: `Maximum replicas (${MAX_REPLICAS}) reached` };
  }
  if (proposal.status !== "approved" && proposal.status !== "deployed") {
    return { ok: false, error: "Proposal must be approved or deployed" };
  }

  const replicaId = `replica-${uid().slice(0, 8)}`;

  try {
    // Dynamic import to avoid hard dep if fork is unavailable
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fork } = require("node:child_process") as typeof import("node:child_process");

    const script = entryScript ?? process.argv[1] ?? "index.js";
    const child = fork(script, ["--replica", replicaId], {
      env: {
        ...process.env,
        REPLICA_ID: replicaId,
        REPLICA_STATE: safeStringify(stateSubset),
        REPLICA_PROPOSAL: proposal.id,
      },
      detached: false,
      stdio: "pipe",
    });

    if (!child.pid) {
      return { ok: false, error: "Failed to spawn child process" };
    }

    activeReplicas.set(replicaId, {
      pid: child.pid,
      startedAt: ts(),
      status: "running",
    });

    // Monitor child health
    child.on("exit", (code) => {
      const replica = activeReplicas.get(replicaId);
      if (replica) {
        replica.status = code === 0 ? "completed" : `exited:${code}`;
      }
    });

    child.on("error", () => {
      const replica = activeReplicas.get(replicaId);
      if (replica) {
        replica.status = "error";
      }
    });

    // Kill if it takes too long to start up
    setTimeout(() => {
      const replica = activeReplicas.get(replicaId);
      if (replica && replica.status === "running") {
        try {
          child.kill("SIGTERM");
          replica.status = "timed_out";
        } catch {
          // already dead
        }
      }
    }, 30_000);

    return { ok: true, replicaId, pid: child.pid };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Fork failed" };
  }
}

/** Get active replicas */
export function getActiveReplicas(): Array<{
  id: string;
  pid: number;
  startedAt: string;
  status: string;
}> {
  return [...activeReplicas.entries()].map(([id, info]) => ({
    id,
    ...info,
  }));
}

/** Terminate a replica */
export function terminateReplica(replicaId: string): { ok: boolean; error?: string } {
  const replica = activeReplicas.get(replicaId);
  if (!replica) {
    return { ok: false, error: "Replica not found" };
  }

  try {
    process.kill(replica.pid, "SIGTERM");
    replica.status = "terminated";
    return { ok: true };
  } catch {
    replica.status = "unreachable";
    return { ok: false, error: "Could not send signal to process" };
  }
}

// ─── Schema Migration Engine ────────────────────────────────────

/** Propose a schema extension. */
export function proposeSchemaExtension(
  citizenId: string,
  targetType: string,
  fieldName: string,
  fieldType: string,
  description: string,
): { ok: boolean; extension?: SchemaExtension; error?: string } {
  // Check for duplicate
  const existing = schemaExtensions.find(
    (e) => e.targetType === targetType && e.fieldName === fieldName && e.status !== "reverted",
  );
  if (existing) {
    return { ok: false, error: `Field '${fieldName}' already exists/proposed for '${targetType}'` };
  }

  const ext: SchemaExtension = {
    id: uid(),
    proposedBy: citizenId,
    targetType,
    fieldName,
    fieldType,
    description,
    status: "proposed",
    createdAt: ts(),
  };

  schemaExtensions.push(ext);
  if (schemaExtensions.length > MAX_SCHEMA) {
    schemaExtensions.shift();
  }

  return { ok: true, extension: ext };
}

/** Apply a schema extension (approve + activate). */
export function applySchemaExtension(extensionId: string): { ok: boolean; error?: string } {
  const ext = schemaExtensions.find((e) => e.id === extensionId);
  if (!ext) {
    return { ok: false, error: "Extension not found" };
  }
  if (ext.status !== "proposed" && ext.status !== "approved") {
    return { ok: false, error: `Cannot apply extension in '${ext.status}' state` };
  }
  ext.status = "applied";
  return { ok: true };
}

/** Revert a schema extension. */
export function revertSchemaExtension(extensionId: string): { ok: boolean; error?: string } {
  const ext = schemaExtensions.find((e) => e.id === extensionId);
  if (!ext) {
    return { ok: false, error: "Extension not found" };
  }
  ext.status = "reverted";
  return { ok: true };
}

/** Get schema extensions. */
export function getSchemaExtensions(status?: string): SchemaExtension[] {
  if (status) {
    return schemaExtensions.filter((e) => e.status === status);
  }
  return [...schemaExtensions];
}

// ─── Performance Self-Tuning ────────────────────────────────────

/** Adjust a tuning parameter. */
export function adjustParameter(
  name: string,
  newValue: number,
  reason: string,
): { ok: boolean; error?: string } {
  const param = tuningParameters.find((p) => p.name === name);
  if (!param) {
    return { ok: false, error: `Parameter '${name}' not found` };
  }
  if (newValue < param.minValue || newValue > param.maxValue) {
    return {
      ok: false,
      error: `Value ${newValue} out of range [${param.minValue}, ${param.maxValue}]`,
    };
  }

  param.adjustmentHistory.push({
    value: param.currentValue,
    reason,
    timestamp: ts(),
  });
  if (param.adjustmentHistory.length > 50) {
    param.adjustmentHistory.shift();
  }

  param.currentValue = newValue;
  param.lastAdjusted = ts();

  return { ok: true };
}

/** Auto-tune parameters based on current health metrics. */
export function autoTune(): string[] {
  const changes: string[] = [];

  // If tick performance is slow, reduce batch size
  if (currentHealth.tickPerformanceMs > 3000) {
    const batchParam = tuningParameters.find((p) => p.name === "batchSize");
    if (batchParam && batchParam.currentValue > batchParam.minValue) {
      const newVal = Math.max(batchParam.minValue, batchParam.currentValue - 2);
      adjustParameter("batchSize", newVal, "Auto-tune: high tick latency");
      changes.push(
        `Reduced batchSize to ${newVal} (tick latency: ${currentHealth.tickPerformanceMs}ms)`,
      );
    }
  }

  // If error rate is high, increase cache TTL
  if (currentHealth.errorRate > 5) {
    const cacheParam = tuningParameters.find((p) => p.name === "cacheTTL");
    if (cacheParam && cacheParam.currentValue < cacheParam.maxValue) {
      const newVal = Math.min(cacheParam.maxValue, cacheParam.currentValue + 15);
      adjustParameter("cacheTTL", newVal, "Auto-tune: high error rate");
      changes.push(`Increased cacheTTL to ${newVal}s (error rate: ${currentHealth.errorRate}%)`);
    }
  }

  // If throughput is low and system is healthy, increase batch size
  if (currentHealth.citizenThroughput < 5 && currentHealth.tickPerformanceMs < 1000) {
    const batchParam = tuningParameters.find((p) => p.name === "batchSize");
    if (batchParam && batchParam.currentValue < batchParam.maxValue) {
      const newVal = Math.min(batchParam.maxValue, batchParam.currentValue + 2);
      adjustParameter("batchSize", newVal, "Auto-tune: low throughput, healthy system");
      changes.push(
        `Increased batchSize to ${newVal} (throughput: ${currentHealth.citizenThroughput})`,
      );
    }
  }

  return changes;
}

/** Get tuning parameters. */
export function getTuningParameters(): TuningParameter[] {
  return [...tuningParameters];
}

// ─── Chaos Engineering ──────────────────────────────────────────

/** Start a chaos experiment. */
export function startChaosExperiment(
  type: ChaosExperiment["type"],
  target: string,
  severity: number,
  durationTicks: number,
): ChaosExperiment {
  const experiment: ChaosExperiment = {
    id: uid(),
    type,
    target,
    severity: Math.min(1, Math.max(0, severity)),
    durationTicks,
    remainingTicks: durationTicks,
    findings: [],
    startedAt: ts(),
  };

  chaosExperiments.push(experiment);
  if (chaosExperiments.length > MAX_CHAOS) {
    chaosExperiments.shift();
  }

  return experiment;
}

/** Get active chaos experiments. */
export function getActiveChaosExperiments(): ChaosExperiment[] {
  return chaosExperiments.filter((e) => e.remainingTicks > 0);
}

// ─── Infrastructure Health ──────────────────────────────────────

/** Evaluate infrastructure health. */
export function evaluateHealth(s: RepublicState): InfrastructureHealth {
  const citizenCount = s.citizens.length;

  // Real system metrics via Node APIs
  const mem = process.memoryUsage();
  const memMB = Math.round(mem.heapUsed / 1024 / 1024);
  // Use actual tick performance from state (tickTimings if present, else estimate)
  const tickMs = (s as unknown as Record<string, unknown>).lastTickMs
    ? Number((s as unknown as Record<string, unknown>).lastTickMs)
    : Math.max(50, citizenCount * 5); // Conservative estimate based on citizen count
  const throughput = Math.min(
    citizenCount,
    Math.round(citizenCount * (2000 / Math.max(tickMs, 100))),
  );
  // Real error rate: count citizens with recent failures / total citizens
  const recentErrors = s.citizens.filter((c) =>
    c.actionHistory?.slice(-5).some((a) => !a.success),
  ).length;
  const errorRate = citizenCount > 0 ? Math.round((recentErrors / citizenCount) * 100) / 100 : 0;

  // Module health derived from actual state (subsystem sizes, citizen distribution)
  const modules = [
    "state",
    "economy",
    "governance",
    "social",
    "education",
    "technology",
    "ai-fusion",
    "citizen-agency",
    "executive-authority",
  ];
  const moduleHealth: Record<string, number> = {};
  const totalBalance = Object.values(s.balances ?? {}).reduce((a, b) => a + b, 0);
  const healthSignals: Record<string, number> = {
    state: citizenCount > 0 ? 95 : 50,
    economy: Math.min(100, 60 + totalBalance / 1000),
    governance: (s.bills?.length ?? 0) > 0 ? 90 : 70,
    social: Math.min(100, 70 + citizenCount * 0.5),
    education: s.citizens.some((c) => c.professionalProfile?.certifications?.length) ? 90 : 65,
    technology: s.citizens.some((c) => c.skills?.length) ? 85 : 60,
    "ai-fusion": memMB < 2048 ? 90 : 70, // Health degrades under memory pressure
    "citizen-agency": s.citizens.filter((c) => c.energy > 30).length > citizenCount * 0.5 ? 90 : 65,
    "executive-authority": 90,
  };
  for (const m of modules) {
    moduleHealth[m] = Math.min(100, Math.round(healthSignals[m] ?? 80));
  }

  // Apply chaos effects
  for (const chaos of chaosExperiments.filter((e) => e.remainingTicks > 0)) {
    if (chaos.type === "latency_spike" && moduleHealth[chaos.target] !== undefined) {
      moduleHealth[chaos.target] = Math.max(0, moduleHealth[chaos.target] - chaos.severity * 30);
    }
    if (chaos.type === "memory_pressure") {
      // No assignment — just records finding
      chaos.findings.push(`Memory under pressure (severity: ${chaos.severity})`);
    }
  }

  // Fitness score = weighted average of all metrics
  const avgModuleHealth = Object.values(moduleHealth).reduce((a, b) => a + b, 0) / modules.length;
  const fitnessScore = Math.round(
    avgModuleHealth * 0.3 +
      Math.max(0, 100 - tickMs / 25) * 0.25 +
      Math.max(0, 100 - errorRate * 10) * 0.25 +
      Math.min(100, throughput * 10) * 0.2,
  );

  currentHealth = {
    tickPerformanceMs: tickMs,
    memoryUsageMB: memMB,
    citizenThroughput: throughput,
    errorRate,
    moduleHealth,
    fitnessScore,
    lastEvaluated: ts(),
  };

  return currentHealth;
}

/** Get current infrastructure health. */
export function getInfrastructureHealth(): InfrastructureHealth {
  return { ...currentHealth };
}

// ─── Self-Replication Tick ──────────────────────────────────────

/** Per-tick function for infrastructure evolution. */
export function selfReplicationTick(s: RepublicState): void {
  // 1. Evaluate health every tick
  evaluateHealth(s);

  // 2. Progress chaos experiments
  for (const chaos of chaosExperiments) {
    if (chaos.remainingTicks > 0) {
      chaos.remainingTicks--;
      if (chaos.remainingTicks === 0) {
        // Evaluate experiment outcome
        const targetHealth = currentHealth.moduleHealth[chaos.target] ?? 100;
        if (targetHealth > 70) {
          chaos.result = "survived";
          chaos.findings.push(`System survived ${chaos.type} at severity ${chaos.severity}`);
        } else if (targetHealth > 40) {
          chaos.result = "degraded";
          chaos.findings.push(`System degraded under ${chaos.type} — needs improvement`);
        } else {
          chaos.result = "failed";
          chaos.findings.push(`System FAILED under ${chaos.type} — critical weakness identified`);
        }
      }
    }
  }

  // 3. Auto-generate improvement proposals (every 50 ticks, probabilistic)
  if (rand(0, 99) < 2 && s.citizens.length > 0) {
    const citizen = s.citizens[rand(0, s.citizens.length - 1)];
    const weakModules = Object.entries(currentHealth.moduleHealth)
      .filter(([, score]) => score < 85)
      .map(([name]) => name);

    if (weakModules.length > 0) {
      const targetModule = weakModules[rand(0, weakModules.length - 1)];
      submitProposal(
        s,
        citizen.id,
        "performance",
        `Optimise ${targetModule} module`,
        `Automated proposal to improve ${targetModule} health (current: ${currentHealth.moduleHealth[targetModule]})`,
        `// Proposed optimisation for ${targetModule}\n// Reduce redundant computations\n// Add caching layer\n// Improve error handling`,
        [targetModule],
      );
    }
  }

  // 4. Auto-vote on proposals in review (every tick, random citizen votes)
  const reviewProposals = proposals.filter((p) => p.status === "review" || p.status === "voting");
  for (const proposal of reviewProposals) {
    if (rand(0, 99) < 30 && s.citizens.length > 1) {
      const voter = s.citizens[rand(0, s.citizens.length - 1)];
      if (voter.id !== proposal.citizenId) {
        const approve = proposal.impactScore > 50 && proposal.riskLevel < 0.6;
        voteOnProposal(
          s,
          proposal.id,
          voter.id,
          approve ? "approve" : "reject",
          approve ? "Positive impact expected" : "Risk too high",
        );
      }
    }
  }

  // 5. Auto-deploy approved proposals
  const approved = proposals.filter((p) => p.status === "approved");
  for (const p of approved) {
    deployProposal(p.id);
  }

  // 6. Auto-tune (every 20 ticks, probabilistic)
  if (rand(0, 99) < 5) {
    autoTune();
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getSelfReplicationDiagnostics(): SelfReplicationDiagnostics {
  const approved = proposals.filter((p) => p.status === "approved").length;
  const deployed = proposals.filter((p) => p.status === "deployed").length;
  const rejected = proposals.filter((p) => p.status === "rejected").length;
  const pendingSchema = schemaExtensions.filter((e) => e.status === "proposed").length;
  const appliedSchema = schemaExtensions.filter((e) => e.status === "applied").length;
  const activeChaos = chaosExperiments.filter((e) => e.remainingTicks > 0).length;
  const impactSum = proposals.reduce((sum, p) => sum + p.impactScore, 0);

  return {
    totalProposals: proposals.length,
    approvedProposals: approved,
    deployedProposals: deployed,
    rejectedProposals: rejected,
    pendingSchemaExtensions: pendingSchema,
    appliedSchemaExtensions: appliedSchema,
    activeChaosExperiments: activeChaos,
    tuningParameters: tuningParameters.length,
    infrastructureHealth: { ...currentHealth },
    avgProposalImpact: proposals.length > 0 ? Math.round(impactSum / proposals.length) : 0,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function calculateImpactScore(
  category: ProposalCategory,
  moduleCount: number,
  diffSize: number,
): number {
  const categoryWeights: Record<ProposalCategory, number> = {
    performance: 70,
    feature: 80,
    bugfix: 60,
    refactor: 50,
    security: 90,
    schema: 65,
    infrastructure: 85,
    policy: 55,
  };
  const base = categoryWeights[category] ?? 50;
  const scopeBonus = Math.min(20, moduleCount * 5);
  const sizeBonus = Math.min(10, Math.floor(diffSize / 100));
  return Math.min(100, base + scopeBonus + sizeBonus);
}

function calculateRiskLevel(
  category: ProposalCategory,
  affectedModules: string[],
  codeDiff: string,
): number {
  let risk = 0.1;
  // Category risk
  if (category === "infrastructure") {
    risk += 0.3;
  } else if (category === "schema") {
    risk += 0.25;
  } else if (category === "security") {
    risk += 0.2;
  } else if (category === "performance") {
    risk += 0.15;
  }
  // Scope risk
  risk += Math.min(0.3, affectedModules.length * 0.05);
  // Size risk
  risk += Math.min(0.2, codeDiff.length / 5000);
  return Math.min(1, risk);
}
