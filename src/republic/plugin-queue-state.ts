/**
 * Plugin Queue State
 *
 * In-memory job queue for citizen plugin usage requests.
 * All plugin jobs go through: pending-approval → queued → running → completed/failed/rejected.
 *
 * Senior citizens approve jobs; resource cost estimates gate queue ordering.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("plugin-queue");

// ─── Types ───────────────────────────────────────────────────────

export type PluginJobStatus =
  | "pending-approval"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "rejected"
  | "cancelled";

export interface PluginQueueJob {
  id: string;
  pluginId: string;
  method: string;
  params: Record<string, unknown>;
  citizenId: string;
  citizenName: string;
  requestedAt: number;
  priority: 1 | 2 | 3 | 4 | 5; // 5 = highest
  status: PluginJobStatus;
  approvedBy?: string;
  approvedAt?: number;
  rejectionReason?: string;
  startedAt?: number;
  completedAt?: number;
  result?: unknown;
  error?: string;
  resourceCost: PluginResourceCost;
}

export interface PluginResourceCost {
  gpuHours: number; // estimated GPU compute hours
  ramGb: number; // peak RAM needed
  diskGb: number; // estimated output disk
  estimatedSec: number; // wall-clock estimate
}

// ─── Resource cost estimates per plugin ──────────────────────────

const PLUGIN_COSTS: Record<string, PluginResourceCost> = {
  "hoc-plugin-lingbot-world": { gpuHours: 0.5, ramGb: 16, diskGb: 2, estimatedSec: 300 },
  "hoc-plugin-bark": { gpuHours: 0.05, ramGb: 4, diskGb: 0.1, estimatedSec: 30 },
  "hoc-plugin-chatterbox": { gpuHours: 0.05, ramGb: 4, diskGb: 0.1, estimatedSec: 15 },
  "hoc-plugin-qwen3-tts": { gpuHours: 0.03, ramGb: 3, diskGb: 0.1, estimatedSec: 10 },
  "hoc-plugin-mmaudio": { gpuHours: 0.1, ramGb: 8, diskGb: 0.5, estimatedSec: 60 },
  "hoc-plugin-funmusic": { gpuHours: 0.2, ramGb: 12, diskGb: 0.3, estimatedSec: 120 },
  "hoc-plugin-deforum": { gpuHours: 1.0, ramGb: 16, diskGb: 3, estimatedSec: 600 },
  "hoc-plugin-omnigen": { gpuHours: 0.1, ramGb: 16, diskGb: 0.3, estimatedSec: 60 },
  "hoc-plugin-glm-image": { gpuHours: 0.3, ramGb: 32, diskGb: 0.3, estimatedSec: 120 },
  "hoc-plugin-switti": { gpuHours: 0.05, ramGb: 8, diskGb: 0.1, estimatedSec: 30 },
  "hoc-plugin-storydiffusion": { gpuHours: 0.2, ramGb: 16, diskGb: 0.5, estimatedSec: 120 },
  "hoc-plugin-deepfacelab": { gpuHours: 0.5, ramGb: 8, diskGb: 1, estimatedSec: 300 },
  "hoc-plugin-facefusion": { gpuHours: 0.2, ramGb: 8, diskGb: 0.5, estimatedSec: 120 },
  "hoc-plugin-dgm": { gpuHours: 0.5, ramGb: 12, diskGb: 1, estimatedSec: 300 },
  "hoc-plugin-stable-avatar": { gpuHours: 0.5, ramGb: 16, diskGb: 2, estimatedSec: 300 },
  "hoc-plugin-magicanimate": { gpuHours: 0.5, ramGb: 16, diskGb: 2, estimatedSec: 300 },
  "hoc-plugin-sparc3d": { gpuHours: 1.0, ramGb: 16, diskGb: 3, estimatedSec: 600 },
  "hoc-plugin-easyvolcap": { gpuHours: 1.5, ramGb: 24, diskGb: 5, estimatedSec: 900 },
  "hoc-plugin-autogpt": { gpuHours: 0.0, ramGb: 2, diskGb: 0.1, estimatedSec: 300 },
  "hoc-plugin-magentic-one": { gpuHours: 0.0, ramGb: 4, diskGb: 0.5, estimatedSec: 600 },
  "hoc-plugin-ai-scientist": { gpuHours: 4.0, ramGb: 32, diskGb: 5, estimatedSec: 7200 },
  "hoc-plugin-a2a": { gpuHours: 0.0, ramGb: 1, diskGb: 0.1, estimatedSec: 60 },
  "hoc-plugin-kv-edit": { gpuHours: 0.1, ramGb: 8, diskGb: 0.2, estimatedSec: 60 },
  "hoc-plugin-open-lovable": { gpuHours: 0.0, ramGb: 2, diskGb: 0.5, estimatedSec: 120 },
  "hoc-plugin-uiux-promax": { gpuHours: 0.0, ramGb: 2, diskGb: 0.2, estimatedSec: 60 },
  "hoc-plugin-superpowers": { gpuHours: 0.0, ramGb: 1, diskGb: 0.1, estimatedSec: 30 },
};

const DEFAULT_COST: PluginResourceCost = { gpuHours: 0.1, ramGb: 4, diskGb: 0.2, estimatedSec: 60 };

function getResourceCost(pluginId: string): PluginResourceCost {
  return PLUGIN_COSTS[pluginId] ?? DEFAULT_COST;
}

// ─── State ───────────────────────────────────────────────────────

let _idSeq = 0;
const jobs = new Map<string, PluginQueueJob>();

function newId(): string {
  return `pq-${Date.now()}-${++_idSeq}`;
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Citizen submits a plugin job for senior approval.
 */
export function submitPluginJob(
  pluginId: string,
  method: string,
  params: Record<string, unknown>,
  citizenId: string,
  citizenName: string,
  priority: 1 | 2 | 3 | 4 | 5 = 3,
): PluginQueueJob {
  const job: PluginQueueJob = {
    id: newId(),
    pluginId,
    method,
    params,
    citizenId,
    citizenName,
    requestedAt: Date.now(),
    priority,
    status: "pending-approval",
    resourceCost: getResourceCost(pluginId),
  };
  jobs.set(job.id, job);
  logger.info(`Plugin job submitted: ${job.id} (${pluginId}.${method}) by ${citizenName}`);
  return job;
}

/**
 * Senior citizen approves a pending-approval job → moves to queued.
 */
export function approvePluginJob(jobId: string, approverCitizenId: string): PluginQueueJob | null {
  const job = jobs.get(jobId);
  if (!job || job.status !== "pending-approval") {
    return null;
  }
  job.status = "queued";
  job.approvedBy = approverCitizenId;
  job.approvedAt = Date.now();
  logger.info(`Job ${jobId} approved by ${approverCitizenId}`);
  return job;
}

/**
 * Senior citizen rejects a pending-approval job.
 */
export function rejectPluginJob(
  jobId: string,
  approverCitizenId: string,
  reason: string,
): PluginQueueJob | null {
  const job = jobs.get(jobId);
  if (!job || job.status !== "pending-approval") {
    return null;
  }
  job.status = "rejected";
  job.approvedBy = approverCitizenId;
  job.approvedAt = Date.now();
  job.rejectionReason = reason;
  logger.info(`Job ${jobId} rejected by ${approverCitizenId}: ${reason}`);
  return job;
}

/**
 * Cancel a job (submitter or senior).
 */
export function cancelPluginJob(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job || job.status === "completed" || job.status === "failed") {
    return false;
  }
  job.status = "cancelled";
  return true;
}

/**
 * List jobs with optional filter.
 */
export function listPluginJobs(opts?: {
  status?: PluginJobStatus | PluginJobStatus[];
  pluginId?: string;
  citizenId?: string;
  limit?: number;
}): PluginQueueJob[] {
  let result = [...jobs.values()];

  if (opts?.status) {
    const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
    result = result.filter((j) => statuses.includes(j.status));
  }
  if (opts?.pluginId) {
    result = result.filter((j) => j.pluginId === opts.pluginId);
  }
  if (opts?.citizenId) {
    result = result.filter((j) => j.citizenId === opts.citizenId);
  }

  // Sort: priority desc, requestedAt asc
  result.sort((a, b) => b.priority - a.priority || a.requestedAt - b.requestedAt);

  if (opts?.limit) {
    result = result.slice(0, opts.limit);
  }

  return result;
}

/**
 * Get a single job.
 */
export function getPluginJob(jobId: string): PluginQueueJob | undefined {
  return jobs.get(jobId);
}

/**
 * Queue summary stats.
 */
export function getPluginQueueStats() {
  const all = [...jobs.values()];
  return {
    pendingApproval: all.filter((j) => j.status === "pending-approval").length,
    queued: all.filter((j) => j.status === "queued").length,
    running: all.filter((j) => j.status === "running").length,
    completed: all.filter((j) => j.status === "completed").length,
    failed: all.filter((j) => j.status === "failed").length,
    rejected: all.filter((j) => j.status === "rejected").length,
    cancelled: all.filter((j) => j.status === "cancelled").length,
    totalJobs: all.length,
  };
}

/**
 * Mark a queued job as running (internal, called by execution layer).
 */
export function markJobRunning(jobId: string): void {
  const job = jobs.get(jobId);
  if (job && job.status === "queued") {
    job.status = "running";
    job.startedAt = Date.now();
  }
}

/**
 * Mark a running job as completed or failed.
 */
export function markJobDone(jobId: string, result: unknown, error?: string): void {
  const job = jobs.get(jobId);
  if (!job || job.status !== "running") {
    return;
  }
  job.status = error ? "failed" : "completed";
  job.completedAt = Date.now();
  job.result = result;
  job.error = error;
}
