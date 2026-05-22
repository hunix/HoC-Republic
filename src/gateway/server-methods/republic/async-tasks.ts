/**
 * Async Tasks — Gateway RPC Handlers
 *
 * Exposes the async task manager via RPC for fire-and-forget task execution.
 * Users can submit tasks, check status, retrieve results, and cancel.
 *
 * Methods:
 *   republic.task.submit   — Submit a new background task
 *   republic.task.status   — Get task state and progress
 *   republic.task.result   — Get completed task output
 *   republic.task.cancel   — Cancel a running/queued task
 *   republic.task.list     — List all tasks with optional filters
 *   republic.task.stats    — Get aggregate task statistics
 */

import type { GatewayRequestHandlers } from "../types.js";

export const asyncTaskHandlers: GatewayRequestHandlers = {
  "republic.task.submit": async ({ params, respond }) => {
    const p = params as { prompt?: string; modelOverride?: { provider: string; modelId: string } };
    if (!p.prompt || typeof p.prompt !== "string" || p.prompt.trim().length === 0) {
      respond(false, undefined, { code: "BAD_REQUEST", message: "prompt is required" });
      return;
    }
    const { submitTask } = await import("../../../republic/async-task-manager.js");
    const taskId = await submitTask(p.prompt.trim(), { modelOverride: p.modelOverride });
    respond(true, { ok: true, taskId });
  },

  "republic.task.status": async ({ params, respond }) => {
    const p = params as { taskId?: string };
    if (!p.taskId) {
      respond(false, undefined, { code: "BAD_REQUEST", message: "taskId is required" });
      return;
    }
    const { getTaskStatus } = await import("../../../republic/async-task-manager.js");
    const task = await getTaskStatus(p.taskId);
    if (!task) {
      respond(false, undefined, { code: "NOT_FOUND", message: `Task not found: ${p.taskId}` });
      return;
    }
    respond(true, {
      ok: true,
      id: task.id,
      state: task.state,
      prompt: task.prompt,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      stepCount: task.steps.length,
      recentSteps: task.steps.slice(-10),
      error: task.error,
    });
  },

  "republic.task.result": async ({ params, respond }) => {
    const p = params as { taskId?: string };
    if (!p.taskId) {
      respond(false, undefined, { code: "BAD_REQUEST", message: "taskId is required" });
      return;
    }
    const { getTaskStatus } = await import("../../../republic/async-task-manager.js");
    const task = await getTaskStatus(p.taskId);
    if (!task) {
      respond(false, undefined, { code: "NOT_FOUND", message: `Task not found: ${p.taskId}` });
      return;
    }
    if (task.state !== "completed" && task.state !== "failed") {
      respond(true, {
        ok: true,
        state: task.state,
        result: null,
        message: `Task is still ${task.state}`,
      });
      return;
    }
    respond(true, { ok: true, state: task.state, result: task.result, error: task.error });
  },

  "republic.task.cancel": async ({ params, respond }) => {
    const p = params as { taskId?: string };
    if (!p.taskId) {
      respond(false, undefined, { code: "BAD_REQUEST", message: "taskId is required" });
      return;
    }
    const { cancelTask } = await import("../../../republic/async-task-manager.js");
    const cancelled = await cancelTask(p.taskId);
    respond(true, {
      ok: cancelled,
      message: cancelled ? "Task cancelled" : "Cannot cancel (not running/queued)",
    });
  },

  "republic.task.list": async ({ params, respond }) => {
    const p = params as { state?: string; limit?: number };
    const { listTasks } = await import("../../../republic/async-task-manager.js");
    const tasks = await listTasks({
      state: p.state as "queued" | "running" | "completed" | "failed" | "cancelled" | undefined,
      limit: p.limit ?? 20,
    });
    respond(true, {
      ok: true,
      tasks: tasks.map((t) => ({
        id: t.id,
        prompt: t.prompt.slice(0, 200),
        state: t.state,
        createdAt: t.createdAt,
        startedAt: t.startedAt,
        completedAt: t.completedAt,
        stepCount: t.steps.length,
        hasResult: t.result !== null,
        error: t.error,
      })),
    });
  },

  "republic.task.stats": async ({ respond }) => {
    const { getTaskStats } = await import("../../../republic/async-task-manager.js");
    const stats = await getTaskStats();
    respond(true, { ok: true, stats });
  },
};
