/**
 * Phase 5 — Federation RPC Handlers
 *
 * Provides shard-aware federation management APIs via the gateway.
 * Wraps the `shard-router.ts` module for UI and external orchestration.
 *
 * Phase 6 — Citizen Agent Loop Control
 *
 * Exposes start/stop/status controls for the async LLM cognitive loops
 * that give each citizen autonomous agency between simulation ticks.
 */

import type { GatewayRequestHandlers } from "../types.js";
import {
  getCitizenLoopStatus,
  startCitizenLoop,
  startCitizenLoops,
  stopAllCitizenLoops,
  stopCitizenLoop,
  type CitizenAccessTier,
} from "../../../republic/agents/citizen-agent-loop.js";
import {
  getShardRouterStats,
  initShardRouter,
  registerPeer,
  setPeerHealth,
  type NodeEntry,
} from "../../../republic/federation/shard-router.js";
import { getState } from "../../../republic/state.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

// ── Phase 5: Federation RPC Handlers ──────────────────────────────────────────

export const federationHandlers: Partial<GatewayRequestHandlers> = {
  // Get shard router status — local shards, registered peers, routing metrics
  "republic.federation.status": ({ respond }) => {
    try {
      const stats = getShardRouterStats();
      respond(true, { federation: stats }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)),
      );
    }
  },

  // Initialize or reinitialize the shard router (e.g., after cluster reconfiguration)
  "republic.federation.init": ({ params, respond }) => {
    const p = params as { nodeId?: string; shards?: number[] } | undefined;
    const nodeId = p?.nodeId ?? `node-${Date.now()}`;
    const shards = p?.shards ?? Array.from({ length: 256 }, (_, i) => i); // Claim all by default
    try {
      initShardRouter({ nodeId, shards });
      respond(true, { ok: true, nodeId, shardCount: shards.length }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)),
      );
    }
  },

  // Register a federation peer
  "republic.federation.peer.register": ({ params, respond }) => {
    const p = params as Partial<NodeEntry> | undefined;
    if (!p?.id || !p?.host || !p?.port) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "id, host, and port required"),
      );
      return;
    }
    try {
      const entry: NodeEntry = {
        id: p.id,
        host: p.host,
        port: p.port,
        shards: p.shards ?? [],
        healthy: p.healthy ?? true,
        lastSeen: p.lastSeen ?? Date.now(),
        latencyMs: p.latencyMs,
      };
      registerPeer(entry);
      respond(true, { ok: true, peer: { id: p.id, host: p.host, port: p.port } }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)),
      );
    }
  },

  // Update peer health status (called by cluster health monitor)
  "republic.federation.peer.health": ({ params, respond }) => {
    const p = params as { nodeId?: string; healthy?: boolean; latencyMs?: number } | undefined;
    if (!p?.nodeId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "nodeId required"));
      return;
    }
    setPeerHealth(p.nodeId, p.healthy ?? true, p.latencyMs);
    respond(true, { ok: true }, undefined);
  },

  // ── Phase 6: Citizen Agent Loop Control ───────────────────────────────────

  // Get status of all running citizen autonomous loops
  "republic.agents.loops.status": ({ respond }) => {
    try {
      const status = getCitizenLoopStatus();
      respond(true, { loops: status }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)),
      );
    }
  },

  // Start loops for all (or top-N) citizens
  "republic.agents.loops.start": ({ params, respond }) => {
    const p = params as { limit?: number; tiers?: Record<string, CitizenAccessTier> } | undefined;
    try {
      const s = getState();
      const candidates = s.citizens.slice(0, p?.limit ?? s.citizens.length);
      startCitizenLoops(candidates, p?.tiers ?? {});
      const status = getCitizenLoopStatus();
      respond(true, { ok: true, loops: status }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)),
      );
    }
  },

  // Stop all citizen loops
  "republic.agents.loops.stop": ({ respond }) => {
    try {
      stopAllCitizenLoops();
      respond(true, { ok: true }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)),
      );
    }
  },

  // Start a specific citizen's loop
  "republic.agents.loop.start": ({ params, respond }) => {
    const p = params as { citizenId?: string; tier?: CitizenAccessTier } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    try {
      startCitizenLoop(p.citizenId, p.tier ?? "economy");
      respond(true, { ok: true, citizenId: p.citizenId }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)),
      );
    }
  },

  // Stop a specific citizen's loop
  "republic.agents.loop.stop": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    try {
      stopCitizenLoop(p.citizenId);
      respond(true, { ok: true, citizenId: p.citizenId }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)),
      );
    }
  },
};
