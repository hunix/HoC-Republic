/**
 * Republic Gateway Handlers — Autonomy (Phases 19–27)
 *
 * RPC handlers for all autonomous system modules:
 *  - Phase 19: Git Operations
 *  - Phase 20: Code Intelligence (SICA)
 *  - Phase 21: Autonomous CI/CD Pipeline
 *  - Phase 22: Self-Diagnostics & Healing
 *  - Phase 23: Quantum-Entangled State Replication
 *  - Phase 24: Mitosis Controller
 *  - Phase 25: Universal Model Intelligence Engine (UMIE)
 *  - Phase 26: PersonaPlex Voice Persona Engine
 *  - Phase 27: Gateway Lifecycle & Resource Management
 */

import type { GatewayRequestHandlers } from "../types.js";
// ─── Phase 21: Autonomous CI/CD ────────────────────────────────
import {
  autoApprove,
  buildProject,
  canaryDeploy,
  cicdDiagnostics,
  createPipeline,
  deploymentHistory,
  deployToEnvironment,
  monitorDeployment,
  rollback,
  runTests,
} from "../../../republic/autonomous-cicd.js";
// ─── Phase 29: Living Avatar Engine ────────────────────────────
import {
  avatarDiagnostics as avDiagnostics,
  avatarListen as avListen,
  avatarStartListening as avStartListening,
  createAvatarSession as avCreateSession,
  endAvatarSession as avEndSession,
  getAvatarState as avGetState,
  getPersonality as avGetPersonality,
  listAvatarSessions as avListSessions,
  setPersonality as avSetPersonality,
} from "../../../republic/avatar-engine.js";
// ─── Phase 20: Code Intelligence ───────────────────────────────
import {
  analyzeModule,
  codeIntelligenceDiagnostics,
  councilReview,
  createImprovementPlan,
  diagnoseCodeIssues,
  generateCodeFix,
  reviewCodeDiff,
} from "../../../republic/code-intelligence.js";
// ─── Phase 19: Git Operations ──────────────────────────────────
import {
  cloneRepo,
  cloneSelf,
  commitChanges,
  createBranch,
  diffBranches,
  forkRepo,
  getCommitLog,
  gitOperationsDiagnostics,
  listBranches,
  pushBranch,
  repoStatus,
} from "../../../republic/git-operations.js";
// ─── Phase 24: Mitosis Controller ──────────────────────────────
import {
  captureDNA,
  decommissionInstance,
  fullMitosis,
  getInstanceInfo,
  getLineage,
  initiateMitosis,
  listInstances,
  mitosisDiagnostics,
  promoteInstance,
} from "../../../republic/mitosis-controller.js";
// ─── Phase 30: System Pulse + n8n Dashboard ────────────────────
import { getN8nBridge } from "../../../republic/n8n-bridge.js";
// ─── Phase 26: PersonaPlex Voice Persona Engine ────────────────
import {
  connect as ppConnect,
  createPersona,
  deletePersona,
  disconnect as ppDisconnect,
  endConversation,
  listConversations,
  listPersonas,
  personaplexDiagnostics,
  sendTextMessage,
  setActivePersona,
  startConversation,
  type PersonaStyle,
} from "../../../republic/personaplex-engine.js";
// ─── Phase 23: Quantum State Sync ──────────────────────────────
import {
  collapseState,
  createSwarm,
  decohere,
  entangle,
  listEntangledPairs,
  propagateState,
  quantumSyncDiagnostics,
  swarmBroadcast,
  teleportState,
} from "../../../republic/quantum-state-sync.js";
// ─── Phase 22: Self-Diagnostics ────────────────────────────────
import {
  autoHealCycle,
  diagnoseAnomalies,
  executeHealing,
  fullSystemScan,
  prescribeHealing,
  selfDiagnosticsSummary,
} from "../../../republic/self-diagnostics.js";
import {
  getLatestPulse as spGetLatest,
  getPulseHistory as spGetHistory,
  getUnresolvedAlerts as spGetAlerts,
  pulseDiagnostics as spDiagnostics,
  registerDefaultCollectors as spRegisterDefaults,
  resolveAlert as spResolveAlert,
  startPulse as spStartPulse,
  stopPulse as spStopPulse,
  takePulse as spTakePulse,
} from "../../../republic/system-pulse.js";
// ─── Phase 25: Universal Model Intelligence Engine ─────────────
import {
  createPipeline as createModelPipeline,
  deregisterModel,
  executePipeline as executeModelPipeline,
  getModel,
  infer,
  listModels,
  listPipelines as listModelPipelines,
  recursiveInfer,
  registerModel,
  umieDiagnostics,
  type ModelParadigm,
} from "../../../republic/universal-model-engine.js";
// ─── Phase 28: Vector DB Orchestration ─────────────────────────
import {
  createCluster as vdbCreateCluster,
  createCollection as vdbCreateCollection,
  deleteCluster as vdbDeleteCluster,
  dropCollection as vdbDropCollection,
  insertDocuments as vdbInsertDocs,
  listClusters as vdbListClusters,
  listCollections as vdbListCollections,
  queryCollection as vdbQuery,
  stopCluster as vdbStopCluster,
  vectordbDiagnostics as vdbDiagnostics,
} from "../../../republic/vectordb-engine.js";
// ─── Phase 27: Gateway Lifecycle & Resource Management ─────────
import {
  getBootMetrics,
  lifecycleDiagnostics as lcDiagnostics,
  listCircuitBreakers as listAllCircuitBreakers,
  listHandlers as listHandlersAll,
  loadHandler,
  takeResourceSnapshot as takeSnapshot,
} from "../../gateway-lifecycle.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

// ─────────────────────────────────────────────────────────────────

export const autonomyHandlers: Partial<GatewayRequestHandlers> = {
  // ═══════════════════════════════════════════════════════════════
  // Phase 19: Git Operations
  // ═══════════════════════════════════════════════════════════════

  "republic.git.clone": ({ params, respond }) => {
    const p = params as
      | { url?: string; targetDir?: string; branch?: string; depth?: number }
      | undefined;
    if (!p?.url || !p?.targetDir) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "url and targetDir required"),
      );
      return;
    }
    try {
      const result = cloneRepo(p.url, p.targetDir, { branch: p.branch, depth: p.depth });
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.git.fork": ({ params, respond }) => {
    const p = params as { sourceDir?: string; targetDir?: string; message?: string } | undefined;
    if (!p?.sourceDir || !p?.targetDir) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "sourceDir and targetDir required"),
      );
      return;
    }
    try {
      const result = forkRepo(p.sourceDir, p.targetDir, p.message);
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.git.branch.create": ({ params, respond }) => {
    const p = params as { repoDir?: string; branchName?: string } | undefined;
    if (!p?.repoDir || !p?.branchName) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "repoDir and branchName required"),
      );
      return;
    }
    try {
      createBranch(p.repoDir, p.branchName);
      respond(true, { ok: true }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.git.branch.list": ({ params, respond }) => {
    const p = params as { repoDir?: string } | undefined;
    if (!p?.repoDir) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "repoDir required"));
      return;
    }
    try {
      const branches = listBranches(p.repoDir);
      respond(true, { ok: true, branches }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.git.commit": ({ params, respond }) => {
    const p = params as
      | {
          repoDir?: string;
          message?: string;
          files?: string[];
          authorName?: string;
          authorEmail?: string;
        }
      | undefined;
    if (!p?.repoDir || !p?.message) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "repoDir and message required"),
      );
      return;
    }
    try {
      const opts =
        p.authorName && p.authorEmail
          ? { authorName: p.authorName, authorEmail: p.authorEmail }
          : undefined;
      const result = commitChanges(p.repoDir, p.message, p.files, opts);
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.git.push": ({ params, respond }) => {
    const p = params as { repoDir?: string; remote?: string; branch?: string } | undefined;
    if (!p?.repoDir || !p?.remote || !p?.branch) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "repoDir, remote, and branch required"),
      );
      return;
    }
    try {
      pushBranch(p.repoDir, p.remote, p.branch);
      respond(true, { ok: true }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.git.diff": ({ params, respond }) => {
    const p = params as { repoDir?: string; base?: string; head?: string } | undefined;
    if (!p?.repoDir || !p?.base || !p?.head) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "repoDir, base, and head required"),
      );
      return;
    }
    try {
      const diff = diffBranches(p.repoDir, p.base, p.head);
      respond(true, { ok: true, diff }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.git.status": ({ params, respond }) => {
    const p = params as { repoDir?: string } | undefined;
    if (!p?.repoDir) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "repoDir required"));
      return;
    }
    try {
      const status = repoStatus(p.repoDir);
      respond(true, { ok: true, status }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.git.clone-self": ({ params, respond }) => {
    const p = params as { targetDir?: string } | undefined;
    if (!p?.targetDir) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "targetDir required"));
      return;
    }
    try {
      const result = cloneSelf(p.targetDir);
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.git.log": ({ params, respond }) => {
    const p = params as { repoDir?: string; limit?: number } | undefined;
    if (!p?.repoDir) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "repoDir required"));
      return;
    }
    try {
      const log = getCommitLog(p.repoDir, p.limit ?? 20);
      respond(true, { ok: true, log }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.git.diagnostics": ({ respond }) => {
    respond(true, gitOperationsDiagnostics(), undefined);
  },

  // ═══════════════════════════════════════════════════════════════
  // Phase 20: Code Intelligence
  // ═══════════════════════════════════════════════════════════════

  "republic.code.analyze": ({ params, respond }) => {
    const p = params as { filePath?: string } | undefined;
    if (!p?.filePath) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "filePath required"));
      return;
    }
    try {
      const analysis = analyzeModule(p.filePath);
      respond(true, { ok: true, analysis }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.code.diagnose": ({ params, respond }) => {
    const p = params as { filePath?: string } | undefined;
    if (!p?.filePath) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "filePath required"));
      return;
    }
    try {
      const issues = diagnoseCodeIssues(p.filePath);
      respond(true, { ok: true, issues }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.code.fix": ({ params, respond }) => {
    const p = params as
      | {
          issue?: {
            id: string;
            filePath: string;
            severity: string;
            category: string;
            description: string;
            line?: number;
          };
        }
      | undefined;
    if (!p?.issue) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "issue object required"));
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch = generateCodeFix(p.issue as any);
      respond(true, { ok: true, patch }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.code.review": ({ params, respond }) => {
    const p = params as
      | { diff?: string; maxComplexity?: number; requireTests?: boolean; requireDocs?: boolean }
      | undefined;
    if (!p?.diff) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "diff required"));
      return;
    }
    try {
      const criteria = {
        maxComplexity: p.maxComplexity,
        requireTests: p.requireTests,
        requireDocs: p.requireDocs,
      };
      const review = reviewCodeDiff(p.diff, criteria);
      respond(true, { ok: true, review }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.code.council": ({ params, respond }) => {
    const p = params as
      | { proposalId?: string; diff?: string; description?: string; citizenCount?: number }
      | undefined;
    if (!p?.proposalId || !p?.diff) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "proposalId and diff required"),
      );
      return;
    }
    try {
      const proposal = { id: p.proposalId, diff: p.diff, description: p.description ?? "" };
      const result = councilReview(proposal, p.citizenCount ?? 3);
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.code.plan": ({ params, respond }) => {
    const p = params as { filePaths?: string[]; objective?: string } | undefined;
    if (!p?.filePaths || p.filePaths.length === 0) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "filePaths array required"));
      return;
    }
    try {
      const analyses = p.filePaths
        .map((fp) => analyzeModule(fp))
        .filter((a): a is NonNullable<typeof a> => a !== null);
      const plan = createImprovementPlan(analyses, p.objective);
      respond(true, { ok: true, plan }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.code.diagnostics": ({ respond }) => {
    respond(true, codeIntelligenceDiagnostics(), undefined);
  },

  // ═══════════════════════════════════════════════════════════════
  // Phase 21: Autonomous CI/CD
  // ═══════════════════════════════════════════════════════════════

  "republic.cicd.pipeline": async ({ params, respond }) => {
    const p = params as { repoDir?: string; stages?: string; triggeredBy?: string } | undefined;
    if (!p?.repoDir) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "repoDir required"));
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stages = p.stages?.split(",").map((s: any) => s.trim()) as any;
      const pipeline = await createPipeline(p.repoDir, stages, p.triggeredBy);
      respond(true, { ok: true, pipeline }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.cicd.build": async ({ params, respond }) => {
    const p = params as { repoDir?: string; production?: boolean } | undefined;
    if (!p?.repoDir) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "repoDir required"));
      return;
    }
    try {
      const result = await buildProject(p.repoDir, { production: p.production });
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.cicd.test": async ({ params, respond }) => {
    const p = params as { repoDir?: string; pattern?: string } | undefined;
    if (!p?.repoDir) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "repoDir required"));
      return;
    }
    try {
      const result = await runTests(p.repoDir, p.pattern);
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.cicd.deploy": ({ params, respond }) => {
    const p = params as { repoDir?: string; environment?: string; version?: string } | undefined;
    if (!p?.repoDir || !p?.environment) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "repoDir and environment required"),
      );
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deployment = deployToEnvironment(p.repoDir as any, p.environment as any, p.version as any);
      respond(true, { ok: true, deployment }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.cicd.canary": ({ params, respond }) => {
    const p = params as { repoDir?: string; trafficPct?: number } | undefined;
    if (!p?.repoDir || p?.trafficPct === undefined) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "repoDir and trafficPct required"),
      );
      return;
    }
    try {
      const deployment = canaryDeploy(p.repoDir, p.trafficPct);
      respond(true, { ok: true, deployment }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.cicd.rollback": ({ params, respond }) => {
    const p = params as { deploymentId?: string } | undefined;
    if (!p?.deploymentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "deploymentId required"));
      return;
    }
    const result = rollback(p.deploymentId);
    respond(
      result.ok,
      result.ok ? { ok: true, deployment: result.newDeployment } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.NOT_FOUND, result.error ?? "Rollback failed"),
    );
  },

  "republic.cicd.approve": ({ params, respond }) => {
    const p = params as { pipelineId?: string } | undefined;
    if (!p?.pipelineId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "pipelineId required"));
      return;
    }
    const result = autoApprove(p.pipelineId);
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.cicd.monitor": ({ params, respond }) => {
    const p = params as { deploymentId?: string } | undefined;
    if (!p?.deploymentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "deploymentId required"));
      return;
    }
    const result = monitorDeployment(p.deploymentId);
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.cicd.history": ({ respond }) => {
    respond(true, { ok: true, deployments: deploymentHistory() }, undefined);
  },

  "republic.cicd.diagnostics": ({ respond }) => {
    respond(true, cicdDiagnostics(), undefined);
  },

  // ═══════════════════════════════════════════════════════════════
  // Phase 22: Self-Diagnostics & Healing
  // ═══════════════════════════════════════════════════════════════

  "republic.diag.scan": ({ respond }) => {
    try {
      const snapshot = fullSystemScan();
      respond(true, { ok: true, snapshot }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.diag.diagnose": ({ params, respond }) => {
    const p = params as { snapshotData?: unknown } | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const snapshot = p?.snapshotData as any ?? fullSystemScan();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const diagnoses = diagnoseAnomalies(snapshot as any);
      respond(true, { ok: true, diagnoses }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.diag.prescribe": ({ params, respond }) => {
    const p = params as { diagnosisId?: string; diagnosis?: unknown } | undefined;
    if (!p?.diagnosis) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "diagnosis object required"),
      );
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prescription = prescribeHealing(p.diagnosis as any);
      respond(true, { ok: true, prescription }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.diag.heal": ({ params, respond }) => {
    const p = params as { prescriptionId?: string } | undefined;
    if (!p?.prescriptionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "prescriptionId required"));
      return;
    }
    try {
      const result = executeHealing(p.prescriptionId);
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.diag.autoheal": ({ respond }) => {
    try {
      const result = autoHealCycle();
      respond(true, { ok: true, ...result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.diag.diagnostics": ({ respond }) => {
    respond(true, selfDiagnosticsSummary(), undefined);
  },

  // ═══════════════════════════════════════════════════════════════
  // Phase 23: Quantum-Entangled State Replication
  // ═══════════════════════════════════════════════════════════════

  "republic.quantum.entangle": ({ params, respond }) => {
    const p = params as { instanceA?: string; instanceB?: string; channel?: string } | undefined;
    if (!p?.instanceA || !p?.instanceB || !p?.channel) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "instanceA, instanceB, and channel required"),
      );
      return;
    }
    try {
      const pair = entangle(p.instanceA, p.instanceB, p.channel);
      respond(true, { ok: true, pair }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.quantum.decohere": ({ params, respond }) => {
    const p = params as { pairId?: string } | undefined;
    if (!p?.pairId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "pairId required"));
      return;
    }
    const ok = decohere(p.pairId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Pair not found"),
    );
  },

  "republic.quantum.propagate": ({ params, respond }) => {
    const p = params as
      | { pairId?: string; fromInstance?: string; stateUpdate?: Record<string, unknown> }
      | undefined;
    if (!p?.pairId || !p?.fromInstance || !p?.stateUpdate) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "pairId, fromInstance, and stateUpdate required"),
      );
      return;
    }
    try {
      const result = propagateState(p.pairId, p.fromInstance, p.stateUpdate);
      respond(
        result.success,
        result.success ? { ok: true, result } : undefined,
        result.success
          ? undefined
          : errorShape(ErrorCodes.INTERNAL_ERROR, result.error ?? "Propagation failed"),
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.quantum.collapse": ({ params, respond }) => {
    const p = params as { pairId?: string; strategy?: string } | undefined;
    if (!p?.pairId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "pairId required"));
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = collapseState(p.pairId, (p.strategy as any) ?? "latest-wins");
      respond(
        result !== null,
        result ? { ok: true, result } : undefined,
        result ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Pair not found"),
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.quantum.teleport": ({ params, respond }) => {
    const p = params as
      | { sourceInstance?: string; targetInstance?: string; state?: Record<string, unknown> }
      | undefined;
    if (!p?.sourceInstance || !p?.targetInstance || !p?.state) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "sourceInstance, targetInstance, and state required",
        ),
      );
      return;
    }
    try {
      const result = teleportState(p.sourceInstance, p.targetInstance, p.state);
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.quantum.swarm.create": ({ params, respond }) => {
    const p = params as { swarmId?: string; leader?: string; followers?: string[] } | undefined;
    if (!p?.swarmId || !p?.leader) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "swarmId and leader required"),
      );
      return;
    }
    try {
      const swarm = createSwarm(p.swarmId, p.leader, p.followers ?? []);
      respond(true, { ok: true, swarm }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.quantum.swarm.broadcast": ({ params, respond }) => {
    const p = params as { swarmId?: string; state?: Record<string, unknown> } | undefined;
    if (!p?.swarmId || !p?.state) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "swarmId and state required"),
      );
      return;
    }
    const result = swarmBroadcast(p.swarmId, p.state);
    respond(
      result.success,
      result.success ? { ok: true, nodesUpdated: result.nodesUpdated } : undefined,
      result.success
        ? undefined
        : errorShape(ErrorCodes.NOT_FOUND, result.error ?? "Broadcast failed"),
    );
  },

  "republic.quantum.pairs": ({ respond }) => {
    respond(true, { ok: true, pairs: listEntangledPairs() }, undefined);
  },

  "republic.quantum.diagnostics": ({ respond }) => {
    respond(true, quantumSyncDiagnostics(), undefined);
  },

  // ═══════════════════════════════════════════════════════════════
  // Phase 24: Mitosis Controller
  // ═══════════════════════════════════════════════════════════════

  "republic.mitosis.initiate": ({ params, respond }) => {
    const p = params as { parentInstance?: string } | undefined;
    if (!p?.parentInstance) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "parentInstance required"));
      return;
    }
    try {
      const process = initiateMitosis(p.parentInstance);
      respond(true, { ok: true, process }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.mitosis.full": ({ params, respond }) => {
    const p = params as
      | {
          parentInstance?: string;
          config?: Record<string, unknown>;
          state?: Record<string, unknown>;
        }
      | undefined;
    if (!p?.parentInstance) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "parentInstance required"));
      return;
    }
    try {
      const result = fullMitosis(p.parentInstance, p.config ?? {}, p.state ?? {});
      respond(true, { ok: true, ...result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.mitosis.dna.capture": ({ params, respond }) => {
    const p = params as
      | {
          instanceId?: string;
          config?: Record<string, unknown>;
          state?: Record<string, unknown>;
        }
      | undefined;
    if (!p?.instanceId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "instanceId required"));
      return;
    }
    try {
      const dna = captureDNA(p.instanceId, p.config ?? {}, p.state ?? {});
      respond(true, { ok: true, dna }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.mitosis.instance": ({ params, respond }) => {
    const p = params as { instanceId?: string } | undefined;
    if (!p?.instanceId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "instanceId required"));
      return;
    }
    const info = getInstanceInfo(p.instanceId);
    respond(
      info !== null,
      info ? { ok: true, instance: info } : undefined,
      info ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Instance not found"),
    );
  },

  "republic.mitosis.instances": ({ respond }) => {
    respond(true, { ok: true, instances: listInstances() }, undefined);
  },

  "republic.mitosis.promote": ({ params, respond }) => {
    const p = params as { instanceId?: string } | undefined;
    if (!p?.instanceId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "instanceId required"));
      return;
    }
    const ok = promoteInstance(p.instanceId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Instance not found"),
    );
  },

  "republic.mitosis.decommission": ({ params, respond }) => {
    const p = params as { instanceId?: string } | undefined;
    if (!p?.instanceId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "instanceId required"));
      return;
    }
    const ok = decommissionInstance(p.instanceId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Instance not found"),
    );
  },

  "republic.mitosis.lineage": ({ params, respond }) => {
    const p = params as { instanceId?: string } | undefined;
    if (!p?.instanceId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "instanceId required"));
      return;
    }
    const lineage = getLineage(p.instanceId);
    respond(true, { ok: true, lineage }, undefined);
  },

  "republic.mitosis.diagnostics": ({ respond }) => {
    respond(true, mitosisDiagnostics(), undefined);
  },

  // ═══════════════════════════════════════════════════════════════
  // Autonomy Health Dashboard (Aggregated)
  // ═══════════════════════════════════════════════════════════════

  "republic.health.autonomy": ({ respond }) => {
    try {
      const health = {
        git: gitOperationsDiagnostics(),
        codeIntel: codeIntelligenceDiagnostics(),
        cicd: cicdDiagnostics(),
        diagnostics: selfDiagnosticsSummary(),
        quantumSync: quantumSyncDiagnostics(),
        mitosis: mitosisDiagnostics(),
        umie: umieDiagnostics(),
      };
      respond(true, { ok: true, health }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INTERNAL_ERROR,
          `Autonomy health aggregation failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // Phase 25: Universal Model Intelligence Engine (UMIE)
  // ═══════════════════════════════════════════════════════════════

  "republic.model.register": ({ params, respond }) => {
    const p = params as
      | {
          name?: string;
          paradigm?: string;
          provider?: string;
          capabilities?: string[];
          contextWindow?: number;
          metadata?: Record<string, unknown>;
        }
      | undefined;
    if (!p?.name || !p?.paradigm || !p?.provider) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "name, paradigm, and provider required"),
      );
      return;
    }
    try {
      const model = registerModel({
        name: p.name,
        paradigm: p.paradigm as ModelParadigm,
        provider: p.provider,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        capabilities: (p.capabilities ?? ["completion"]) as any,
        inputModalities: ["text"],
        outputModalities: ["text"],
        latencyProfile: "standard",
        status: "online",
        metadata: p.metadata ?? {},
        contextWindow: p.contextWindow,
      });
      respond(true, { ok: true, model }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.model.deregister": ({ params, respond }) => {
    const p = params as { modelId?: string } | undefined;
    if (!p?.modelId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "modelId required"));
      return;
    }
    const removed = deregisterModel(p.modelId);
    respond(true, { ok: removed }, undefined);
  },

  "republic.model.infer": ({ params, respond }) => {
    const p = params as
      | {
          modelId?: string;
          input?: string;
          images?: string[];
          temperature?: number;
          maxTokens?: number;
        }
      | undefined;
    if (!p?.modelId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "modelId required"));
      return;
    }
    try {
      const result = infer({
        modelId: p.modelId,
        input: { text: p.input ?? "", images: p.images },
        params: { temperature: p.temperature, maxTokens: p.maxTokens },
      });
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.model.recursive": ({ params, respond }) => {
    const p = params as
      | { modelId?: string; input?: string; maxDepth?: number; convergenceThreshold?: number }
      | undefined;
    if (!p?.modelId || !p?.input) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "modelId and input required"),
      );
      return;
    }
    try {
      const result = recursiveInfer(p.modelId, p.input, {
        maxDepth: p.maxDepth,
        convergenceThreshold: p.convergenceThreshold,
      });
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.model.pipeline.create": ({ params, respond }) => {
    const p = params as
      | {
          name?: string;
          steps?: { modelId: string; outputKey: string; inputMapping?: Record<string, string> }[];
        }
      | undefined;
    if (!p?.name || !p?.steps?.length) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name and steps required"));
      return;
    }
    try {
      const pipeline = createModelPipeline(p.name, p.steps);
      respond(true, { ok: true, pipeline }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.model.pipeline.execute": ({ params, respond }) => {
    const p = params as { pipelineId?: string; input?: string } | undefined;
    if (!p?.pipelineId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "pipelineId required"));
      return;
    }
    try {
      const result = executeModelPipeline(p.pipelineId, { text: p.input ?? "" });
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.model.list": ({ params, respond }) => {
    const p = params as { paradigm?: string; provider?: string } | undefined;
    const models = listModels({
      paradigm: p?.paradigm as ModelParadigm | undefined,
      provider: p?.provider,
    });
    respond(true, { ok: true, models, pipelines: listModelPipelines() }, undefined);
  },

  "republic.model.get": ({ params, respond }) => {
    const p = params as { modelId?: string } | undefined;
    if (!p?.modelId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "modelId required"));
      return;
    }
    const model = getModel(p.modelId);
    if (!model) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Model not found: ${p.modelId}`),
      );
      return;
    }
    respond(true, { ok: true, model }, undefined);
  },

  "republic.model.diagnostics": ({ respond }) => {
    respond(true, umieDiagnostics(), undefined);
  },

  // ─── Phase 26: PersonaPlex Voice Persona Engine ──────────────

  "republic.persona.connect": ({ params, respond }) => {
    try {
      const p = params as { host?: string; port?: number } | undefined;
      const status = ppConnect(p ? { host: p.host, port: p.port } : undefined);
      respond(true, { ok: true, status }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.persona.disconnect": ({ respond }) => {
    ppDisconnect();
    respond(true, { ok: true }, undefined);
  },

  "republic.persona.create": ({ params, respond }) => {
    const p = params as
      | {
          name?: string;
          voicePrompt?: string;
          textPrompt?: string;
          /** Alias for textPrompt — accepted from the UI form */
          prompt?: string;
          style?: PersonaStyle;
          language?: string;
        }
      | undefined;
    const textPrompt = p?.textPrompt ?? p?.prompt ?? "";
    if (!p?.name || !textPrompt) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "name and a system prompt are required"),
      );
      return;
    }
    const persona = createPersona({
      name: p.name,
      voicePrompt: p.voicePrompt ?? "",
      textPrompt,
      style: p.style,
      language: p.language,
    });
    respond(true, { ok: true, persona }, undefined);
  },

  "republic.persona.delete": ({ params, respond }) => {
    const p = params as { personaId?: string } | undefined;
    if (!p?.personaId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "personaId required"));
      return;
    }
    const deleted = deletePersona(p.personaId);
    respond(true, { ok: true, deleted }, undefined);
  },

  "republic.persona.list": ({ respond }) => {
    respond(true, { ok: true, personas: listPersonas() }, undefined);
  },

  "republic.persona.activate": ({ params, respond }) => {
    const p = params as { personaId?: string } | undefined;
    if (!p?.personaId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "personaId required"));
      return;
    }
    const persona = setActivePersona(p.personaId);
    if (!persona) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Persona not found: ${p.personaId}`),
      );
      return;
    }
    respond(true, { ok: true, persona }, undefined);
  },

  "republic.persona.chat": ({ params, respond }) => {
    const p = params as { text?: string; personaId?: string } | undefined;
    if (!p?.text) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "text required"));
      return;
    }
    try {
      const conv = startConversation({ personaId: p.personaId });
      const response = sendTextMessage(conv.id, p.text);
      endConversation(conv.id);
      respond(true, { ok: true, response, conversationId: conv.id }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.persona.status": ({ respond }) => {
    respond(
      true,
      {
        ok: true,
        conversations: listConversations(),
        diagnostics: personaplexDiagnostics(),
      },
      undefined,
    );
  },

  "republic.persona.diagnostics": ({ respond }) => {
    respond(true, personaplexDiagnostics(), undefined);
  },

  // ─── Phase 27: Gateway Lifecycle & Resource Management ───────

  "republic.lifecycle.boot_metrics": ({ respond }) => {
    respond(true, getBootMetrics(), undefined);
  },

  "republic.lifecycle.handler_load": ({ params, respond }) => {
    const p = params as { domain?: string } | undefined;
    if (!p?.domain) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "domain required"));
      return;
    }
    const entry = loadHandler(p.domain);
    if (!entry) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Handler not found: ${p.domain}`),
      );
      return;
    }
    respond(true, { ok: true, handler: entry }, undefined);
  },

  "republic.lifecycle.handlers": ({ respond }) => {
    respond(true, { ok: true, handlers: listHandlersAll() }, undefined);
  },

  "republic.lifecycle.circuit_breakers": ({ respond }) => {
    respond(true, { ok: true, circuitBreakers: listAllCircuitBreakers() }, undefined);
  },

  "republic.lifecycle.resources": ({ respond }) => {
    respond(true, takeSnapshot(), undefined);
  },

  "republic.lifecycle.diagnostics": ({ respond }) => {
    respond(true, lcDiagnostics(), undefined);
  },

  // ─── Phase 28: Vector DB Orchestration ──────────────────────────

  "republic.vectordb.cluster.create": ({ params, respond }) => {
    const p = params as { name?: string; type?: string; mode?: string } | undefined;
    if (!p?.name || !p?.type) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name and type required"));
      return;
    }
    const cluster = vdbCreateCluster({
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      type: p.type as any,
      name: p.name,
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      mode: (p.mode ?? "embedded") as any,
      connection: {},
    });
    respond(true, { ok: true, cluster }, undefined);
  },

  "republic.vectordb.cluster.list": ({ respond }) => {
    respond(true, { ok: true, clusters: vdbListClusters() }, undefined);
  },

  "republic.vectordb.cluster.stop": ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    respond(true, { ok: vdbStopCluster(p.id) }, undefined);
  },

  "republic.vectordb.cluster.delete": ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    respond(true, { ok: vdbDeleteCluster(p.id) }, undefined);
  },

  "republic.vectordb.collection.create": ({ params, respond }) => {
    const p = params as { clusterId?: string; name?: string; embeddingDim?: number } | undefined;
    if (!p?.clusterId || !p?.name) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "clusterId and name required"),
      );
      return;
    }
    const col = vdbCreateCollection({
      clusterId: p.clusterId,
      name: p.name,
      embeddingDim: p.embeddingDim,
    });
    if (!col) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "Collection creation failed"),
      );
      return;
    }
    respond(true, { ok: true, collection: col }, undefined);
  },

  "republic.vectordb.collection.list": ({ params, respond }) => {
    const p = params as { clusterId?: string } | undefined;
    if (!p?.clusterId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "clusterId required"));
      return;
    }
    respond(true, { ok: true, collections: vdbListCollections(p.clusterId) }, undefined);
  },

  "republic.vectordb.collection.drop": ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    respond(true, { ok: vdbDropCollection(p.id) }, undefined);
  },

  "republic.vectordb.insert": ({ params, respond }) => {
    const p = params as { collectionId?: string; documents?: unknown[] } | undefined;
    if (!p?.collectionId || !p?.documents) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "collectionId and documents required"),
      );
      return;
    }
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    const docs = vdbInsertDocs(p.collectionId, p.documents as any);
    respond(true, { ok: true, inserted: docs.length }, undefined);
  },

  "republic.vectordb.query": ({ params, respond }) => {
    const p = params as
      | {
          collectionId?: string;
          vector?: number[];
          topK?: number;
          filter?: Record<string, unknown>;
        }
      | undefined;
    if (!p?.collectionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "collectionId required"));
      return;
    }
    const result = vdbQuery({
      collectionId: p.collectionId,
      vector: p.vector,
      topK: p.topK ?? 5,
      filter: p.filter,
    });
    respond(true, result, undefined);
  },

  "republic.vectordb.diagnostics": ({ respond }) => {
    respond(true, vdbDiagnostics(), undefined);
  },

  // ─── Phase 29: Living Avatar Engine ─────────────────────────────

  "republic.avatar.session.create": ({ params, respond }) => {
    const p = params as { userId?: string; personality?: Record<string, number> } | undefined;
    if (!p?.userId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "userId required"));
      return;
    }
    const session = avCreateSession(p.userId, p.personality);
    respond(true, { ok: true, session }, undefined);
  },

  "republic.avatar.session.list": ({ respond }) => {
    respond(true, { ok: true, sessions: avListSessions() }, undefined);
  },

  "republic.avatar.session.end": ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    respond(true, { ok: avEndSession(p.id) }, undefined);
  },

  "republic.avatar.listen": ({ params, respond }) => {
    const p = params as { sessionId?: string; text?: string } | undefined;
    if (!p?.sessionId || !p?.text) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "sessionId and text required"),
      );
      return;
    }
    const result = avListen(p.sessionId, p.text);
    if (!result) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Session not found"));
      return;
    }
    respond(true, result, undefined);
  },

  "republic.avatar.speak": ({ params, respond }) => {
    const p = params as { sessionId?: string; text?: string } | undefined;
    if (!p?.sessionId || !p?.text) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "sessionId and text required"),
      );
      return;
    }
    const result = avListen(p.sessionId, p.text);
    if (!result) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Session not found"));
      return;
    }
    respond(
      true,
      {
        ok: true,
        response: result.response,
        emotion: result.emotion,
        intent: result.command.intent,
        visemes: result.visemes,
        faceState: {
          emotion: result.avatarState.emotion,
          blendshapes: result.avatarState.blendshapes,
          viseme: result.avatarState.currentViseme,
          confidence: result.command.confidence,
        },
      },
      undefined,
    );
  },

  "republic.avatar.start_listening": ({ params, respond }) => {
    const p = params as { sessionId?: string } | undefined;
    if (!p?.sessionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionId required"));
      return;
    }
    const state = avStartListening(p.sessionId);
    if (!state) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Session not found"));
      return;
    }
    respond(true, { ok: true, state }, undefined);
  },

  "republic.avatar.state": ({ params, respond }) => {
    const p = params as { sessionId?: string } | undefined;
    if (!p?.sessionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionId required"));
      return;
    }
    const state = avGetState(p.sessionId);
    if (!state) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Session not found"));
      return;
    }
    respond(true, state, undefined);
  },

  "republic.avatar.personality": ({ params, respond }) => {
    const p = params as { traits?: Record<string, number> } | undefined;
    if (p?.traits) {
      avSetPersonality(p.traits);
    }
    respond(true, { ok: true, personality: avGetPersonality() }, undefined);
  },

  "republic.avatar.diagnostics": ({ respond }) => {
    respond(true, avDiagnostics(), undefined);
  },

  // ─── Phase 30: System Pulse ─────────────────────────────────────

  "republic.pulse.take": ({ respond }) => {
    const snapshot = spTakePulse();
    respond(true, snapshot, undefined);
  },

  "republic.pulse.start": ({ params, respond }) => {
    const p = params as { interval?: number; registerDefaults?: boolean } | undefined;
    if (p?.registerDefaults !== false) {
      spRegisterDefaults();
    }
    respond(true, { ok: spStartPulse(p?.interval) }, undefined);
  },

  "republic.pulse.stop": ({ respond }) => {
    respond(true, { ok: spStopPulse() }, undefined);
  },

  "republic.pulse.latest": ({ respond }) => {
    const latest = spGetLatest();
    respond(true, latest ?? { empty: true }, undefined);
  },

  "republic.pulse.history": ({ params, respond }) => {
    const p = params as { windowMs?: number } | undefined;
    respond(true, spGetHistory(p?.windowMs), undefined);
  },

  "republic.pulse.alerts": ({ respond }) => {
    respond(true, { alerts: spGetAlerts() }, undefined);
  },

  "republic.pulse.resolve_alert": ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    respond(true, { ok: spResolveAlert(p.id) }, undefined);
  },

  "republic.pulse.diagnostics": ({ respond }) => {
    respond(true, spDiagnostics(), undefined);
  },

  // ─── Phase 30: n8n Dashboard ────────────────────────────────────

  "republic.n8n.executions": async ({ params, respond }) => {
    const p = params as { limit?: number; status?: "success" | "error" | "waiting" } | undefined;
    const bridge = getN8nBridge();
    const executions = await bridge.getExecutionHistory(p);
    respond(true, { ok: true, executions }, undefined);
  },

  "republic.n8n.stats": async ({ respond }) => {
    const bridge = getN8nBridge();
    const stats = await bridge.getWorkflowStats();
    respond(true, stats, undefined);
  },

  "republic.n8n.create_workflow": async ({ params, respond }) => {
    const p = params as { name?: string; nodes?: unknown[]; active?: boolean } | undefined;
    if (!p?.name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name required"));
      return;
    }
    const bridge = getN8nBridge();
    const wf = await bridge.createWorkflow({ name: p.name, nodes: p.nodes, active: p.active });
    if (!wf) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Workflow creation failed"));
      return;
    }
    respond(true, { ok: true, workflow: wf }, undefined);
  },

  "republic.n8n.delete_workflow": async ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const bridge = getN8nBridge();
    const ok = await bridge.deleteWorkflow(p.id);
    respond(true, { ok }, undefined);
  },
};
