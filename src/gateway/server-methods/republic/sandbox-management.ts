/**
 * Sandbox Management RPC Handlers
 *
 * Gateway handlers for managing specialized sandbox containers,
 * session replays, and deployment tunnels from the hoc-ui.
 */

import type { GatewayRequestHandlers } from "../types.js";

export const sandboxManagementHandlers: GatewayRequestHandlers = {
  // ─── Multi-Sandbox Management ──────────────────────────────────

  "republic.sandbox.types": async ({ respond }) => {
    const { listSandboxTypes } = await import("../../../republic/multi-sandbox.js");
    respond(true, { ok: true, types: listSandboxTypes() }, undefined);
  },

  "republic.sandbox.status": async ({ respond }) => {
    // Merge multi-sandbox status with agent-sandbox pool status for backward compat
    const { getAllSandboxStatus } = await import("../../../republic/multi-sandbox.js");
    const { getSandboxPoolStatus } = await import("../../../republic/agent-sandbox.js");
    respond(true, { ok: true, sandboxes: getAllSandboxStatus(), ...getSandboxPoolStatus() }, undefined);
  },

  "republic.sandbox.start": async ({ params, respond }) => {
    const { type = "exec" } = (params ?? {}) as { type?: string };
    // If no type given or type is the default exec, use the agent-sandbox pool
    if (type === "exec") {
      const { startSandbox, getSandboxPoolStatus } = await import("../../../republic/agent-sandbox.js");
      const success = await startSandbox();
      respond(true, { ok: success, type, ...getSandboxPoolStatus() }, undefined);
      return;
    }
    const { startSpecializedSandbox } = await import("../../../republic/multi-sandbox.js");
    const started = await startSpecializedSandbox(type as "exec" | "playwright" | "comfyui" | "ml");
    respond(true, { ok: started, type }, undefined);
  },

  "republic.sandbox.stop": async ({ params, respond }) => {
    const { type = "exec" } = (params ?? {}) as { type?: string };
    if (type === "exec") {
      const { stopSandbox } = await import("../../../republic/agent-sandbox.js");
      const success = await stopSandbox();
      respond(true, { ok: success, type }, undefined);
      return;
    }
    const { stopSpecializedSandbox } = await import("../../../republic/multi-sandbox.js");
    const stopped = await stopSpecializedSandbox(type as "exec" | "playwright" | "comfyui" | "ml");
    respond(true, { ok: stopped, type }, undefined);
  },

  "republic.sandbox.exec": async ({ params, respond }) => {
    const { type, command, timeout = 300 } = params as { type: string; command: string; timeout?: number };
    const { execInSandbox } = await import("../../../republic/multi-sandbox.js");
    const result = await execInSandbox(type as "exec" | "playwright" | "comfyui" | "ml", command, timeout);
    respond(true, { ...result }, undefined);
  },

  // ─── Session Replay ────────────────────────────────────────────

  "republic.sandbox.replays.list": async ({ params, respond }) => {
    const { limit = 50 } = (params ?? {}) as { limit?: number };
    const { listReplaySessions } = await import("../../../republic/agent-session-replay.js");
    respond(true, { ok: true, sessions: listReplaySessions(limit) }, undefined);
  },

  "republic.sandbox.replays.get": async ({ params, respond }) => {
    const { sessionId } = params as { sessionId: string };
    const { getSessionActions, getSessionSummary } = await import("../../../republic/agent-session-replay.js");
    const summary = getSessionSummary(sessionId);
    const actions = getSessionActions(sessionId);
    respond(true, { ok: true, summary, actions }, undefined);
  },

  // ─── Deployment Tunnels ────────────────────────────────────────

  "republic.sandbox.tunnels.list": async ({ respond }) => {
    const { listTunnels, isCloudflaredAvailable } = await import("../../../republic/deploy-tunnel.js");
    respond(true, { ok: true, tunnels: listTunnels(), cloudflaredAvailable: isCloudflaredAvailable() }, undefined);
  },

  "republic.sandbox.tunnels.start": async ({ params, respond }) => {
    const { name, port } = params as { name: string; port: number };
    const { startTunnel } = await import("../../../republic/deploy-tunnel.js");
    const publicUrl = await startTunnel(name, port);
    respond(true, { ok: !!publicUrl, publicUrl }, undefined);
  },

  "republic.sandbox.tunnels.stop": async ({ params, respond }) => {
    const { name } = params as { name: string };
    const { stopTunnel } = await import("../../../republic/deploy-tunnel.js");
    respond(true, { ok: stopTunnel(name) }, undefined);
  },
};
