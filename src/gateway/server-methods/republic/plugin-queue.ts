/**
 * Plugin Queue — Gateway RPC Handlers
 *
 * Exposes the citizen plugin job queue to the UI:
 *   republic.plugin-queue.submit   — citizen submits a job for senior approval
 *   republic.plugin-queue.list     — list jobs (filterable)
 *   republic.plugin-queue.approve  — senior citizen approves a pending job
 *   republic.plugin-queue.reject   — senior citizen rejects with reason
 *   republic.plugin-queue.cancel   — cancel a queued/pending job
 *   republic.plugin-queue.status   — overall queue stats
 *   republic.plugin-queue.get      — get single job by id
 */

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  submitPluginJob,
  approvePluginJob,
  rejectPluginJob,
  cancelPluginJob,
  listPluginJobs,
  getPluginJob,
  getPluginQueueStats,
  type PluginJobStatus,
} from "../../../republic/plugin-queue-state.js";

export const pluginQueueHandlers: Partial<GatewayRequestHandlers> = {
  "republic.plugin-queue.submit": async ({ params, respond }) => {
    const p = params as {
      pluginId?: string;
      method?: string;
      params?: Record<string, unknown>;
      citizenId?: string;
      citizenName?: string;
      priority?: number;
    };

    if (!p.pluginId || !p.method) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "pluginId and method are required"));
      return;
    }

    const job = submitPluginJob(
      p.pluginId,
      p.method,
      p.params ?? {},
      p.citizenId ?? "operator",
      p.citizenName ?? "Operator",
      ([1, 2, 3, 4, 5].includes(p.priority ?? 3) ? p.priority : 3) as 1 | 2 | 3 | 4 | 5,
    );
    respond(true, { ok: true, job }, undefined);
  },

  "republic.plugin-queue.list": async ({ params, respond }) => {
    const p = params as {
      status?: string | string[];
      pluginId?: string;
      citizenId?: string;
      limit?: number;
    };
    const jobs = listPluginJobs({
      status: p.status as PluginJobStatus | PluginJobStatus[] | undefined,
      pluginId: p.pluginId,
      citizenId: p.citizenId,
      limit: p.limit,
    });
    respond(true, { jobs }, undefined);
  },

  "republic.plugin-queue.approve": async ({ params, respond }) => {
    const p = params as { jobId?: string; approverCitizenId?: string };
    if (!p.jobId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "jobId is required"));
      return;
    }
    const job = approvePluginJob(p.jobId, p.approverCitizenId ?? "senior");
    if (!job) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Job not found or not pending approval"));
      return;
    }
    respond(true, { ok: true, job }, undefined);
  },

  "republic.plugin-queue.reject": async ({ params, respond }) => {
    const p = params as { jobId?: string; approverCitizenId?: string; reason?: string };
    if (!p.jobId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "jobId is required"));
      return;
    }
    const job = rejectPluginJob(
      p.jobId,
      p.approverCitizenId ?? "senior",
      p.reason ?? "Rejected by senior",
    );
    if (!job) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Job not found or not pending approval"));
      return;
    }
    respond(true, { ok: true, job }, undefined);
  },

  "republic.plugin-queue.cancel": async ({ params, respond }) => {
    const p = params as { jobId?: string };
    if (!p.jobId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "jobId is required"));
      return;
    }
    const ok = cancelPluginJob(p.jobId);
    respond(true, { ok, jobId: p.jobId }, undefined);
  },

  "republic.plugin-queue.status": async ({ respond }) => {
    const stats = getPluginQueueStats();
    respond(true, stats, undefined);
  },

  "republic.plugin-queue.get": async ({ params, respond }) => {
    const p = params as { jobId?: string };
    if (!p.jobId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "jobId is required"));
      return;
    }
    const job = getPluginJob(p.jobId);
    if (!job) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Job ${p.jobId} not found`));
      return;
    }
    respond(true, { job }, undefined);
  },
};
