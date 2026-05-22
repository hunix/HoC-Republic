/**
 * Republic RPC — Agent Sandbox Pool handlers
 *
 * Gateway handlers for controlling the shared sandbox pool — a single
 * Docker container (Ubuntu 22.04, noVNC, Playwright, live preview) that
 * multiple citizens share via a priority task queue.
 */

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  buildSandboxImage,
  cancelSandboxTask,
  destroySandbox,
  getSandboxPoolStatus,
  getSandboxQueueSnapshot,
  getSandboxTaskStatus,
  sandboxBrowser,
  sandboxExec,
  sandboxListFiles,
  sandboxReadFile,
  sandboxWriteFile,
  startSandbox,
  stopSandbox,
  submitSandboxTask,
} from "../../../republic/agent-sandbox.js";

export const sandboxHandlers: Partial<GatewayRequestHandlers> = {
  // ─── Pool Status ─────────────────────────────────────────────
  "republic.sandbox.status": ({ respond }) => {
    respond(true, { ok: true, ...getSandboxPoolStatus() }, undefined);
  },

  "republic.sandbox.queue": ({ respond }) => {
    respond(true, { ok: true, ...getSandboxQueueSnapshot() }, undefined);
  },

  // ─── Task Management ─────────────────────────────────────────
  "republic.sandbox.task.submit": async ({ params, respond }) => {
    const p = params as {
      citizenId?: string;
      citizenName?: string;
      type?: string;
      flavor?: string;
      priority?: number;
      payload?: Record<string, unknown>;
    };
    if (!p.citizenId || !p.type) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and type required"));
      return;
    }
    try {
      const taskId = await submitSandboxTask({
        citizenId: p.citizenId,
        citizenName: p.citizenName ?? "Unknown",
        type: p.type as "exec" | "browse" | "build" | "file_op" | "custom",
        flavor: p.flavor as "exec" | "browse" | "diffusion" | "video" | "audio" | "ml" | undefined,
        priority: p.priority,
        payload: p.payload ?? {},
      });
      respond(true, { ok: true, taskId }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(
        ErrorCodes.INVALID_REQUEST,
        err instanceof Error ? err.message : String(err),
      ));
    }
  },

  "republic.sandbox.task.status": ({ params, respond }) => {
    const p = params as { taskId?: string };
    if (!p.taskId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId required"));
      return;
    }
    const task = getSandboxTaskStatus(p.taskId);
    respond(true, { ok: !!task, task }, undefined);
  },

  "republic.sandbox.task.cancel": ({ params, respond }) => {
    const p = params as { taskId?: string };
    if (!p.taskId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId required"));
      return;
    }
    const cancelled = cancelSandboxTask(p.taskId);
    respond(true, { ok: cancelled }, undefined);
  },

  // ─── Container Lifecycle ──────────────────────────────────────
  "republic.sandbox.start": async ({ respond }) => {
    const success = await startSandbox();
    respond(true, { ok: success, ...getSandboxPoolStatus() }, undefined);
  },

  "republic.sandbox.stop": async ({ respond }) => {
    const success = await stopSandbox();
    respond(true, { ok: success }, undefined);
  },

  "republic.sandbox.destroy": async ({ respond }) => {
    const success = await destroySandbox();
    respond(true, { ok: success }, undefined);
  },

  "republic.sandbox.build": async ({ respond }) => {
    const success = await buildSandboxImage();
    respond(true, { ok: success }, undefined);
  },

  // ─── Direct Admin Operations ──────────────────────────────────
  "republic.sandbox.exec": async ({ params, respond }) => {
    const p = params as { command?: string; cwd?: string; timeout?: number };
    if (!p.command) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "command is required"));
      return;
    }
    try {
      const result = await sandboxExec(p.command, p.cwd, p.timeout);
      respond(true, { ok: true, ...result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(
        ErrorCodes.INVALID_REQUEST,
        err instanceof Error ? err.message : String(err),
      ));
    }
  },

  "republic.sandbox.write-file": async ({ params, respond }) => {
    const p = params as { path?: string; content?: string };
    if (!p.path || p.content === undefined) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "path and content required"));
      return;
    }
    const success = await sandboxWriteFile(p.path, p.content);
    respond(true, { ok: success }, undefined);
  },

  "republic.sandbox.read-file": async ({ params, respond }) => {
    const p = params as { path?: string };
    if (!p.path) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "path is required"));
      return;
    }
    const content = await sandboxReadFile(p.path);
    respond(true, { ok: !!content, content }, undefined);
  },

  "republic.sandbox.list-files": async ({ params, respond }) => {
    const p = params as { path?: string };
    const entries = await sandboxListFiles(p.path);
    respond(true, { ok: true, entries }, undefined);
  },

  "republic.sandbox.browser": async ({ params, respond }) => {
    const p = params as { action?: string; url?: string; selector?: string; text?: string; code?: string };
    if (!p.action) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "action is required"));
      return;
    }
    try {
      const result = await sandboxBrowser({ action: p.action, url: p.url, selector: p.selector, text: p.text, code: p.code });
      respond(true, { ok: true, ...result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(
        ErrorCodes.INVALID_REQUEST,
        err instanceof Error ? err.message : String(err),
      ));
    }
  },
};
