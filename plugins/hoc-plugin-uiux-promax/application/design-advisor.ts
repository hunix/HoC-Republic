/**
 * Application — Design Advisor
 *
 * Manages design system jobs. Since search is fast (~500ms),
 * this is simpler than TTS/DFL schedulers — no GPU gating needed.
 */

import type {
    DesignDomain, DesignJob,
    DesignJobStatus, OutputFormat, TechStack, UiuxConfig
} from "../domain/types.ts";
import {
    generateDesignSystem, persistDesignSystem, searchDomain
} from "../infrastructure/design-search.ts";

// ─── State ──────────────────────────────────────────────────────

const jobs = new Map<string, DesignJob>();
let jobCounter = 0;

// ─── Job Creation ───────────────────────────────────────────────

function createJob(
  citizenId: string,
  type: DesignJob["type"],
  query: string,
  opts?: {
    domain?: DesignDomain;
    projectName?: string;
    stack?: TechStack;
    format?: OutputFormat;
  },
): DesignJob {
  const id = `uiux-${Date.now()}-${++jobCounter}`;

  const job: DesignJob = {
    id,
    citizenId,
    type,
    query,
    status: "queued",
    domain: opts?.domain,
    projectName: opts?.projectName,
    stack: opts?.stack,
    format: opts?.format,
    createdAt: Date.now(),
  };

  jobs.set(id, job);
  return job;
}

// ─── Generate Design System ─────────────────────────────────────

export function requestDesignSystem(
  config: UiuxConfig,
  citizenId: string,
  query: string,
  projectName?: string,
  format?: OutputFormat,
): DesignJob {
  const job = createJob(citizenId, "design_system", query, { projectName, format });
  job.status = "running";

  generateDesignSystem(config, query, projectName, format, (code, output) => {
    if (code === 0) {
      job.status = "completed";
      job.result = output;
      job.completedAt = Date.now();
    } else {
      job.status = "failed";
      job.error = output;
    }
  });

  return job;
}

// ─── Domain Search ──────────────────────────────────────────────

export function requestSearch(
  config: UiuxConfig,
  citizenId: string,
  query: string,
  domain: DesignDomain,
  stack?: TechStack,
): DesignJob {
  const job = createJob(citizenId, "search", query, { domain, stack });
  job.status = "running";

  searchDomain(config, query, domain, stack, (code, output) => {
    if (code === 0) {
      job.status = "completed";
      job.result = output;
      job.completedAt = Date.now();
    } else {
      job.status = "failed";
      job.error = output;
    }
  });

  return job;
}

// ─── Persist Design System ──────────────────────────────────────

export function requestPersist(
  config: UiuxConfig,
  citizenId: string,
  query: string,
  projectName: string,
  page?: string,
): DesignJob {
  const job = createJob(citizenId, "persist", query, { projectName });
  job.status = "running";

  persistDesignSystem(config, query, projectName, page, (code, output) => {
    if (code === 0) {
      job.status = "completed";
      job.result = output;
      job.completedAt = Date.now();
    } else {
      job.status = "failed";
      job.error = output;
    }
  });

  return job;
}

// ─── Job Control ────────────────────────────────────────────────

export function getJob(jobId: string): DesignJob | undefined {
  return jobs.get(jobId);
}

export function listJobs(status?: DesignJobStatus): DesignJob[] {
  const all = Array.from(jobs.values());
  return status ? all.filter((j) => j.status === status) : all;
}

export function getQueueStatus(): {
  total: number;
  completed: number;
  failed: number;
} {
  const all = Array.from(jobs.values());
  return {
    total: all.length,
    completed: all.filter((j) => j.status === "completed").length,
    failed: all.filter((j) => j.status === "failed").length,
  };
}
