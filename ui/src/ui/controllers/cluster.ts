/**
 * Cluster Controller
 *
 * Manages cluster-level infrastructure state: gateway cluster, connected nodes,
 * Docker containers, local runtimes (Ollama, LM Studio, BitNet), and n8n workflows.
 */

import type { GatewayBrowserClient } from "../gateway.ts";
import { loadDocker } from "./republic.ts";

// ─── Types ─────────────────────────────────────────────────────

export interface GatewayPeer {
  id: string;
  host: string;
  port: number;
  role: "leader" | "follower";
  healthy: boolean;
  lastHeartbeat: number;
  uptime: number;
}

export interface ClusterNode {
  id: string;
  name: string;
  host: string;
  capabilities: string[];
  status: "online" | "offline" | "degraded";
  lastSeen: number;
  cpuUsage?: number;
  memoryUsageMB?: number;
  gpuAvailable?: boolean;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: "running" | "stopped" | "restarting" | "exited";
  ports: string[];
  created: number;
  uptime?: number;
}

export interface RuntimeInfo {
  name: string;
  type: "ollama" | "lmstudio" | "docker" | "bitnet";
  status: "available" | "unavailable" | "starting";
  endpoint?: string;
  models?: string[];
  version?: string;
}

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  nodes: number;
}

export interface N8nStatus {
  available: boolean;
  url?: string;
  version?: string;
  workflows: N8nWorkflow[];
}

export interface FederatedPeerInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  citizenCount: number;
  status: "online" | "offline" | "syncing";
  latencyMs: number;
  totalVramGB: number;
  totalRamGB: number;
  lastSyncAt: string;
}

export interface FederationState {
  enabled: boolean;
  tailscalePeers: string[];
  peers: FederatedPeerInfo[];
  remoteCitizenCount: number;
  events: Array<{ type: string; description: string; timestamp: string }>;
  marketplaceListings: number;
  stats: Record<string, unknown> | null;
}

export interface ClusterState {
  client: GatewayBrowserClient | null;
  connected: boolean;
  clusterLoading: boolean;
  clusterError: string | null;
  gatewayPeers: GatewayPeer[];
  gatewayRole: "leader" | "follower" | "standalone";
  clusterNodes: ClusterNode[];
  dockerContainers: DockerContainer[];
  dockerAvailable: boolean;
  runtimes: RuntimeInfo[];
  n8nStatus: N8nStatus | null;
  federation: FederationState;
}

export const CLUSTER_STATE_DEFAULTS: Omit<ClusterState, "client" | "connected"> = {
  clusterLoading: false,
  clusterError: null,
  gatewayPeers: [],
  gatewayRole: "standalone",
  clusterNodes: [],
  dockerContainers: [],
  dockerAvailable: false,
  runtimes: [],
  n8nStatus: null,
  federation: {
    enabled: false,
    tailscalePeers: [],
    peers: [],
    remoteCitizenCount: 0,
    events: [],
    marketplaceListings: 0,
    stats: null,
  },
};

// ─── Helpers ───────────────────────────────────────────────────

async function clusterRpc<T = unknown>(
  state: ClusterState,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T | null> {
  if (!state.client || !state.connected) {return null;}
  try {
    const res = await state.client.request(method, params);
    return res as T;
  } catch (err) {
    state.clusterError = `${method} failed: ${String(err)}`;
    return null;
  }
}

// ─── Loaders ───────────────────────────────────────────────────

export async function loadCluster(state: ClusterState): Promise<void> {
  if (!state.client || !state.connected || state.clusterLoading) {return;}
  state.clusterLoading = true;
  state.clusterError = null;
  try {
    const res = await clusterRpc<{
      peers: GatewayPeer[];
      role: "leader" | "follower" | "standalone";
      nodes: ClusterNode[];
      docker: { available: boolean; containers: DockerContainer[] };
      runtimes: RuntimeInfo[];
      n8n: N8nStatus | null;
    }>(state, "cluster.status", {});

    if (res) {
      state.gatewayPeers = res.peers ?? [];
      state.gatewayRole = res.role ?? "standalone";
      state.clusterNodes = res.nodes ?? [];
      state.dockerAvailable = res.docker?.available ?? false;
      state.dockerContainers = res.docker?.containers ?? [];
      state.runtimes = res.runtimes ?? [];
      state.n8nStatus = res.n8n ?? null;
    }
  } finally {
    state.clusterLoading = false;
  }
}

// ─── Docker Actions ────────────────────────────────────────────

export async function startContainer(state: ClusterState, containerId: string): Promise<void> {
  await clusterRpc(state, "cluster.docker.start", { containerId });
  await loadCluster(state);
}

export async function stopContainer(state: ClusterState, containerId: string): Promise<void> {
  await clusterRpc(state, "cluster.docker.stop", { containerId });
  await loadCluster(state);
}

export async function removeContainer(state: ClusterState, containerId: string): Promise<void> {
  await clusterRpc(state, "cluster.docker.remove", { containerId });
  await loadCluster(state);
}

export async function deployPreset(state: ClusterState, preset: string): Promise<void> {
  await clusterRpc(state, "cluster.docker.deploy", { preset });
  await loadCluster(state);
  // Also refresh Docker tab state so the new container appears immediately
  try {
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    await loadDocker(state as any, { quiet: true });
  } catch {
    /* Docker tab state may not be initialized */
  }
}

// ─── n8n Actions ───────────────────────────────────────────────

export async function toggleN8nWorkflow(
  state: ClusterState,
  workflowId: string,
  active: boolean,
): Promise<void> {
  await clusterRpc(state, "cluster.n8n.workflow.toggle", { workflowId, active });
  await loadCluster(state);
}

export async function triggerN8nWorkflow(
  state: ClusterState,
  workflowId: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  await clusterRpc(state, "cluster.n8n.workflow.trigger", { workflowId, payload });
}

// ─── Federation Actions ────────────────────────────────────────

export async function loadFederation(state: ClusterState): Promise<void> {
  const res = await clusterRpc<FederationState & { tailscalePeers: string[] }>(
    state,
    "cluster.federation.status",
  );
  if (res) {
    state.federation = {
      enabled: res.enabled ?? false,
      tailscalePeers: res.tailscalePeers ?? [],
      peers: (res.peers) ?? [],
      remoteCitizenCount: res.remoteCitizenCount ?? 0,
      events: (res.events) ?? [],
      marketplaceListings: res.marketplaceListings ?? 0,
      stats: res.stats ?? null,
    };
  }
}

export async function setFederationPeers(state: ClusterState, peers: string[]): Promise<void> {
  await clusterRpc(state, "cluster.federation.setPeers", { peers });
  await loadFederation(state);
}

export async function removeFederationPeer(state: ClusterState, ip: string): Promise<void> {
  await clusterRpc(state, "cluster.federation.removePeer", { ip });
  await loadFederation(state);
}
