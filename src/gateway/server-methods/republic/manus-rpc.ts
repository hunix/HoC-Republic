import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import { classifySandboxIntent } from "../../../republic/sandbox-intake.js";
import { uid } from "../../../republic/utils.js";
import { executeToolAction } from "../../../republic/real-execution.js";

interface ManusTask {
  id: string;
  command: string;
  status: "pending" | "running" | "completed" | "failed";
  language: string;
  createdAt: number;
  output?: string;
  filesAffected?: string[];
}

// In-memory Manus task registry for async polling API
const manusTasks: ManusTask[] = [];

export const manusHandlers: Partial<GatewayRequestHandlers> = {
  "manus.tasks.list": ({ respond }) => {
    respond(true, { tasks: manusTasks }, undefined);
  },

  "manus.task": ({ params, respond }) => {
    const p = params as { prompt?: string } | undefined;
    if (!p?.prompt) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "prompt is required"),
      );
      return;
    }

    const intent = classifySandboxIntent(p.prompt);
    const taskId = `manus-${uid()}`;
    const task: ManusTask = {
      id: taskId,
      command: intent.command || p.prompt,
      status: "running",
      language: intent.language,
      createdAt: Date.now(),
    };
    manusTasks.push(task);

    // Fire and forget actual execution through real-execution worker
    // Note: Do NOT await this here so the RPC returns immediately
    executeToolAction(
      "sandbox_exec",
      { command: task.command },
      {
        citizenId: "system",
        citizenName: "Manus Backend",
        specialization: "Generalist",
        skillLevel: 100,
        projectId: "default",
        mode: "real",
      }
    ).then((res) => {
      task.status = res.status === "success" ? "completed" : "failed";
      task.output = res.output || res.error || "No output";
      task.filesAffected = res.filesAffected;
    }).catch((err) => {
      task.status = "failed";
      task.output = String(err);
    });

    respond(true, { accepted: true, taskId, intent }, undefined);
  },

  "manus.retry": ({ params, respond }) => {
    const p = params as { taskId?: string } | undefined;
    if (!p?.taskId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "taskId is required"),
      );
      return;
    }
    const task = manusTasks.find((t) => t.id === p.taskId);
    if (!task) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "Task not found"),
      );
      return;
    }
    task.status = "pending";
    respond(true, { retry: true, taskId: task.id }, undefined);
  },
};
