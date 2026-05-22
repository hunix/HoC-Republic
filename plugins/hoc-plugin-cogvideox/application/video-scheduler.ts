/**
 * Application — Video Scheduler (CogVideoX)
 */
import type { QueueStatus, VideoJob, VideoRequest, CogVideoConfig } from "../domain/types.ts";

const jobs: Map<string, VideoJob> = new Map();
let nextId = 1;
let _config: CogVideoConfig | null = null;

export function initScheduler(config: CogVideoConfig): void { _config = config; }

export function submitJob(params: { citizenId: string; citizenName: string; request: VideoRequest }): VideoJob {
  const job: VideoJob = { id: `cogvideo-${nextId++}`, citizenId: params.citizenId, citizenName: params.citizenName, request: params.request, status: "queued", progress: 0, createdAt: Date.now() };
  jobs.set(job.id, job); return job;
}

export function getJob(jobId: string): VideoJob | undefined { return jobs.get(jobId); }
export function cancelJob(jobId: string): boolean {
  const job = jobs.get(jobId); if (!job || job.status === "completed" || job.status === "cancelled") {return false;}
  job.status = "cancelled"; return true;
}
export function getQueueStatus(): QueueStatus {
  let queued = 0, running = 0, completed = 0, failed = 0;
  for (const job of jobs.values()) { switch (job.status) { case "queued": queued++; break; case "running": running++; break; case "completed": completed++; break; case "failed": failed++; break; } }
  return { total: jobs.size, queued, running, completed, failed };
}
