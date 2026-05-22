/**
 * Application — Scene Scheduler (SkyReels V2)
 */
import type { QueueStatus, VideoJob, SceneRequest, ContinuousRequest, ExtendRequest, SkyReelsConfig } from "../domain/types.ts";

const jobs: Map<string, VideoJob> = new Map();
let nextId = 1;
let _config: SkyReelsConfig | null = null;

export function initScheduler(config: SkyReelsConfig): void { _config = config; }

export function submitSceneJob(params: { citizenId: string; citizenName: string; request: SceneRequest }): VideoJob {
  const job: VideoJob = { id: `skyreels-scene-${nextId++}`, citizenId: params.citizenId, citizenName: params.citizenName, request: params.request, mode: "scene", status: "queued", progress: 0, createdAt: Date.now() };
  jobs.set(job.id, job); return job;
}

export function submitContinuousJob(params: { citizenId: string; citizenName: string; request: ContinuousRequest }): VideoJob {
  const job: VideoJob = { id: `skyreels-cont-${nextId++}`, citizenId: params.citizenId, citizenName: params.citizenName, request: params.request, mode: "continuous", status: "queued", progress: 0, totalScenes: params.request.scenes.length, currentScene: 0, createdAt: Date.now() };
  jobs.set(job.id, job); return job;
}

export function submitExtendJob(params: { citizenId: string; citizenName: string; request: ExtendRequest }): VideoJob {
  const job: VideoJob = { id: `skyreels-ext-${nextId++}`, citizenId: params.citizenId, citizenName: params.citizenName, request: params.request, mode: "extend", status: "queued", progress: 0, createdAt: Date.now() };
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
