/**
 * Distributed Docker Orchestration — Phase 3
 *
 * Proxies Docker commands (list, exec, launch, remove) to remote cluster nodes
 * via HTTP. Enables managing containers on any node from any node.
 *
 * Uses the existing Tailscale/LAN discovery to locate peers,
 * and the cluster auth (HMAC-SHA256) for request verification.
 */

import crypto from "node:crypto";
import { createSubsystemLogger } from "../logging.js";
import { loadClusterConfig } from "./cluster-config.js";
import { getStateStore } from "./redis-state-store.js";

const logger = createSubsystemLogger("cluster:remote-docker");

// ─── Types ──────────────────────────────────────────────────────

export interface RemoteContainer {
  id: string;
  name?: string;
  image?: string;
  status: string;
  nodeId: string;
  nodeHost: string;
  labels?: Record<string, string>;
}

interface DockerProxyResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

// ─── Request Signing ────────────────────────────────────────────

function signRequest(payload: string): string {
  const config = loadClusterConfig();
  const secret = config.encryption.clusterSecret;
  if (!secret) { return ""; }
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

// ─── Remote Docker Proxy ────────────────────────────────────────

/**
 * Fetch Docker container list from a remote node.
 */
export async function listRemoteContainers(
  nodeHost: string,
  nodePort: number,
): Promise<RemoteContainer[]> {
  try {
    const url = `http://${nodeHost}:${nodePort}/cluster/docker/list`;
    const sig = signRequest("list");
    const resp = await fetch(url, {
      headers: { "X-Cluster-Sig": sig, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) { return []; }
    const body = (await resp.json()) as DockerProxyResponse<RemoteContainer[]>;
    return body.data ?? [];
  } catch (err) {
    logger.debug(`Failed to list containers on ${nodeHost}:${nodePort}: ${String(err)}`);
    return [];
  }
}

/**
 * Execute a command inside a container on a remote node.
 */
export async function execRemoteCommand(
  nodeHost: string,
  nodePort: number,
  containerId: string,
  command: string,
): Promise<string> {
  const url = `http://${nodeHost}:${nodePort}/cluster/docker/exec`;
  const payload = JSON.stringify({ containerId, command });
  const sig = signRequest(payload);

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cluster-Sig": sig,
    },
    body: payload,
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    throw new Error(`Remote exec failed: ${resp.statusText}`);
  }

  const body = (await resp.json()) as DockerProxyResponse<{ output: string }>;
  if (!body.ok) { throw new Error(body.error ?? "Remote exec failed"); }
  return body.data?.output ?? "";
}

/**
 * Launch a Docker preset on a remote node.
 */
export async function launchRemotePreset(
  nodeHost: string,
  nodePort: number,
  preset: string,
  purpose: string,
): Promise<RemoteContainer | null> {
  const url = `http://${nodeHost}:${nodePort}/cluster/docker/launch`;
  const payload = JSON.stringify({ preset, purpose });
  const sig = signRequest(payload);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cluster-Sig": sig,
      },
      body: payload,
      signal: AbortSignal.timeout(60_000),
    });

    if (!resp.ok) { return null; }
    const body = (await resp.json()) as DockerProxyResponse<RemoteContainer>;
    return body.data ?? null;
  } catch (err) {
    logger.warn(`Failed to launch preset on ${nodeHost}: ${String(err)}`);
    return null;
  }
}

/**
 * Remove a container on a remote node.
 */
export async function removeRemoteContainer(
  nodeHost: string,
  nodePort: number,
  containerId: string,
): Promise<boolean> {
  const url = `http://${nodeHost}:${nodePort}/cluster/docker/remove`;
  const payload = JSON.stringify({ containerId });
  const sig = signRequest(payload);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cluster-Sig": sig,
      },
      body: payload,
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) { return false; }
    const body = (await resp.json()) as DockerProxyResponse;
    return body.ok;
  } catch {
    return false;
  }
}

/**
 * Aggregate containers from ALL cluster nodes (local + remote).
 * Returns a unified list with node attribution.
 */
export async function listAllContainersAcrossCluster(): Promise<RemoteContainer[]> {
  const all: RemoteContainer[] = [];

  // Local containers
  try {
    const docker = await import("../republic/docker-orchestrator.js");
    const local = docker.listContainers();
    const config = loadClusterConfig();
    for (const c of local) {
      all.push({
        id: c.id ?? "unknown",
        name: c.name,
        image: c.image,
        status: c.status ?? "unknown",
        nodeId: config.nodeId,
        nodeHost: "localhost",
        labels: c.labels,
      });
    }
  } catch {
    logger.debug("Local Docker not available");
  }

  // Remote containers from all registered gateways
  try {
    const store = getStateStore();
    const gateways = await store.getAllGateways();
    const config = loadClusterConfig();

    const remoteProbes = gateways
      .filter((g) => g.id !== config.nodeId) // skip self
      .map(async (g) => {
        const containers = await listRemoteContainers(g.host, g.port);
        for (const c of containers) {
          c.nodeId = g.id;
          c.nodeHost = g.host;
        }
        return containers;
      });

    const results = await Promise.allSettled(remoteProbes);
    for (const r of results) {
      if (r.status === "fulfilled") {
        all.push(...r.value);
      }
    }
  } catch {
    logger.debug("Redis not available for remote node lookup");
  }

  return all;
}
