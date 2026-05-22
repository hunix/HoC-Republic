/**
 * Phase 5 — Shard-Aware RPC Router
 *
 * Provides federation-level routing for RPC calls to ensure:
 * - Citizen-specific requests route to the node that owns that citizen's shard
 * - Broadcast operations fan out to all federation nodes
 * - Read queries load-balance across healthy nodes
 * - Write operations route to the authoritative shard owner
 *
 * Shard Assignment:
 *   citizenId → shardId = hash(citizenId) % SHARD_COUNT
 *   shardId   → nodeId  = shard-map lookup
 *
 * This allows linear horizontal scaling: add more nodes to the federation,
 * rebalance shard assignments, and each node's memory footprint shrinks.
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";

const logger = createSubsystemLogger("republic:shard-router");

// ── Constants ─────────────────────────────────────────────────────────────────

/** Total shard count — fixed at cluster formation, requires rebalancing to change */
export const SHARD_COUNT = 256;

/** Current node's shard assignments (populated from federation config) */
let localShards = new Set<number>();

/** Remote node registry: nodeId → { host, port, shards, healthy, lastSeen } */
const nodes = new Map<string, NodeEntry>();

/** Local node ID */
let localNodeId = "local";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NodeEntry {
  id: string;
  host: string;
  port: number;
  shards: number[];
  healthy: boolean;
  lastSeen: number;
  latencyMs?: number;
}

export type ShardRoutingStrategy = "citizen" | "broadcast" | "load-balance" | "local-only";

export interface RoutingDecision {
  strategy: ShardRoutingStrategy;
  targetNodeId: string | null; // null = handle locally
  targetHost?: string;
  targetPort?: number;
  shardId?: number;
  fallback?: boolean;
}

export interface ShardRouterStats {
  localNodeId: string;
  localShards: number[];
  totalShards: number;
  registeredNodes: number;
  healthyNodes: number;
  localRequests: number;
  remoteRequests: number;
  broadcastCount: number;
  fallbackToLocal: number;
}

// ── Metrics ───────────────────────────────────────────────────────────────────

const metrics = {
  localRequests: 0,
  remoteRequests: 0,
  broadcastCount: 0,
  fallbackToLocal: 0,
};

// ── Hash Function ─────────────────────────────────────────────────────────────

/**
 * Deterministic hash for shard assignment.
 * Uses a Fowler–Noll–Vo (FNV-1a) variant for uniform distribution.
 */
export function hashToShard(citizenId: string): number {
  let hash = 2166136261; // FNV offset basis (uint32)
  for (let i = 0; i < citizenId.length; i++) {
    hash ^= citizenId.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // FNV prime, keep as uint32
  }
  return hash % SHARD_COUNT;
}

// ── Initialisation ────────────────────────────────────────────────────────────

/**
 * Initialize the shard router.
 * Called once at gateway startup with the local node config.
 */
export function initShardRouter(config: {
  nodeId: string;
  shards: number[];
  peers?: NodeEntry[];
}): void {
  localNodeId = config.nodeId;
  localShards = new Set(config.shards);

  if (config.peers) {
    for (const peer of config.peers) {
      nodes.set(peer.id, { ...peer, lastSeen: Date.now() });
    }
  }

  logger.info("Shard router initialized", {
    nodeId: localNodeId,
    shards: config.shards.length,
    peers: nodes.size,
  });
}

/** Register or update a federation peer */
export function registerPeer(entry: NodeEntry): void {
  nodes.set(entry.id, { ...entry, lastSeen: Date.now() });
  logger.info("Peer registered", { nodeId: entry.id, shards: entry.shards.length });
}

/** Mark a peer as healthy or unhealthy */
export function setPeerHealth(nodeId: string, healthy: boolean, latencyMs?: number): void {
  const entry = nodes.get(nodeId);
  if (entry) {
    entry.healthy = healthy;
    entry.lastSeen = Date.now();
    if (latencyMs !== undefined) {
      entry.latencyMs = latencyMs;
    }
  }
}

// ── Routing Logic ─────────────────────────────────────────────────────────────

/**
 * Determine which node should handle an RPC call.
 *
 * Strategy selection:
 * - If citizenId provided → route to shard owner
 * - If method is a read (no .create/.delete/.update) → load-balance
 * - If method is broadcast → fan-out
 * - Otherwise → local
 */
export function route(params: {
  method: string;
  citizenId?: string;
  forceBroadcast?: boolean;
}): RoutingDecision {
  const { method, citizenId, forceBroadcast } = params;

  // Broadcast strategy
  if (forceBroadcast) {
    metrics.broadcastCount++;
    return { strategy: "broadcast", targetNodeId: null };
  }

  // Citizen-shard routing
  if (citizenId) {
    const shardId = hashToShard(citizenId);

    // Check if we own this shard
    if (localShards.has(shardId)) {
      metrics.localRequests++;
      return { strategy: "citizen", targetNodeId: null, shardId };
    }

    // Find the node that owns this shard
    const owner = findShardOwner(shardId);
    if (owner && owner.healthy) {
      metrics.remoteRequests++;
      return {
        strategy: "citizen",
        targetNodeId: owner.id,
        targetHost: owner.host,
        targetPort: owner.port,
        shardId,
      };
    }

    // Fallback to local if remote is unhealthy
    logger.warn("Shard owner unhealthy — falling back to local", { shardId, citizenId });
    metrics.fallbackToLocal++;
    return { strategy: "citizen", targetNodeId: null, shardId, fallback: true };
  }

  // Read-only methods: load-balance across healthy nodes
  const isRead = !method.match(/\.(create|delete|update|set|add|remove|trigger|send|apply)$/i);
  if (isRead && nodes.size > 0) {
    const healthy = [...nodes.values()].filter((n) => n.healthy);
    if (healthy.length > 0) {
      // Round-robin: select node with lowest latency
      const selected = healthy.toSorted((a, b) => (a.latencyMs ?? 999) - (b.latencyMs ?? 999))[0];
      if (selected) {
        metrics.remoteRequests++;
        return {
          strategy: "load-balance",
          targetNodeId: selected.id,
          targetHost: selected.host,
          targetPort: selected.port,
        };
      }
    }
  }

  // Default: handle locally
  metrics.localRequests++;
  return { strategy: "local-only", targetNodeId: null };
}

/** Find the node responsible for a given shard */
function findShardOwner(shardId: number): NodeEntry | null {
  for (const node of nodes.values()) {
    if (node.shards.includes(shardId)) {
      return node;
    }
  }
  return null;
}

/** Shard router health + stats */
export function getShardRouterStats(): ShardRouterStats {
  return {
    localNodeId,
    localShards: [...localShards],
    totalShards: SHARD_COUNT,
    registeredNodes: nodes.size,
    healthyNodes: [...nodes.values()].filter((n) => n.healthy).length,
    ...metrics,
  };
}

/**
 * Mark all shards in [startShard, endShard) as locally owned.
 * Used for resharding after adding/removing nodes.
 */
export function claimShards(start: number, end: number): void {
  for (let i = start; i < end; i++) {
    localShards.add(i);
  }
  logger.info("Shards claimed", { start, end, totalLocal: localShards.size });
}

/** Remove shards from local ownership (for rebalancing to a new node) */
export function releaseShards(start: number, end: number): void {
  for (let i = start; i < end; i++) {
    localShards.delete(i);
  }
  logger.info("Shards released", { start, end, totalLocal: localShards.size });
}

// ── Distributed Event Replication ─────────────────────────────────────────────

export interface ReplicatedEvent {
  id: string;
  type: string;
  payload: unknown;
  sourceNodeId: string;
  tick: number;
  ts: number;
  shardId?: number;
}

type EventReplicationHandler = (event: ReplicatedEvent) => void | Promise<void>;
const replicationHandlers = new Map<string, EventReplicationHandler>();

/** Register a handler for replicated events of a given type */
export function onReplicatedEvent(eventType: string, handler: EventReplicationHandler): void {
  replicationHandlers.set(eventType, handler);
}

/** Dispatch a replicated event from a remote node */
export async function dispatchReplicatedEvent(event: ReplicatedEvent): Promise<void> {
  const handler = replicationHandlers.get(event.type) ?? replicationHandlers.get("*");
  if (handler) {
    await Promise.resolve(handler(event));
  } else {
    logger.warn("No handler for replicated event", { type: event.type });
  }
}

/** Build a replication event for a local state change to fan out to peers */
export function buildReplicationEvent(
  type: string,
  payload: unknown,
  tick: number,
  citizenId?: string,
): ReplicatedEvent {
  return {
    id: `${localNodeId}-${tick}-${Date.now()}`,
    type,
    payload,
    sourceNodeId: localNodeId,
    tick,
    ts: Date.now(),
    shardId: citizenId ? hashToShard(citizenId) : undefined,
  };
}
