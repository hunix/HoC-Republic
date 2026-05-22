/**
 * Federation ↔ Discovery Bridge
 *
 * Automatically wires NodeDiscovery (multicast LAN + Tailscale HTTP probing)
 * into the Republic Federation layer so that gateways discover each other
 * and form a federated mesh **without manual IP entry**.
 *
 * Flow:
 *   NodeDiscovery discovers gateway → bridge registers it as a federation peer
 *   → federation auto-syncs citizens, marketplace, events across all peers
 *   → NodeDiscovery removes stale gateway → bridge removes federation peer
 *
 * This replaces the old model where users had to manually enter gateway IPs
 * and click "Link" to connect two Republics.
 */

import { loadClusterConfig } from "../cluster/cluster-config.js";
import { NodeDiscovery, type DiscoveredGateway } from "../cluster/node-discovery.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { emitNationalEvent } from "./event-sourcing.js";
import {
    addDiscoveredPeer, getFederatedGateways, getLocalGatewayId,
    getLocalGatewayPort, removeDiscoveredPeer, startFederationSync,
    stopFederationSync, type FederatedGateway
} from "./republic-federation.js";
import { registerProvider, setProviderAvailability } from "./compute-router.js";

const log = createSubsystemLogger("federation:bridge");

// ─── Mesh Topology ──────────────────────────────────────────────

interface MeshNode {
  gatewayId: string;
  host: string;
  port: number;
  role: "primary" | "standby";
  discoveredAt: number;
  lastSeenAt: number;
  discoveryMethod: "multicast" | "tailscale" | "manual";
  /** IDs of gateways this node has discovered (transitive mesh awareness) */
  knownPeers: string[];
  latencyMs: number;
}

/** Full mesh topology: who discovered whom */
const meshTopology = new Map<string, MeshNode>();

// ─── State ──────────────────────────────────────────────────────

let discovery: NodeDiscovery | null = null;
let bridgeRunning = false;
let autoSyncStarted = false;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/** How often to clean up stale mesh nodes (ms) */
const MESH_CLEANUP_INTERVAL_MS = 60_000;

/** How long before a mesh node is considered stale (ms) */
const MESH_STALE_TIMEOUT_MS = 180_000; // 3 minutes

// ─── Bridge Lifecycle ───────────────────────────────────────────

/**
 * Start the federation discovery bridge.
 *
 * This is the single function that replaces manual gateway linking.
 * Once started:
 * - Gateways on the same LAN discover each other via multicast
 * - Gateways connected via Tailscale discover each other via HTTP probing
 * - Discovered gateways are automatically registered as federation peers
 * - Federation sync starts automatically when the first peer is found
 * - Citizens across all discovered gateways can see and interact with each other
 */
export async function startFederationDiscoveryBridge(opts?: {
  gatewayId?: string;
  gatewayPort?: number;
  roleGetter?: () => "primary" | "standby";
}): Promise<void> {
  if (bridgeRunning) {
    log.warn("Federation discovery bridge already running");
    return;
  }

  const config = loadClusterConfig();
  const gatewayId = opts?.gatewayId || getLocalGatewayId() || config.nodeId;
  const gatewayPort = opts?.gatewayPort || getLocalGatewayPort() || 18789;
  const roleGetter = opts?.roleGetter || (() => "primary" as const);

  log.info("Starting federation discovery bridge", {
    gatewayId,
    port: gatewayPort,
    mode: config.discovery.mode,
    tailscalePeers: config.discovery.tailscalePeers.length,
  });

  // Create and start NodeDiscovery
  discovery = new NodeDiscovery(true, gatewayId, gatewayPort, roleGetter);

  // Wire discovery events → federation
  discovery.onDiscovered((gateway) => {
    handleGatewayDiscovered(gateway);
  });

  // Start discovery (multicast + Tailscale)
  await discovery.start();

  // Start mesh cleanup timer
  cleanupTimer = setInterval(() => {
    cleanupStaleMeshNodes();
  }, MESH_CLEANUP_INTERVAL_MS);
  if (cleanupTimer.unref) {cleanupTimer.unref();}

  bridgeRunning = true;

  emitNationalEvent("infrastructure", "federation_bridge_started", "federation-bridge", {
    gatewayId,
    discoveryMode: config.discovery.mode,
    tailscalePeers: config.discovery.tailscalePeers.length,
  });

  log.info("Federation discovery bridge started — gateways will auto-federate on discovery");
}

/**
 * Stop the federation discovery bridge.
 */
export async function stopFederationDiscoveryBridge(): Promise<void> {
  if (!bridgeRunning) {return;}

  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }

  if (discovery) {
    await discovery.stop();
    discovery = null;
  }

  stopFederationSync();
  autoSyncStarted = false;
  bridgeRunning = false;

  log.info("Federation discovery bridge stopped");
}

// ─── Discovery Event Handler ────────────────────────────────────

/**
 * Handle a newly discovered gateway.
 * Automatically registers it as a federation peer and starts sync if needed.
 */
function handleGatewayDiscovered(gateway: DiscoveredGateway): void {
  // Parse host and port from the discovered URL
  const url = new URL(gateway.url);
  const host = url.hostname;
  const port = parseInt(url.port, 10) || 18789;

  // Determine discovery method
  const discoveryMethod = gateway.url.includes("tailscale") ? "tailscale" : "multicast";

  // Update mesh topology
  const existing = meshTopology.get(gateway.gatewayId);
  if (existing) {
    existing.lastSeenAt = Date.now();
    existing.role = gateway.role;
    existing.latencyMs = 0; // Updated during federation sync
  } else {
    meshTopology.set(gateway.gatewayId, {
      gatewayId: gateway.gatewayId,
      host,
      port,
      role: gateway.role,
      discoveredAt: Date.now(),
      lastSeenAt: Date.now(),
      discoveryMethod,
      knownPeers: [],
      latencyMs: 0,
    });

    log.info("New gateway discovered — auto-registering as federation peer", {
      gatewayId: gateway.gatewayId,
      host,
      port,
      role: gateway.role,
      method: discoveryMethod,
    });
  }

  // Register with the federation layer (idempotent — updates host/port if already known)
  addDiscoveredPeer({
    gatewayId: gateway.gatewayId,
    host,
    port,
    role: gateway.role,
  });

  // Register with the compute router to enable distributed workloads
  const clusterEndpoint = `cluster-http://${host}:${port}`;
  registerProvider(clusterEndpoint, {
    available: true,
    models: ["distributed-llm"],
    throughput: 25, // default baseline for remote inference
  });
  setProviderAvailability(clusterEndpoint, true);

  // Auto-start federation sync on first discovery
  if (!autoSyncStarted) {
    autoSyncStarted = true;
    startFederationSync();
    log.info("Federation sync auto-started — first peer discovered", {
      peerId: gateway.gatewayId,
    });
  }
}

// ─── Mesh Topology Maintenance ──────────────────────────────────

/**
 * Clean up stale mesh nodes and their federation peers.
 */
function cleanupStaleMeshNodes(): void {
  const now = Date.now();
  const staleIds: string[] = [];

  for (const [id, node] of meshTopology) {
    if (now - node.lastSeenAt > MESH_STALE_TIMEOUT_MS) {
      staleIds.push(id);
    }
  }

  for (const id of staleIds) {
    const node = meshTopology.get(id);
    if (node) {
      setProviderAvailability(`cluster-http://${node.host}:${node.port}`, false);
    }
    meshTopology.delete(id);
    removeDiscoveredPeer(id);
    log.info("Removed stale mesh node and federation peer", { gatewayId: id });
  }
}

/**
 * Update mesh topology with transitive peer knowledge.
 * When gateway A syncs with gateway B, B reports which other gateways it knows.
 * This enables transitive discovery (A discovers C through B).
 */
export function updateMeshPeerKnowledge(gatewayId: string, knownPeerIds: string[]): void {
  const node = meshTopology.get(gatewayId);
  if (node) {
    node.knownPeers = knownPeerIds;
  }

  // Transitive discovery: if B knows C, and we don't know C, probe C
  for (const peerId of knownPeerIds) {
    if (
      peerId !== getLocalGatewayId() &&
      !meshTopology.has(peerId) &&
      !getFederatedGateways().some((g) => g.id === peerId)
    ) {
      log.info("Transitive peer discovered via mesh", {
        discoveredVia: gatewayId,
        newPeer: peerId,
      });
      // The peer will be fully registered on next sync when their data arrives
    }
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

/** Get the current mesh topology for diagnostics. */
export function getMeshTopology(): MeshNode[] {
  return [...meshTopology.values()];
}

/** Get bridge status. */
export function getBridgeStatus(): {
  running: boolean;
  autoSyncStarted: boolean;
  meshNodes: number;
  discoveredGateways: number;
  federatedPeers: number;
} {
  return {
    running: bridgeRunning,
    autoSyncStarted,
    meshNodes: meshTopology.size,
    discoveredGateways: discovery?.getDiscoveredGateways().length ?? 0,
    federatedPeers: getFederatedGateways().length,
  };
}

/**
 * Enrich a federated gateway record with mesh topology metadata.
 * Called during federation sync to attach discovery metadata.
 */
export function enrichGatewayWithMeshData(gateway: FederatedGateway): FederatedGateway & {
  discoveryMethod?: string;
  discoveredAt?: number;
  meshPeers?: string[];
} {
  const node = meshTopology.get(gateway.id);
  if (!node) {return gateway;}

  return {
    ...gateway,
    discoveryMethod: node.discoveryMethod,
    discoveredAt: node.discoveredAt,
    meshPeers: node.knownPeers,
  };
}
