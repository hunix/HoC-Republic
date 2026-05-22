/**
 * CPE Dashboard — Gateway RPC Handlers
 *
 * Exposes real-time production scheduler telemetry to the UI:
 *
 *   republic.cpe.status          - full scheduler stats (queue, slots, plugins, budget)
 *   republic.cpe.citizen-budget  - per-citizen token budget status
 *   republic.cpe.job-eta         - estimated wait time for a given plugin/tier
 *   republic.cpe.queue           - list queued/warming jobs
 *   republic.cpe.history         - recent completed/failed job history
 *   republic.cpe.cancel-job      - cancel a queued job
 *   republic.cpe.submit          - manual production job submission via scheduler
 */

import * as path from "node:path";
import * as fs from "node:fs";
import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  getSchedulerStats,
  estimateWaitSec,
  listQueuedJobs,
  listHistory,
  cancelJob,
  submitProduction,
  type JobTier,
} from "../../../republic/production-scheduler.js";
import { getBudgetStatus } from "../../../republic/citizen-token-budget.js";
import { PIPELINE_REGISTRY } from "../../../republic/production-dispatcher.js";

export const cpeDashboardHandlers: Partial<GatewayRequestHandlers> = {
  /**
   * Full live scheduler stats: queue depths, plugin states, concurrency slots, budget.
   */
  "republic.cpe.status": ({ respond }) => {
    respond(true, { ok: true, stats: getSchedulerStats() }, undefined);
  },

  /**
   * Per-citizen token budget status.
   */
  "republic.cpe.citizen-budget": ({ params, respond }) => {
    const p = params as { citizenId?: string; specialization?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const budget = getBudgetStatus(p.citizenId, p.specialization);
    respond(true, { ok: true, budget }, undefined);
  },

  /**
   * Estimated wait time in seconds for a plugin/tier combination.
   */
  "republic.cpe.job-eta": ({ params, respond }) => {
    const p = params as { pluginId?: string; tier?: string } | undefined;
    if (!p?.pluginId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "pluginId required"));
      return;
    }
    const tier = (["CRITICAL", "HIGH", "NORMAL"].includes(p.tier ?? "") ? p.tier : "NORMAL") as JobTier;
    const etaSec = estimateWaitSec(p.pluginId, tier);
    respond(true, { ok: true, pluginId: p.pluginId, tier, etaSec }, undefined);
  },

  /**
   * List currently queued or warming jobs.
   */
  "republic.cpe.queue": ({ params, respond }) => {
    const p = params as {
      citizenId?: string;
      pluginId?: string;
      tier?: string;
      limit?: number;
    } | undefined;
    const jobs = listQueuedJobs({
      citizenId: p?.citizenId,
      pluginId: p?.pluginId,
      tier: p?.tier as JobTier | undefined,
      limit: p?.limit ?? 100,
    });
    respond(true, { ok: true, jobs }, undefined);
  },

  /**
   * Recent completed/failed/cancelled production job history.
   */
  "republic.cpe.history": ({ params, respond }) => {
    const p = params as { limit?: number } | undefined;
    const jobs = listHistory(p?.limit ?? 50);
    respond(true, { ok: true, jobs }, undefined);
  },

  /**
   * Cancel a queued or warming job.
   */
  "republic.cpe.cancel-job": ({ params, respond }) => {
    const p = params as { jobId?: string } | undefined;
    if (!p?.jobId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "jobId required"));
      return;
    }
    const ok = cancelJob(p.jobId);
    respond(true, { ok, jobId: p.jobId }, undefined);
  },

  /**
   * Submit a production request through the scheduler.
   * This is the real entry point for citizen productions that need a plugin backend.
   */
  "republic.cpe.submit": async ({ params, respond }) => {
    const p = params as {
      citizenId?: string;
      citizenName?: string;
      specialization?: string;
      contentType?: string;
      prompt?: string;
      priority?: number;
    } | undefined;

    if (!p?.citizenId || !p?.contentType || !p?.prompt) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId, contentType, and prompt required"),
      );
      return;
    }

    // Resolve pipeline entry for content type
    const entries = PIPELINE_REGISTRY[p.contentType];
    if (!entries?.length) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `No pipeline for contentType: ${p.contentType}`),
      );
      return;
    }

    // Pick first registered pipeline entry as default (scheduler handles lifecycle)
    const pipeline = entries[0];
    const outputDir = path.join(process.cwd(), "republic-output", pipeline.outputCategory);
    fs.mkdirSync(outputDir, { recursive: true });

    const jobParams: Record<string, unknown> = {
      ...pipeline.defaultParams,
      text: p.prompt,
      prompt: p.prompt,
      citizenId: p.citizenId,
      citizenName: p.citizenName ?? "Citizen",
      outputDir,
      outputFilename: `cpe-${Date.now()}.${pipeline.outputExt}`,
    };

    const result = submitProduction({
      citizenId: p.citizenId,
      citizenName: p.citizenName ?? "Citizen",
      specialization: p.specialization,
      pluginId: pipeline.pluginId,
      method: pipeline.generateMethod,
      jobParams,
      priority: p.priority ?? 3,
      contentType: p.contentType,
      prompt: p.prompt,
    });

    if (result.accepted) {
      respond(true, { ok: true, job: result.job }, undefined);
    } else {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, result.reason),
      );
    }
  },

  /**
   * List the available production pipeline registry (content types → plugins).
   */
  "republic.cpe.pipelines": ({ respond }) => {
    const pipelines: Record<string, { pluginId: string; displayName: string; outputCategory: string; outputExt: string }[]> = {};
    for (const [contentType, entries] of Object.entries(PIPELINE_REGISTRY)) {
      pipelines[contentType] = entries.map((e) => ({
        pluginId: e.pluginId,
        displayName: e.displayName,
        outputCategory: e.outputCategory,
        outputExt: e.outputExt,
      }));
    }
    respond(true, { ok: true, pipelines }, undefined);
  },
};
