/**
 * Application — Video Scheduler (HunyuanVideo)
 */
import type { QueueStatus, VideoJob, VideoRequest, I2VRequest, HunyuanConfig } from "../domain/types.ts";

const jobs: Map<string, VideoJob> = new Map();
let nextId = 1;
let _config: HunyuanConfig | null = null;

export function initScheduler(config: HunyuanConfig): void { _config = config; }

export function submitT2VJob(params: { citizenId: string; citizenName: string; request: VideoRequest }): VideoJob {
  const job: VideoJob = { id: `hunyuan-t2v-${nextId++}`, citizenId: params.citizenId, citizenName: params.citizenName, request: params.request, mode: "t2v", status: "queued", progress: 0, createdAt: Date.now() };
  jobs.set(job.id, job); return job;
}

export function submitI2VJob(params: { citizenId: string; citizenName: string; request: I2VRequest }): VideoJob {
  const job: VideoJob = { id: `hunyuan-i2v-${nextId++}`, citizenId: params.citizenId, citizenName: params.citizenName, request: params.request, mode: "i2v", status: "queued", progress: 0, createdAt: Date.now() };
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
