/**
 * Republic Gateway — Claude Code Ops Handlers
 *
 * Exposes the Claude Code CLI adapter as RPC methods that citizens
 * and the operator can call via the gateway WebSocket.
 *
 * Methods:
 *   republic.claude.status  — CLI availability + version (READ)
 *   republic.claude.review  — Review a file with `claude review` (WRITE)
 *   republic.claude.task    — Run an arbitrary `claude -p` task (WRITE)
 */

import type { GatewayRequestHandlers } from "../types.js";
import {
  claudeReview,
  claudeTask,
  getClaudeStatus,
  type ReviewOpts,
} from "../../../republic/claude-code-engine.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

export const claudeOpsHandlers: Partial<GatewayRequestHandlers> = {
  // ── Read: availability + version ──────────────────────────────

  "republic.claude.status": async ({ respond }) => {
    try {
      const status = await getClaudeStatus();
      respond(true, status, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  // ── Write: file review ─────────────────────────────────────────

  "republic.claude.review": async ({ params, respond }) => {
    const p = params as
      | {
          filePath?: string;
          context?: string;
          timeoutMs?: number;
        }
      | undefined;

    if (!p?.filePath) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "filePath required"));
      return;
    }

    try {
      const opts: ReviewOpts = {
        context: p.context,
        timeoutMs: p.timeoutMs,
      };
      const result = await claudeReview(p.filePath, opts);
      respond(true, { ok: true, review: result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  // ── Write: general claude task ─────────────────────────────────

  "republic.claude.task": async ({ params, respond }) => {
    const p = params as
      | {
          task?: string;
          cwd?: string;
          timeoutMs?: number;
        }
      | undefined;

    if (!p?.task || p.task.trim().length === 0) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "task string required"));
      return;
    }

    try {
      const result = await claudeTask(p.task, p.cwd, p.timeoutMs);
      respond(true, { ok: result.ok, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },
};
