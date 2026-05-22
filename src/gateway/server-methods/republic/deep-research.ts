/**
 * Republic Gateway Handlers — Deep Research
 *
 * RPCs for the Manus-style Deep Research system:
 *   republic.research.start    — start a new research job
 *   republic.research.status   — poll job progress
 *   republic.research.result   — get final document info
 *   republic.research.list     — list recent jobs
 *   republic.research.cancel   — cancel a queued job
 */

import type { GatewayRequestHandlers } from "../types.js";
import {
  getResearchJob,
  listResearchJobs,
  startResearchJob,
  type ResearchRequest,
} from "../../../republic/deep-research-orchestrator.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

export const deepResearchHandlers: GatewayRequestHandlers = {
  /**
   * Start a new deep research job.
   * Params: { query, format?, depth?, context?, alsoMarkdown?, requestedBy? }
   * Returns: { jobId, status, log }
   */
  "republic.research.start": ({ params, respond }) => {
    try {
      const p = params as (Partial<ResearchRequest> & { requestedBy?: string }) | undefined;
      if (!p?.query || typeof p.query !== "string" || p.query.trim().length < 3) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "query is required (min 3 chars)"),
        );
        return;
      }

      const request: ResearchRequest = {
        query: p.query.trim(),
        format: (p.format ?? "md") as ResearchRequest["format"],
        depth: (p.depth ?? "standard") as ResearchRequest["depth"],
        context: p.context,
        alsoMarkdown: p.alsoMarkdown ?? false,
        requestedBy: p.requestedBy,
      };

      const job = startResearchJob(request);
      respond(
        true,
        {
          ok: true,
          jobId: job.id,
          status: job.status,
          message: `Research started: "${request.query}" → ${request.format} (${request.depth})`,
          log: job.log,
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Research start failed: ${String(err)}`),
      );
    }
  },

  /**
   * Get the current status of a research job.
   * Params: { jobId }
   */
  "republic.research.status": ({ params, respond }) => {
    try {
      const p = params as { jobId?: string } | undefined;
      if (!p?.jobId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "jobId required"));
        return;
      }
      const job = getResearchJob(p.jobId);
      if (!job) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Job ${p.jobId} not found`));
        return;
      }
      respond(
        true,
        {
          ok: true,
          jobId: job.id,
          status: job.status,
          progress: job.progress,
          plan: job.plan,
          error: job.error,
          log: job.log.slice(-10), // last 10 log entries
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          completedAt: job.completedAt,
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  /**
   * Get the final result of a completed research job.
   * Params: { jobId }
   */
  "republic.research.result": ({ params, respond }) => {
    try {
      const p = params as { jobId?: string } | undefined;
      if (!p?.jobId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "jobId required"));
        return;
      }
      const job = getResearchJob(p.jobId);
      if (!job) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Job ${p.jobId} not found`));
        return;
      }
      if (job.status !== "done") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Job not done yet: ${job.status}`),
        );
        return;
      }
      respond(
        true,
        {
          ok: true,
          jobId: job.id,
          result: job.result,
          plan: job.plan,
          query: job.request.query,
          format: job.request.format,
          depth: job.request.depth,
          sourcesUsed: job.progress.extractedSources,
          sectionsWritten: job.progress.sectionsWritten,
          completedAt: job.completedAt,
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  /**
   * List recent research jobs.
   * Params: { limit? }
   */
  "republic.research.list": ({ params, respond }) => {
    try {
      const p = params as { limit?: number } | undefined;
      const jobs = listResearchJobs(p?.limit ?? 20);
      respond(
        true,
        {
          ok: true,
          jobs: jobs.map((j) => ({
            id: j.id,
            query: j.request.query,
            format: j.request.format,
            depth: j.request.depth,
            status: j.status,
            progress: j.progress,
            error: j.error,
            createdAt: j.createdAt,
            completedAt: j.completedAt,
            result: j.status === "done" ? j.result : undefined,
          })),
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },
};
