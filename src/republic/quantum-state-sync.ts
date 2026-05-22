/**
 * Republic Platform — Quantum-Entangled State Replication
 *
 * Phase 23: Quantum-inspired state synchronization between republic instances.
 *
 * Models entangled pairs of state channels that propagate changes
 * instantaneously (in concept) across distributed instances:
 *   - Entangle: create paired state channels
 *   - Propagate: sync state across entangled pairs
 *   - Collapse: resolve conflicting states to a definite value
 *   - Teleport: move complete state from one instance to another
 *   - Swarm: coordinate many instances with shared consciousness
 */

import { estimateObjectBytes } from "./byte-estimator.js";
import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type EntanglementStatus = "entangled" | "decoherent" | "collapsed" | "broken";
export type PropagationMode = "instant" | "eventual" | "causal";

export interface EntangledPair {
  id: string;
  instanceA: string;
  instanceB: string;
  channel: string;
  status: EntanglementStatus;
  coherenceScore: number; // 0-1 (1 = perfectly synchronized)
  stateVersion: number;
  lastSync: string;
  createdAt: string;
}

export interface QuantumState {
  version: number;
  data: Record<string, unknown>;
  hash: string;
  origin: string;
  timestamp: string;
}

export interface PropagationResult {
  pairId: string;
  success: boolean;
  latencyMs: number;
  stateVersion: number;
  conflictsResolved: number;
  error?: string;
}

export interface CollapseResult {
  pairId: string;
  resolvedState: QuantumState;
  strategy: "latest-wins" | "merge" | "origin-priority" | "vote";
  conflictsFound: number;
  conflictsResolved: number;
}

export interface TeleportResult {
  sourceInstance: string;
  targetInstance: string;
  stateSize: number;
  success: boolean;
  latencyMs: number;
  verificationHash: string;
}

export interface SwarmNode {
  instanceId: string;
  role: "leader" | "follower" | "candidate";
  health: number;
  lastHeartbeat: string;
  stateVersion: number;
}

export interface SwarmCoordination {
  swarmId: string;
  leader: string;
  nodes: SwarmNode[];
  consensusReached: boolean;
  coherenceScore: number;
  lastCoordination: string;
}

export interface QuantumSyncDiagnostics {
  totalPairs: number;
  activePairs: number;
  totalPropagations: number;
  totalTeleports: number;
  avgCoherence: number;
  avgLatencyMs: number;
  swarms: number;
  recentActivity: QuantumActivity[];
}

interface QuantumActivity {
  type: "entangle" | "propagate" | "collapse" | "teleport" | "swarm";
  details: string;
  timestamp: string;
  success: boolean;
}

// ─── State ──────────────────────────────────────────────────────

const entangledPairs = new Map<string, EntangledPair>();
const stateStore = new Map<string, QuantumState>();
const swarmRegistry = new Map<string, SwarmCoordination>();
const activityLog: QuantumActivity[] = [];
const MAX_ACTIVITY = 500;

function logQuantumActivity(
  type: QuantumActivity["type"],
  details: string,
  success: boolean,
): void {
  activityLog.push({ type, details, timestamp: ts(), success });
  if (activityLog.length > MAX_ACTIVITY) {
    activityLog.splice(0, activityLog.length - MAX_ACTIVITY);
  }
}

function computeHash(data: Record<string, unknown>): string {
  // Simple deterministic hash for state comparison
  const str = JSON.stringify(data, Object.keys(data).toSorted());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = (hash << 5) - hash + ch;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

// ─── Entangle ───────────────────────────────────────────────────

/**
 * Create an entangled pair between two instances.
 */
export function entangle(
  instanceA: string,
  instanceB: string,
  channel: string,
  initialState?: Record<string, unknown>,
): EntangledPair {
  const pairId = `qpair-${uid().slice(0, 8)}`;
  const state = initialState ?? {};

  const pair: EntangledPair = {
    id: pairId,
    instanceA,
    instanceB,
    channel,
    status: "entangled",
    coherenceScore: 1.0,
    stateVersion: 1,
    lastSync: ts(),
    createdAt: ts(),
  };

  entangledPairs.set(pairId, pair);

  // Store initial state for both instances
  const quantumState: QuantumState = {
    version: 1,
    data: state,
    hash: computeHash(state),
    origin: instanceA,
    timestamp: ts(),
  };
  stateStore.set(`${pairId}:${instanceA}`, quantumState);
  stateStore.set(`${pairId}:${instanceB}`, { ...quantumState, origin: instanceB });

  logQuantumActivity("entangle", `${instanceA} ↔ ${instanceB} on ${channel}`, true);
  return pair;
}

/**
 * Break an entangled pair (decoherence).
 */
export function decohere(pairId: string): boolean {
  const pair = entangledPairs.get(pairId);
  if (!pair) {
    return false;
  }

  pair.status = "decoherent";
  pair.coherenceScore = 0;
  return true;
}

// ─── Propagate ──────────────────────────────────────────────────

/**
 * Propagate state update across an entangled pair.
 */
export function propagateState(
  pairId: string,
  fromInstance: string,
  stateUpdate: Record<string, unknown>,
  mode: PropagationMode = "instant",
): PropagationResult {
  const start = Date.now();
  const pair = entangledPairs.get(pairId);

  if (!pair || pair.status !== "entangled") {
    logQuantumActivity("propagate", `Failed: pair ${pairId} not entangled`, false);
    return {
      pairId,
      success: false,
      latencyMs: Date.now() - start,
      stateVersion: 0,
      conflictsResolved: 0,
      error: pair ? `Pair is ${pair.status}` : "Pair not found",
    };
  }

  const toInstance = fromInstance === pair.instanceA ? pair.instanceB : pair.instanceA;
  const fromState = stateStore.get(`${pairId}:${fromInstance}`);
  const toState = stateStore.get(`${pairId}:${toInstance}`);

  // Merge state
  const newData = { ...fromState?.data, ...stateUpdate };
  const newVersion = (pair.stateVersion ?? 0) + 1;
  let conflicts = 0;

  // Check for conflicts
  if (toState) {
    for (const key of Object.keys(stateUpdate)) {
      if (key in (toState.data ?? {}) && toState.data[key] !== (fromState?.data ?? {})[key]) {
        conflicts++;
      }
    }
  }

  const newQuantumState: QuantumState = {
    version: newVersion,
    data: newData,
    hash: computeHash(newData),
    origin: fromInstance,
    timestamp: ts(),
  };

  // Update both sides
  stateStore.set(`${pairId}:${fromInstance}`, newQuantumState);
  stateStore.set(`${pairId}:${toInstance}`, { ...newQuantumState, origin: toInstance });

  pair.stateVersion = newVersion;
  pair.lastSync = ts();
  pair.coherenceScore = Math.max(0, 1 - conflicts * 0.1);

  const latency = mode === "instant" ? 1 : mode === "causal" ? 10 : 50;

  logQuantumActivity("propagate", `${fromInstance} → ${toInstance} (v${newVersion})`, true);

  return {
    pairId,
    success: true,
    latencyMs: latency + (Date.now() - start),
    stateVersion: newVersion,
    conflictsResolved: conflicts,
  };
}

// ─── Collapse ───────────────────────────────────────────────────

/**
 * Collapse a quantum state — resolve conflicts to a definite value.
 */
export function collapseState(
  pairId: string,
  strategy: CollapseResult["strategy"] = "latest-wins",
): CollapseResult | null {
  const pair = entangledPairs.get(pairId);
  if (!pair) {
    return null;
  }

  const stateA = stateStore.get(`${pairId}:${pair.instanceA}`);
  const stateB = stateStore.get(`${pairId}:${pair.instanceB}`);

  if (!stateA || !stateB) {
    return null;
  }

  let resolvedData: Record<string, unknown>;
  let conflictsFound = 0;
  const allKeys = new Set([...Object.keys(stateA.data), ...Object.keys(stateB.data)]);

  for (const key of allKeys) {
    if (key in stateA.data && key in stateB.data && stateA.data[key] !== stateB.data[key]) {
      conflictsFound++;
    }
  }

  switch (strategy) {
    case "latest-wins":
      resolvedData = stateA.timestamp >= stateB.timestamp ? { ...stateA.data } : { ...stateB.data };
      break;
    case "merge":
      resolvedData = { ...stateA.data, ...stateB.data };
      break;
    case "origin-priority":
      resolvedData = { ...stateB.data, ...stateA.data };
      break;
    default:
      resolvedData = { ...stateA.data };
  }

  const resolved: QuantumState = {
    version: Math.max(stateA.version, stateB.version) + 1,
    data: resolvedData,
    hash: computeHash(resolvedData),
    origin: "collapse",
    timestamp: ts(),
  };

  stateStore.set(`${pairId}:${pair.instanceA}`, resolved);
  stateStore.set(`${pairId}:${pair.instanceB}`, resolved);
  pair.status = "collapsed";
  pair.coherenceScore = 1.0;
  pair.stateVersion = resolved.version;

  logQuantumActivity("collapse", `Pair ${pairId} collapsed (${strategy})`, true);

  return {
    pairId,
    resolvedState: resolved,
    strategy,
    conflictsFound,
    conflictsResolved: conflictsFound,
  };
}

// ─── Teleport ───────────────────────────────────────────────────

/**
 * Teleport complete state from one instance to another.
 */
export function teleportState(
  sourceInstance: string,
  targetInstance: string,
  state: Record<string, unknown>,
): TeleportResult {
  const start = Date.now();

  const quantumState: QuantumState = {
    version: 1,
    data: state,
    hash: computeHash(state),
    origin: sourceInstance,
    timestamp: ts(),
  };

  const teleportId = `teleport-${uid().slice(0, 8)}`;
  stateStore.set(`${teleportId}:${targetInstance}`, quantumState);

  const result: TeleportResult = {
    sourceInstance,
    targetInstance,
    stateSize: estimateObjectBytes(state),
    success: true,
    latencyMs: Date.now() - start + 5,
    verificationHash: quantumState.hash,
  };

  logQuantumActivity(
    "teleport",
    `${sourceInstance} → ${targetInstance} (${result.stateSize}B)`,
    true,
  );
  return result;
}

// ─── Swarm ──────────────────────────────────────────────────────

/**
 * Create or join a swarm for coordinated state sharing.
 */
export function createSwarm(
  swarmId: string,
  leaderInstance: string,
  followerInstances: string[],
): SwarmCoordination {
  const nodes: SwarmNode[] = [
    {
      instanceId: leaderInstance,
      role: "leader",
      health: 100,
      lastHeartbeat: ts(),
      stateVersion: 1,
    },
    ...followerInstances.map((id) => ({
      instanceId: id,
      role: "follower" as const,
      health: 100,
      lastHeartbeat: ts(),
      stateVersion: 1,
    })),
  ];

  const coordination: SwarmCoordination = {
    swarmId,
    leader: leaderInstance,
    nodes,
    consensusReached: true,
    coherenceScore: 1.0,
    lastCoordination: ts(),
  };

  swarmRegistry.set(swarmId, coordination);
  logQuantumActivity("swarm", `Created swarm ${swarmId} with ${nodes.length} nodes`, true);
  return coordination;
}

/**
 * Propagate state to all swarm members.
 */
export function swarmBroadcast(
  swarmId: string,
  state: Record<string, unknown>,
): { success: boolean; nodesUpdated: number; error?: string } {
  const swarm = swarmRegistry.get(swarmId);
  if (!swarm) {
    return { success: false, nodesUpdated: 0, error: "Swarm not found" };
  }

  const hash = computeHash(state);
  let updated = 0;

  for (const node of swarm.nodes) {
    stateStore.set(`swarm:${swarmId}:${node.instanceId}`, {
      version: node.stateVersion + 1,
      data: state,
      hash,
      origin: swarm.leader,
      timestamp: ts(),
    });
    node.stateVersion++;
    node.lastHeartbeat = ts();
    updated++;
  }

  swarm.lastCoordination = ts();
  logQuantumActivity("swarm", `Broadcast to ${updated} nodes in ${swarmId}`, true);

  return { success: true, nodesUpdated: updated };
}

/**
 * Get entangled pair state.
 */
export function getPairState(pairId: string, instance: string): QuantumState | null {
  return stateStore.get(`${pairId}:${instance}`) ?? null;
}

/**
 * List all active entangled pairs.
 */
export function listEntangledPairs(): EntangledPair[] {
  return Array.from(entangledPairs.values());
}

// ─── Diagnostics ────────────────────────────────────────────────

export function quantumSyncDiagnostics(): QuantumSyncDiagnostics {
  const pairs = Array.from(entangledPairs.values());
  const active = pairs.filter((p) => p.status === "entangled");
  const avgCoherence =
    active.length > 0
      ? Math.round((active.reduce((s, p) => s + p.coherenceScore, 0) / active.length) * 100) / 100
      : 1;

  const propagations = activityLog.filter((a) => a.type === "propagate");
  const teleports = activityLog.filter((a) => a.type === "teleport");

  return {
    totalPairs: pairs.length,
    activePairs: active.length,
    totalPropagations: propagations.length,
    totalTeleports: teleports.length,
    avgCoherence,
    avgLatencyMs: 5,
    swarms: swarmRegistry.size,
    recentActivity: activityLog.slice(-20),
  };
}

export function resetQuantumSyncState(): void {
  entangledPairs.clear();
  stateStore.clear();
  swarmRegistry.clear();
  activityLog.length = 0;
}
