/**
 * Agent Sandbox Pool Manager — Task Queue & Worker
 *
 * Task submission, cancellation, priority aging, queue draining,
 * and the main executeTask orchestrator with retry/dead-letter logic.
 */

import type { SandboxTask, SandboxTaskType, SandboxFlavor, SandboxTaskResult } from "./types.js";
import { emitNationalEvent } from "../event-sourcing.js";
import { uid, ts } from "../utils.js";
import {
  MAX_CONCURRENT,
  MAX_QUEUE_SIZE,
  QUEUE_AGING_INTERVAL_MS,
  QUEUE_AGING_BOOST,
} from "./config.js";
import { inferFlavor, selectNodeForTask } from "./config.js";
import {
  taskQueue,
  activeTasks,
  deadLetterQueue,
  draining,
  pushRecent,
  incrementCompleted,
  incrementFailed,
  checkRateLimit,
} from "./pool-state.js";
import { sandboxExecRaw } from "./raw-api.js";
import {
  executeExecTask,
  executeBrowseTask,
  executeBuildTask,
  executeFileTask,
} from "./task-executors.js";

// ─── Task Submission ────────────────────────────────────────────

/**
 * Submit a task to the sandbox pool. Returns the task ID.
 * The pool auto-starts the container if needed.
 */
export async function submitSandboxTask(opts: {
  citizenId: string;
  citizenName: string;
  type: SandboxTaskType;
  flavor?: SandboxFlavor;
  priority?: number;
  payload: Record<string, unknown>;
}): Promise<string> {
  if (draining) {
    throw new Error("Sandbox pool is draining — no new tasks accepted");
  }
  if (taskQueue.length >= MAX_QUEUE_SIZE) {
    throw new Error("Sandbox queue is full");
  }

  checkRateLimit();

  const flavor = opts.flavor ?? inferFlavor(opts.type);
  const nodeSelection = selectNodeForTask(flavor);

  const taskId = uid();
  const task: SandboxTask = {
    id: taskId,
    citizenId: opts.citizenId,
    citizenName: opts.citizenName,
    type: opts.type,
    flavor,
    priority: opts.priority ?? 50,
    payload: opts.payload,
    createdAt: ts(),
    status: "queued",
    workspaceDir: `/workspace/task-${taskId}`,
    targetNode: nodeSelection.local ? "local" : nodeSelection.node?.host,
  };

  taskQueue.push(task);
  taskQueue.sort((a, b) => b.priority - a.priority);

  emitNationalEvent("infrastructure", "sandbox_task_queued", task.citizenId, {
    taskId,
    type: task.type,
    flavor,
    queueDepth: taskQueue.length,
    targetNode: task.targetNode,
  });

  // Ensure container is running and drain the queue
  const { ensureContainerRunning } = await import("./container-lifecycle.js");
  await ensureContainerRunning();
  drainQueue();

  return taskId;
}

/**
 * Cancel a queued or running task.
 */
export function cancelSandboxTask(taskId: string): boolean {
  const qIdx = taskQueue.findIndex((t) => t.id === taskId);
  if (qIdx >= 0) {
    taskQueue[qIdx].status = "cancelled";
    taskQueue[qIdx].completedAt = ts();
    pushRecent(taskQueue[qIdx]);
    taskQueue.splice(qIdx, 1);
    return true;
  }
  const active = activeTasks.get(taskId);
  if (active) {
    active.status = "cancelled";
    active.completedAt = ts();
    activeTasks.delete(taskId);
    pushRecent(active);
    return true;
  }
  return false;
}

// ─── Queue Worker ───────────────────────────────────────────────

function ageQueue(): void {
  const now = Date.now();
  for (const task of taskQueue) {
    const createdMs = new Date(task.createdAt).getTime();
    const waitMs = now - createdMs;
    if (waitMs > QUEUE_AGING_INTERVAL_MS) {
      const ageBoosts = Math.floor(waitMs / QUEUE_AGING_INTERVAL_MS);
      const boostedPriority = task.priority + ageBoosts * QUEUE_AGING_BOOST;
      task.priority = Math.min(100, boostedPriority);
    }
  }
  if (taskQueue.length > 1) {
    taskQueue.sort((a, b) => b.priority - a.priority);
  }
}

export function drainQueue(): void {
  ageQueue();
  while (activeTasks.size < MAX_CONCURRENT && taskQueue.length > 0) {
    const task = taskQueue.shift()!;
    activeTasks.set(task.id, task);
    task.status = "running";
    task.startedAt = ts();
    executeTask(task).catch(() => {
      /* handled inside */
    });
  }
}

// ─── Task Execution Orchestrator ────────────────────────────────

async function executeTask(task: SandboxTask): Promise<void> {
  const start = Date.now();

  try {
    await sandboxExecRaw(`mkdir -p ${task.workspaceDir}`, "/workspace", 10);

    let result: SandboxTaskResult;
    switch (task.type) {
      case "exec":
        result = await executeExecTask(task);
        break;
      case "browse":
        result = await executeBrowseTask(task);
        break;
      case "build":
        result = await executeBuildTask(task);
        break;
      case "file_op":
        result = await executeFileTask(task);
        break;
      default:
        result = await executeExecTask(task);
    }

    task.result = result;
    task.status = result.exitCode === 0 ? "success" : "failed";
    if (task.status === "success") {
      incrementCompleted();
    } else {
      incrementFailed();
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isTransient = /ENOENT|ECONNREFUSED|timeout|container fails|unavailable/i.test(errMsg);

    let containerLogs = "";
    try {
      const logResult = await sandboxExecRaw(
        "tail -30 /var/log/sandbox-api.log 2>/dev/null || echo '[no logs]'",
        "/",
        5,
      );
      containerLogs = logResult.stdout.slice(0, 2000);
    } catch {
      /* best-effort */
    }

    task.result = {
      stdout: "",
      stderr: containerLogs ? `${errMsg}\n\n--- Container Logs ---\n${containerLogs}` : errMsg,
      exitCode: 1,
      durationMs: Date.now() - start,
      filesCreated: [],
      error: errMsg,
    };
    task.status = errMsg.includes("timeout") ? "timeout" : "failed";
    incrementFailed();

    const retries = task.retryCount ?? 0;
    if (isTransient && retries < 2) {
      task.retryCount = retries + 1;
      task.status = "queued";
      task.priority = Math.min(100, task.priority + 10);
      activeTasks.delete(task.id);
      taskQueue.push(task);
      taskQueue.sort((a, b) => b.priority - a.priority);
      console.log(
        `[AgentSandbox] Task ${task.id} failed transiently (${errMsg}), re-queueing (retry ${task.retryCount}/2)`,
      );
      return;
    }

    deadLetterQueue.push(task);
    if (deadLetterQueue.length > 100) {
      deadLetterQueue.shift();
    }
    console.error(
      `[AgentSandbox] Task ${task.id} permanently failed after ${retries} retries: ${errMsg}`,
    );
  } finally {
    if (task.status !== "queued") {
      task.completedAt = ts();
      activeTasks.delete(task.id);
      pushRecent(task);

      sandboxExecRaw(`rm -rf ${task.workspaceDir}`, "/workspace", 10).catch(() => {});

      emitNationalEvent("infrastructure", "sandbox_task_completed", task.citizenId, {
        taskId: task.id,
        type: task.type,
        status: task.status,
        durationMs: task.result?.durationMs ?? 0,
      });
    }

    drainQueue();
  }
}
