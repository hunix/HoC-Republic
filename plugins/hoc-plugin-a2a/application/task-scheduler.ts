/**
 * Application — Task Scheduler
 *
 * Manages A2A task routing and delegation.
 */

import type { A2AConfig, A2AMessage, A2ATask } from "../domain/types.ts";
import {
    createTask, getQueueStatus as engineQueueStatus, getTask, sendTask, updateTaskStatus
} from "../infrastructure/a2a-engine.ts";

let _config: A2AConfig | null = null;

export function initScheduler(cfg: A2AConfig): void {
  _config = cfg;
}

export function submitTask(params: {
  citizenId: string;
  citizenName: string;
  targetUrl: string;
  messages: A2AMessage[];
}): A2ATask {
  const task = createTask(params.messages);
  // Fire-and-forget: send to remote agent
  sendTask(params.targetUrl, params.messages)
    .then((result) => {
      if (result) {
        updateTaskStatus(task.id, "completed");
      } else {
        updateTaskStatus(task.id, "failed");
      }
    })
    .catch(() => {
      updateTaskStatus(task.id, "failed");
    });
  return task;
}

export function getTaskStatus(id: string): A2ATask | undefined {
  return getTask(id);
}

export function cancelTask(id: string): boolean {
  return updateTaskStatus(id, "canceled");
}

export function getQueueStatus(): {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
} {
  return engineQueueStatus();
}
