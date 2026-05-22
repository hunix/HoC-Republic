/**
 * Republic Platform — Dynamic Compute Scaling Engine
 *
 * Phase 36: Citizens and modules can request compute resources.
 * The engine uses ML heuristics to approve/deny/queue requests
 * and auto-provisions the necessary infrastructure.
 *
 * Pipeline: Request → Admission → Queue → Provision → Grant
 *
 * - Resource requests with typed schemas for model + task
 * - ML-based admission controller with priority scoring
 * - Auto-provisioning: download model, start runtime, load, serve
 * - Priority queue for requests that can't be served immediately
 * - Per-citizen and per-model usage tracking for cost accounting
 */

import { emitNationalEvent } from "./event-sourcing.js";
import { getRuntimeStatus, probeSystemResources, startRuntime } from "./infra-control-plane.js";
import {
    autoSelectModel, getInstalledModels, provisionModel, type GGUFModelEntry
} from "./model-provisioner.js";
import { uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface ComputeRequest {
  id: string;
  citizenId: string;
  citizenName?: string;
  /** What the compute is for */
  task: {
    type: "inference" | "embedding" | "code-generation" | "reasoning" | "image-gen" | "tool-use";
    description: string;
    /** Estimated complexity 0–1 */
    complexity: number;
  };
  /** Preferred model (or null for auto-select) */
  preferredModel?: string;
  /** Quality vs speed preference */
  preference: "quality" | "speed" | "balanced";
  /** Priority: 0 = lowest, 10 = highest */
  priority: number;
  requestedAt: string;
  status: "pending" | "queued" | "provisioning" | "granted" | "denied" | "expired";
  grantedAt?: string;
  deniedAt?: string;
  deniedReason?: string;
  expiresAt?: string;
}

export interface ComputeGrant {
  requestId: string;
  citizenId: string;
  model: string;
  provider: string;
  endpoint: string;
  /** Token budget for this grant */
  tokenBudget: number;
  /** How long this grant is valid (ms) */
  ttlMs: number;
  grantedAt: string;
  expiresAt: string;
}

export interface UsageRecord {
  citizenId: string;
  model: string;
  provider: string;
  tokensUsed: number;
  requestCount: number;
  totalLatencyMs: number;
  lastUsedAt: string;
  /** Estimated cost (normalized units) */
  estimatedCost: number;
}

// ─── State ──────────────────────────────────────────────────────

const pendingRequests: ComputeRequest[] = [];
const activeGrants = new Map<string, ComputeGrant>();
const usageRecords = new Map<string, UsageRecord>(); // key: `${citizenId}:${model}`
const grantHistory: Array<{
  requestId: string;
  citizenId: string;
  model: string;
  grantedAt: string;
}> = [];

/** Max concurrent inference grants (tuned for RTX 6000 Pro 96GB + 128GB DDR5) */
const MAX_CONCURRENT_GRANTS = 24;

/** Default token budget per grant (increased for high-VRAM hardware) */
const DEFAULT_TOKEN_BUDGET = 8192;

/** Default TTL per grant (5 minutes) */
const DEFAULT_GRANT_TTL_MS = 5 * 60 * 1000;

/** Maximum queue depth */
const MAX_QUEUE_DEPTH = 100;

// ─── Admission Controller ───────────────────────────────────────

/**
 * Score a resource request for admission priority.
 * Returns a score 0–100 where higher is more likely to be admitted.
 *
 * Factors:
 * - Task complexity (higher complexity → deserves more powerful model)
 * - Citizen priority level
 * - Resource availability
 * - Historical usage (rate limiting)
 * - Task type criticality
 */
function scoreRequest(request: ComputeRequest): number {
  let score = 50; // base

  // Task complexity (0–20 points)
  score += request.task.complexity * 20;

  // Citizen priority (0–30 points)
  score += (request.priority / 10) * 30;

  // Task type criticality bonus
  const criticalityBonus: Record<string, number> = {
    reasoning: 10,
    "tool-use": 8,
    "code-generation": 6,
    inference: 4,
    embedding: 2,
    "image-gen": 2,
  };
  score += criticalityBonus[request.task.type] ?? 0;

  // Rate limiting penalty: reduce score if citizen has heavy recent usage
  const recentUsage = getUsageForCitizen(request.citizenId);
  if (recentUsage) {
    const usageIntensity = recentUsage.requestCount / 100; // normalize
    score -= Math.min(15, usageIntensity * 15); // up to -15 penalty
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Decide whether to admit, queue, or deny a request.
 */
function admissionDecision(request: ComputeRequest, score: number): "grant" | "queue" | "deny" {
  // Always deny if score too low
  if (score < 15) {return "deny";}

  // Check capacity
  if (activeGrants.size >= MAX_CONCURRENT_GRANTS) {
    // Queue if score is decent
    return score >= 30 ? "queue" : "deny";
  }

  // Grant threshold
  return score >= 25 ? "grant" : "queue";
}

// ─── Request Handling ───────────────────────────────────────────

/**
 * Submit a compute resource request.
 * Returns a ComputeGrant if immediately provisioned, or the request for tracking.
 */
export async function requestCompute(
  citizenId: string,
  params: {
    task: ComputeRequest["task"];
    preferredModel?: string;
    preference?: ComputeRequest["preference"];
    priority?: number;
    citizenName?: string;
  },
): Promise<{ grant?: ComputeGrant; request: ComputeRequest; decision: string }> {
  const request: ComputeRequest = {
    id: uid(),
    citizenId,
    citizenName: params.citizenName,
    task: params.task,
    preferredModel: params.preferredModel,
    preference: params.preference ?? "balanced",
    priority: params.priority ?? 5,
    requestedAt: new Date().toISOString(),
    status: "pending",
  };

  emitNationalEvent("technology", "compute_requested", "compute-scaler", {
    requestId: request.id,
    citizenId,
    taskType: request.task.type,
    complexity: request.task.complexity,
  });

  // Score and decide
  const score = scoreRequest(request);
  const decision = admissionDecision(request, score);

  if (decision === "deny") {
    request.status = "denied";
    request.deniedAt = new Date().toISOString();
    request.deniedReason =
      score < 15
        ? "Request priority too low"
        : "System at capacity, request score insufficient for queueing";

    emitNationalEvent("technology", "compute_denied", "compute-scaler", {
      requestId: request.id,
      citizenId,
      reason: request.deniedReason,
      score,
    });

    return { request, decision: "denied" };
  }

  if (decision === "queue") {
    request.status = "queued";

    // Enforce queue depth
    if (pendingRequests.length >= MAX_QUEUE_DEPTH) {
      // Evict lowest priority
      pendingRequests.sort((a, b) => scoreRequest(b) - scoreRequest(a));
      pendingRequests.pop();
    }

    pendingRequests.push(request);
    pendingRequests.sort((a, b) => scoreRequest(b) - scoreRequest(a));

    emitNationalEvent("technology", "compute_queued", "compute-scaler", {
      requestId: request.id,
      citizenId,
      queuePosition: pendingRequests.indexOf(request) + 1,
      queueDepth: pendingRequests.length,
    });

    return { request, decision: "queued" };
  }

  // Decision: grant — try to provision
  request.status = "provisioning";
  const grant = await provisionForRequest(request);

  if (grant) {
    request.status = "granted";
    request.grantedAt = new Date().toISOString();
    return { grant, request, decision: "granted" };
  }

  // Provisioning failed — queue instead
  request.status = "queued";
  pendingRequests.push(request);
  return { request, decision: "queued (provisioning failed, retrying later)" };
}

/**
 * Provision compute resources for a specific request.
 */
async function provisionForRequest(request: ComputeRequest): Promise<ComputeGrant | null> {
  try {
    const resources = await probeSystemResources();

    // Map task type to model capabilities
    const capMap: Record<string, GGUFModelEntry["capabilities"]> = {
      inference: ["chat"],
      embedding: ["chat"],
      "code-generation": ["code"],
      reasoning: ["reasoning"],
      "image-gen": ["chat"],
      "tool-use": ["tool_use", "chat"],
    };
    const capabilities = capMap[request.task.type] ?? ["chat"];

    // Check if preferred model is already loaded
    if (request.preferredModel) {
      const installed = await getInstalledModels();
      const found = installed.find((m) =>
        m.name.toLowerCase().includes(request.preferredModel!.toLowerCase()),
      );

      if (found) {
        const endpoint =
          found.provider === "ollama"
            ? (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434")
            : found.provider === "lmstudio"
              ? (process.env.LMSTUDIO_URL ?? "http://127.0.0.1:1234")
              : "local";

        return createGrant(request, found.name, found.provider, endpoint);
      }
    }

    // Auto-select and provision
    const selection = autoSelectModel(capabilities, resources, request.preference);
    if (!selection) {
      // Try to ensure a runtime is up
      const ollama = getRuntimeStatus("ollama");
      if (ollama && ollama.installed && !ollama.running) {
        await startRuntime("ollama");
        // Retry
        const retry = autoSelectModel(capabilities, resources, request.preference);
        if (!retry) {return null;}
      }
      return null;
    }

    // Check if model is already available
    const installed = await getInstalledModels();
    const alreadyAvailable = installed.find((m) =>
      m.name.toLowerCase().includes(selection.model.id.toLowerCase()),
    );

    if (alreadyAvailable) {
      const endpoint =
        alreadyAvailable.provider === "ollama"
          ? (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434")
          : alreadyAvailable.provider === "lmstudio"
            ? (process.env.LMSTUDIO_URL ?? "http://127.0.0.1:1234")
            : "local";

      return createGrant(request, alreadyAvailable.name, alreadyAvailable.provider, endpoint);
    }

    // Need to provision: download + load
    const result = await provisionModel(capabilities, request.preference);
    if (!result.success || !result.model) {return null;}

    const endpoint =
      result.loadedInto === "ollama"
        ? (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434")
        : result.loadedInto === "lmstudio"
          ? (process.env.LMSTUDIO_URL ?? "http://127.0.0.1:1234")
          : "local";

    return createGrant(request, result.model.name, result.loadedInto ?? "local", endpoint);
  } catch (error) {
    emitNationalEvent("technology", "compute_provision_failed", "compute-scaler", {
      requestId: request.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function createGrant(
  request: ComputeRequest,
  model: string,
  provider: string,
  endpoint: string,
): ComputeGrant {
  const now = Date.now();
  const ttlMs = DEFAULT_GRANT_TTL_MS;

  // Higher complexity tasks get more tokens
  const tokenBudget = Math.round(DEFAULT_TOKEN_BUDGET * (1 + request.task.complexity * 3));

  const grant: ComputeGrant = {
    requestId: request.id,
    citizenId: request.citizenId,
    model,
    provider,
    endpoint,
    tokenBudget,
    ttlMs,
    grantedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
  };

  activeGrants.set(request.id, grant);
  grantHistory.push({
    requestId: request.id,
    citizenId: request.citizenId,
    model,
    grantedAt: grant.grantedAt,
  });

  emitNationalEvent("technology", "compute_granted", "compute-scaler", {
    requestId: request.id,
    citizenId: request.citizenId,
    model,
    provider,
    tokenBudget,
  });

  return grant;
}

// ─── Usage Tracking ─────────────────────────────────────────────

/**
 * Record token usage against a grant.
 */
export function recordUsage(requestId: string, tokensUsed: number, latencyMs: number): void {
  const grant = activeGrants.get(requestId);
  if (!grant) {return;}

  const key = `${grant.citizenId}:${grant.model}`;
  const existing = usageRecords.get(key);

  // Estimate cost: local models are free, cloud models cost more
  const costPerToken =
    grant.provider === "ollama" || grant.provider === "lmstudio"
      ? 0
      : grant.provider === "local"
        ? 0
        : 0.00001; // cloud

  if (existing) {
    existing.tokensUsed += tokensUsed;
    existing.requestCount++;
    existing.totalLatencyMs += latencyMs;
    existing.lastUsedAt = new Date().toISOString();
    existing.estimatedCost += tokensUsed * costPerToken;
  } else {
    usageRecords.set(key, {
      citizenId: grant.citizenId,
      model: grant.model,
      provider: grant.provider,
      tokensUsed,
      requestCount: 1,
      totalLatencyMs: latencyMs,
      lastUsedAt: new Date().toISOString(),
      estimatedCost: tokensUsed * costPerToken,
    });
  }
}

/**
 * Get usage summary for a citizen.
 */
export function getUsageForCitizen(citizenId: string): UsageRecord | null {
  let total: UsageRecord | null = null;

  for (const [key, record] of usageRecords) {
    if (key.startsWith(`${citizenId}:`)) {
      if (!total) {
        total = { ...record };
      } else {
        total.tokensUsed += record.tokensUsed;
        total.requestCount += record.requestCount;
        total.totalLatencyMs += record.totalLatencyMs;
        total.estimatedCost += record.estimatedCost;
        if (record.lastUsedAt > total.lastUsedAt) {
          total.lastUsedAt = record.lastUsedAt;
        }
      }
    }
  }

  return total;
}

/**
 * Get all usage records (for dashboards / analytics).
 */
export function getAllUsageRecords(): UsageRecord[] {
  return [...usageRecords.values()];
}

// ─── Queue Processing ───────────────────────────────────────────

/**
 * Process the request queue. Call this periodically (e.g. from the tick loop).
 * Attempts to provision the highest-priority queued requests.
 */
export async function processQueue(): Promise<number> {
  let processed = 0;

  // Expire old grants
  const now = Date.now();
  for (const [requestId, grant] of activeGrants) {
    if (new Date(grant.expiresAt).getTime() < now) {
      activeGrants.delete(requestId);
    }
  }

  // Process queue
  const toProcess = pendingRequests.filter((r) => r.status === "queued");
  for (const request of toProcess) {
    if (activeGrants.size >= MAX_CONCURRENT_GRANTS) {break;}

    request.status = "provisioning";
    const grant = await provisionForRequest(request);

    if (grant) {
      request.status = "granted";
      request.grantedAt = new Date().toISOString();
      // Remove from queue
      const idx = pendingRequests.indexOf(request);
      if (idx !== -1) {pendingRequests.splice(idx, 1);}
      processed++;
    } else {
      request.status = "queued"; // back to queued
    }
  }

  // Expire old queued requests (>5 min)
  const expireThreshold = now - 5 * 60 * 1000;
  for (let i = pendingRequests.length - 1; i >= 0; i--) {
    const req = pendingRequests[i];
    if (new Date(req.requestedAt).getTime() < expireThreshold) {
      req.status = "expired";
      pendingRequests.splice(i, 1);
    }
  }

  return processed;
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getScalerDiagnostics() {
  return {
    activeGrants: activeGrants.size,
    maxConcurrent: MAX_CONCURRENT_GRANTS,
    queueDepth: pendingRequests.length,
    totalGrantsIssued: grantHistory.length,
    totalUsageRecords: usageRecords.size,
    topUsers: [...usageRecords.values()]
      .toSorted((a, b) => b.tokensUsed - a.tokensUsed)
      .slice(0, 5)
      .map((r) => ({
        citizenId: r.citizenId,
        tokensUsed: r.tokensUsed,
        requestCount: r.requestCount,
        avgLatencyMs: Math.round(r.totalLatencyMs / Math.max(r.requestCount, 1)),
      })),
    queuedRequests: pendingRequests.map((r) => ({
      id: r.id,
      citizenId: r.citizenId,
      taskType: r.task.type,
      priority: r.priority,
      score: scoreRequest(r),
    })),
  };
}
