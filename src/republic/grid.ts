/**
 * Republic Platform — Grid / Swarm Engine
 *
 * Real infrastructure: peer nodes from cluster, OS metrics from node:os.
 * Swarm objectives and gossip are republic state.
 */

import os from "node:os";
import { buildSwarmStatus } from "./swarm-intelligence.js";
import type { RepublicState } from "./types.js";
import { pick, rand, ts, uid } from "./utils.js";

// ─── Cluster Context (passed in from the RPC handler) ────────────

export interface GridClusterContext {
  clusterManager?: {
    getPeers?: () => Array<{
      id: string;
      host: string;
      port: number;
      role: string;
      healthy: boolean;
      lastHeartbeat: number;
      uptime?: number;
    }>;
    getRole?: () => string;
    getGatewayId?: () => string;
    isPrimary?: () => boolean;
  };
  nodeRegistry?: {
    listConnected?: () => Array<{
      id: string;
      name?: string;
      host?: string;
      capabilities?: string[];
      status?: string;
      lastSeen?: number;
      cpuUsage?: number;
      memoryUsageMB?: number;
      gpuAvailable?: boolean;
    }>;
  };
}

// ─── Grid Operations (swarm objectives are real state) ───────────

/** Create a new swarm objective. */
export function createObjective(s: RepublicState, type: string, description: string): { ok: boolean; objective?: unknown; error?: string } {
  if (!type || !description) {return { ok: false, error: "type and description required" };}
  const objective = {
    id: uid(),
    type,
    description,
    progress: 0,
    assignedPeers: Math.min(s.peers.length, rand(1, 3)),
    startedAt: Date.now(),
    tasks: [] as Array<{ id: string; type: string; status: "Pending"; assignedTo: string; progress: number }>,
  };
  // Auto-create initial sub-task
  if (s.peers.length > 0) {
    objective.tasks.push({
      id: uid(),
      type: type.toLowerCase(),
      status: "Pending",
      assignedTo: pick(s.peers).id,
      progress: 0,
    });
  }
  s.objectives.push(objective);
  return { ok: true, objective };
}

/** Remove a swarm objective. */
export function removeObjective(s: RepublicState, objectiveId: string): { ok: boolean; error?: string } {
  const idx = s.objectives.findIndex((o) => o.id === objectiveId);
  if (idx < 0) {return { ok: false, error: "objective not found" };}
  s.objectives.splice(idx, 1);
  return { ok: true };
}

/** Elect a new grid leader. */
export function electLeader(s: RepublicState): { ok: boolean; leaderId?: string } {
  for (const p of s.peers) {p.isLeader = false;}
  const newLeader = pick(s.peers);
  newLeader.isLeader = true;
  s.leaderId = newLeader.id;
  s.gossipLog.unshift({
    from: newLeader.id, type: "leader_elected",
    payload: `${newLeader.endpoint} elected as new leader`, timestamp: ts(),
  });
  return { ok: true, leaderId: newLeader.id };
}

/** Sync all peers. */
export function syncGrid(s: RepublicState): void {
  for (const p of s.peers) {p.lastSeen = ts();}
  s.gossipLog.unshift({
    from: s.leaderId ?? s.peers[0]?.id ?? "unknown", type: "full_sync",
    payload: `Synced ${s.citizens.length} agents across ${s.peers.length} nodes`, timestamp: ts(),
  });
  if (s.gossipLog.length > 50) {s.gossipLog.length = 50;}
}

// ─── Real OS Metrics Helpers ─────────────────────────────────────

/** Get the real CPU usage percentage using os.cpus() delta-style. */
function getCpuUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  }
  // point-in-time idle ratio (instantaneous snapshot)
  return totalTick > 0 ? (totalTick - totalIdle) / totalTick : 0;
}

/** Get real memory usage as a 0.0–1.0 ratio. */
function getMemoryUsage(): number {
  const total = os.totalmem();
  const free = os.freemem();
  return total > 0 ? (total - free) / total : 0;
}

// ─── Grid Status Builder ────────────────────────────────────────

/** Build grid status using real cluster/OS data. */
export function buildGridStatus(s: RepublicState, cluster?: GridClusterContext) {
  if (!s.objectives) {s.objectives = [];}
  if (!s.gossipLog) {s.gossipLog = [];}
  if (!s.peers) {s.peers = [];}
  if (!s.citizens) {s.citizens = [];}

  const cpuUsage = getCpuUsage();
  const memoryUsage = getMemoryUsage();
  const hostname = os.hostname();
  const uptime = Math.round(os.uptime());

  // ── Build peers from real cluster or local-only ──
  let peers: Array<{
    id: string;
    endpoint: string;
    capabilities: string[];
    agentCount: number;
    cpuUsage: number;
    memoryUsage: number;
    lastSeen: number;
    isLeader: boolean;
  }>;

  const clusterPeers = cluster?.clusterManager?.getPeers?.() ?? [];
  const nodes = cluster?.nodeRegistry?.listConnected?.() ?? [];
  const role = cluster?.clusterManager?.getRole?.() ?? "standalone";
  const gatewayId = cluster?.clusterManager?.getGatewayId?.() ?? "local";
  const isPrimary = cluster?.clusterManager?.isPrimary?.() ?? true;

  if (clusterPeers.length > 0 || nodes.length > 0) {
    // Real cluster mode — use actual cluster peers and discovered nodes
    peers = [];

    // Add cluster gateway peers
    for (const p of clusterPeers) {
      peers.push({
        id: p.id,
        endpoint: `${p.host}:${p.port}`,
        capabilities: ["compute", "gateway", "storage"],
        agentCount: 0, // Will be enriched from node registry
        cpuUsage: 0, // Gateway peers don't expose CPU directly
        memoryUsage: 0,
        lastSeen: p.lastHeartbeat,
        isLeader: p.role === "primary" || p.role === "leader",
      });
    }

    // Add discovered nodes with their real metrics
    for (const n of nodes) {
      // Don't duplicate if already listed as a cluster peer
      const exists = peers.some((p) => p.id === n.id);
      if (exists) {continue;}

      peers.push({
        id: n.id,
        endpoint: n.host ?? n.name ?? n.id,
        capabilities: n.capabilities ?? ["compute"],
        agentCount: 0,
        cpuUsage: (n.cpuUsage ?? 0) / 100, // Node registry reports 0-100
        memoryUsage: 0,
        lastSeen: n.lastSeen ?? Date.now(),
        isLeader: false,
      });
    }

    // Ensure the local node is always present
    const localExists = peers.some((p) => p.id === gatewayId || p.id === "local-primary");
    if (!localExists) {
      peers.unshift({
        id: gatewayId,
        endpoint: hostname,
        capabilities: ["compute", "gateway", "storage"],
        agentCount: s.citizens.length,
        cpuUsage,
        memoryUsage,
        lastSeen: Date.now(),
        isLeader: isPrimary,
      });
    }
  } else {
    // Standalone mode — show this machine as the single node with REAL metrics
    peers = [
      {
        id: gatewayId,
        endpoint: hostname,
        capabilities: ["compute", "gateway", "storage"],
        agentCount: s.citizens.length,
        cpuUsage,
        memoryUsage,
        lastSeen: Date.now(),
        isLeader: true,
      },
    ];
  }

  return {
    peers,
    objectives: s.objectives.map((o) => ({
      id: o.id,
      type: o.type,
      description: o.description,
      progress: o.progress,
      assignedPeers: o.assignedPeers,
      tasksTotal: o.tasks.length,
      tasksCompleted: o.tasks.filter((t) => t.status === "Completed").length,
      startedAt: o.startedAt,
    })),
    recentGossip: s.gossipLog.slice(-20).map((g) => ({
      id: uid(),
      type: g.type,
      sourceNode: g.from,
      timestamp: new Date(g.timestamp).getTime(),
      propagated: true,
    })),
    totalAgentsAcrossGrid: s.citizens.length,
    gossipRounds: s.gossipLog.length,
    clusterRole: role,
    systemInfo: {
      hostname,
      platform: os.platform(),
      arch: os.arch(),
      cpuCores: os.cpus().length,
      totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024),
      freeMemoryMB: Math.round(os.freemem() / 1024 / 1024),
      uptime,
      nodeVersion: process.version,
    },
    // Phase 4: Swarm Intelligence overlay
    swarm: buildSwarmStatus(s),
  };
}
