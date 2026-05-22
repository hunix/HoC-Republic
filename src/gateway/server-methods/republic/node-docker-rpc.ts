/**
 * Node Docker RPC — Remote Docker Management
 *
 * Proxies Docker operations to a specified remote node via `node.invoke`.
 * When nodeId is "local" or empty, falls through to local Docker orchestrator.
 *
 * Enables the UI to pick any connected node and manage Docker on it:
 * list/start/stop/remove containers, launch presets, pull images, etc.
 */

import net from "node:net";
import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  ensureDocker,
  listContainers,
  startContainer,
  stopContainer,
  removeContainer,
  getContainerLogs,
  listImages,
  pullImage,
  removeImage,
  imageExists,
  initResourceBudget,
  createContainer,
  CONTAINER_PRESETS,
  launchPreset,
  getDockerDiagnostics,
} from "../../../republic/docker-orchestrator.js";
import { loadConfig } from "../../../config/config.js";

// ─── Redis Helpers ─────────────────────────────────────────────

/** The stable container name for the gateway-managed Redis instance */
const HOC_REDIS_CONTAINER_NAME = "hoc-redis-cluster";

/**
 * Probe whether Redis is reachable at the given host:port via TCP (2s timeout).
 */
function redisTcpProbe(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
    socket.on("error", () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

/**
 * Poll redisTcpProbe every 500 ms until ready or maxWaitMs exceeded.
 */
async function pollRedisReady(host: string, port: number, maxWaitMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await redisTcpProbe(host, port)) { return true; }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ─── Helper: Route to local or remote ──────────────────────────

interface NodeDockerParams {
  nodeId?: string;
  [key: string]: unknown;
}

function isLocal(nodeId?: string): boolean {
  if (!nodeId || nodeId === "local" || nodeId === "self" || nodeId === "local-primary" || nodeId === "gateway-local") {
    return true;
  }
  const cfg = loadConfig() as Record<string, unknown>;
  const gatewayNodeId = (cfg.nodeId as string) ?? (cfg.gatewayId as string) ?? "gateway-local";
  return nodeId === gatewayNodeId;
}

/**
 * Invoke a Docker command on a remote node via the node.invoke RPC.
 * Falls back to local execution when nodeId is "local".
 */
async function invokeNodeDocker(
  context: unknown,
  nodeId: string,
  command: string,
  params: Record<string, unknown> = {},
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const ctx = context as { nodeRegistry: { invoke: (opts: { nodeId: string; command: string; params?: unknown; timeoutMs?: number }) => Promise<{ ok: boolean; payload?: unknown; payloadJSON?: string | null; error?: { message?: string } | null }> } };
    const result = await ctx.nodeRegistry.invoke({
      nodeId,
      command: `docker.${command}`,
      params,
      timeoutMs: 30_000,
    });

    if (!result.ok) {
      return { ok: false, error: result.error?.message ?? "Node invoke failed" };
    }

    const payload = result.payloadJSON
      ? JSON.parse(result.payloadJSON)
      : result.payload;

    return { ok: true, data: payload };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Handlers ──────────────────────────────────────────────────

export const nodeDockerRpcHandlers: Partial<GatewayRequestHandlers> = {
  /**
   * Docker status + resource budget on target node
   */
  "republic.node.docker.status": async ({ params, respond, context }) => {
    const p = (params ?? {}) as NodeDockerParams;

    if (isLocal(p.nodeId)) {
      const diag = getDockerDiagnostics();
      respond(true, {
        ok: true,
        nodeId: "local",
        available: diag.available,
        error: diag.error,
        budget: diag.budget,
        presets: diag.presets,
      }, undefined);
      return;
    }

    const result = await invokeNodeDocker(context, p.nodeId!, "status");
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Node unreachable"));
      return;
    }
    respond(true, { ok: true, nodeId: p.nodeId, ...(result.data as object) }, undefined);
  },

  /**
   * List containers on target node
   */
  "republic.node.docker.containers.list": async ({ params, respond, context }) => {
    const p = (params ?? {}) as NodeDockerParams;

    if (isLocal(p.nodeId)) {
      const containers = listContainers(false);
      const mapped = containers.map((c) => ({
        id: c.id,
        name: c.name,
        image: c.image,
        status: (c.status === "created" ? "stopped" : c.status) as string,
        state: c.status,
        ports: c.ports.join(", "),
        uptime: c.startedAt ? `since ${new Date(c.startedAt).toLocaleTimeString()}` : undefined,
        created: c.createdAt ? Math.floor(new Date(c.createdAt).getTime() / 1000) : undefined,
        labels: c.labels,
        nodeId: "local",
      }));
      respond(true, { ok: true, containers: mapped }, undefined);
      return;
    }

    const result = await invokeNodeDocker(context, p.nodeId!, "containers.list", {
      all: true,
    });
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Node unreachable"));
      return;
    }

    // Tag each container with the nodeId
    const data = result.data as { containers?: unknown[] } | undefined;
    const containers = (data?.containers ?? []) as Record<string, unknown>[];
    for (const c of containers) {
      c.nodeId = p.nodeId;
    }

    respond(true, { ok: true, containers }, undefined);
  },

  /**
   * Start container on target node
   */
  "republic.node.docker.containers.start": async ({ params, respond, context }) => {
    const p = (params ?? {}) as NodeDockerParams & { id?: string };
    if (!p.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }

    if (isLocal(p.nodeId)) {
      const ok = await startContainer(p.id);
      respond(ok, ok ? { ok: true } : undefined, ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, "Failed to start"));
      return;
    }

    const result = await invokeNodeDocker(context, p.nodeId!, "containers.start", { id: p.id });
    respond(result.ok, result.ok ? { ok: true } : undefined, result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Failed"));
  },

  /**
   * Stop container on target node
   */
  "republic.node.docker.containers.stop": async ({ params, respond, context }) => {
    const p = (params ?? {}) as NodeDockerParams & { id?: string };
    if (!p.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }

    if (isLocal(p.nodeId)) {
      const ok = await stopContainer(p.id);
      respond(ok, ok ? { ok: true } : undefined, ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, "Failed to stop"));
      return;
    }

    const result = await invokeNodeDocker(context, p.nodeId!, "containers.stop", { id: p.id });
    respond(result.ok, result.ok ? { ok: true } : undefined, result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Failed"));
  },

  /**
   * Remove container on target node
   */
  "republic.node.docker.containers.remove": async ({ params, respond, context }) => {
    const p = (params ?? {}) as NodeDockerParams & { id?: string; force?: boolean };
    if (!p.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }

    if (isLocal(p.nodeId)) {
      const ok = await removeContainer(p.id, p.force ?? false);
      respond(ok, ok ? { ok: true } : undefined, ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, "Failed to remove"));
      return;
    }

    const result = await invokeNodeDocker(context, p.nodeId!, "containers.remove", { id: p.id, force: p.force ?? false });
    respond(result.ok, result.ok ? { ok: true } : undefined, result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Failed"));
  },

  /**
   * Get container logs from target node
   */
  "republic.node.docker.containers.logs": async ({ params, respond, context }) => {
    const p = (params ?? {}) as NodeDockerParams & { id?: string; lines?: number };
    if (!p.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }

    if (isLocal(p.nodeId)) {
      const logs = getContainerLogs(p.id, p.lines ?? 200);
      respond(true, { ok: true, logs }, undefined);
      return;
    }

    const result = await invokeNodeDocker(context, p.nodeId!, "containers.logs", { id: p.id, lines: p.lines ?? 200 });
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Failed"));
      return;
    }
    respond(true, { ok: true, ...(result.data as object) }, undefined);
  },

  /**
   * List available presets on target node
   */
  "republic.node.docker.presets.list": async ({ params, respond, context }) => {
    const p = (params ?? {}) as NodeDockerParams;

    if (isLocal(p.nodeId)) {
      const presets = Object.entries(CONTAINER_PRESETS).map(([name, cfg]) => ({
        name,
        image: cfg.image,
        description: `${cfg.memoryLimit ?? "?"} RAM, ${cfg.cpuLimit ?? "?"} CPU${cfg.gpus ? " · GPU" : ""}`,
        gpu: !!cfg.gpus,
        category: categorizePreset(name),
      }));
      respond(true, { ok: true, presets }, undefined);
      return;
    }

    const result = await invokeNodeDocker(context, p.nodeId!, "presets.list");
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Failed"));
      return;
    }
    respond(true, { ok: true, ...(result.data as object) }, undefined);
  },

  /**
   * Launch a preset on target node
   */
  "republic.node.docker.presets.launch": async ({ params, respond, context }) => {
    const p = (params ?? {}) as NodeDockerParams & { name?: string; requestedBy?: string };
    if (!p.name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name required"));
      return;
    }

    if (isLocal(p.nodeId)) {
      if (!(p.name in CONTAINER_PRESETS)) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Unknown preset: ${p.name}`));
        return;
      }
      const result = await launchPreset(p.name, p.requestedBy);
      respond(!!result.container, result.container ? { ok: true, container: result.container } : undefined,
        result.container ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Preset launch failed"));
      return;
    }

    const result = await invokeNodeDocker(context, p.nodeId!, "presets.launch", {
      name: p.name,
      requestedBy: p.requestedBy ?? "gateway-ui",
    });
    respond(result.ok, result.ok ? { ok: true, ...(result.data as object) } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Failed"));
  },

  /**
   * List images on target node
   */
  "republic.node.docker.images.list": async ({ params, respond, context }) => {
    const p = (params ?? {}) as NodeDockerParams;

    if (isLocal(p.nodeId)) {
      const images = listImages();
      const mapped = images.map((img) => ({
        id: img.id,
        tags: [`${img.repository}:${img.tag}`.replace(":<none>", "").replace("<none>:", "")].filter(
          (t) => t && t !== ":" && !t.includes("<none>"),
        ),
        size: Math.round(img.sizeGB * 1024 * 1024 * 1024),
        created: img.createdAt
          ? Math.floor(new Date(img.createdAt.split(" ")[0] ?? "").getTime() / 1000)
          : undefined,
      }));
      respond(true, { ok: true, images: mapped }, undefined);
      return;
    }

    const result = await invokeNodeDocker(context, p.nodeId!, "images.list");
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Failed"));
      return;
    }
    respond(true, { ok: true, ...(result.data as object) }, undefined);
  },

  /**
   * Pull an image on target node
   */
  "republic.node.docker.images.pull": async ({ params, respond, context }) => {
    const p = (params ?? {}) as NodeDockerParams & { image?: string };
    if (!p.image) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "image required"));
      return;
    }

    if (isLocal(p.nodeId)) {
      const ok = await pullImage(p.image);
      respond(ok, ok ? { ok: true } : undefined, ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, `Failed to pull ${p.image}`));
      return;
    }

    const result = await invokeNodeDocker(context, p.nodeId!, "images.pull", { image: p.image });
    respond(result.ok, result.ok ? { ok: true } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Failed"));
  },

  /**
   * Remove a local or remote Docker image
   */
  "republic.node.docker.images.remove": async ({ params, respond, context }) => {
    const p = (params ?? {}) as NodeDockerParams & { image?: string; force?: boolean };
    if (!p.image) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "image required"));
      return;
    }

    if (isLocal(p.nodeId)) {
      const ok = await removeImage(p.image, p.force ?? false);
      respond(ok, ok ? { ok: true } : undefined, ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, `Failed to remove ${p.image}`));
      return;
    }

    const result = await invokeNodeDocker(context, p.nodeId!, "images.remove", { image: p.image, force: p.force ?? false });
    respond(result.ok, result.ok ? { ok: true } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Failed"));
  },

  /**
   * Check Redis reachability and hoc-redis-cluster container status.
   * Returns: { ok, reachable, containerStatus: "running"|"stopped"|"missing" }
   */
  "republic.node.docker.redis.status": async ({ respond }) => {
    const docker = ensureDocker();

    // Probe TCP connection to localhost:6379
    const reachable = await redisTcpProbe("localhost", 6379);

    if (!docker.available) {
      respond(true, { ok: true, reachable, containerStatus: "docker-unavailable" }, undefined);
      return;
    }

    const containers = listContainers(false);
    const redisContainer = containers.find((c) => c.name === HOC_REDIS_CONTAINER_NAME);

    const containerStatus = !redisContainer
      ? "missing"
      : redisContainer.status === "running"
        ? "running"
        : "stopped";

    respond(true, { ok: true, reachable, containerStatus }, undefined);
  },

  /**
   * Idempotent Redis provisioner:
   * - If hoc-redis-cluster is already running → returns immediately.
   * - If stopped → restarts it and waits up to 10s for readiness.
   * - If missing → creates a fresh container with the stable name.
   *
   * This is the one-click "Deploy Redis" action from the UI.
   */
  "republic.node.docker.redis.ensure": async ({ respond }) => {
    const docker = ensureDocker();
    if (!docker.available) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Docker is not available on this node"));
      return;
    }

    // Already reachable — nothing to do
    const alreadyUp = await redisTcpProbe("localhost", 6379);
    if (alreadyUp) {
      respond(true, { ok: true, status: "already-running", containerName: HOC_REDIS_CONTAINER_NAME }, undefined);
      return;
    }

    const containers = listContainers(false);
    const existing = containers.find((c) => c.name === HOC_REDIS_CONTAINER_NAME);

    if (existing) {
      if (existing.status === "running") {
        // Running but not yet ready — poll for up to 10s
        const ready = await pollRedisReady("localhost", 6379, 10_000);
        respond(ready, ready ? { ok: true, status: "starting", containerName: HOC_REDIS_CONTAINER_NAME } : undefined,
          ready ? undefined : errorShape(ErrorCodes.UNAVAILABLE, "Redis container is running but not responding"));
        return;
      }
      // Stopped — restart it
      const started = await startContainer(HOC_REDIS_CONTAINER_NAME);
      if (!started) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Failed to restart stopped Redis container: ${HOC_REDIS_CONTAINER_NAME}`));
        return;
      }
    } else {
      // Missing — ensure image and create
      const redisImage = "redis:7-alpine";
      if (!imageExists(redisImage)) {
        const pulled = await pullImage(redisImage);
        if (!pulled) {
          respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Failed to pull redis:7-alpine image"));
          return;
        }
      }

      await initResourceBudget();
      const preset = CONTAINER_PRESETS["redis"];
      if (!preset) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Redis preset not found"));
        return;
      }
      const result = await createContainer({
        ...preset,
        name: HOC_REDIS_CONTAINER_NAME,
        requestedBy: "gateway-ui",
        labels: { "hoc.service": "redis", "hoc.managed": "true" },
      });
      if (!result.container) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Failed to create Redis container"));
        return;
      }
    }

    // Poll for readiness
    const ready = await pollRedisReady("localhost", 6379, 10_000);
    respond(
      ready,
      ready ? { ok: true, status: "deployed", containerName: HOC_REDIS_CONTAINER_NAME } : undefined,
      ready ? undefined : errorShape(ErrorCodes.UNAVAILABLE, "Redis container started but not reachable within 10s"),
    );
  },

  /**
   * Aggregated containers from ALL connected nodes
   */
  "republic.node.docker.all": async ({ respond, context }) => {
    const allContainers: Record<string, unknown>[] = [];

    // Local containers
    try {
      const docker = ensureDocker();
      if (docker.available) {
        const local = listContainers(false);
        for (const c of local) {
          allContainers.push({
            id: c.id,
            name: c.name,
            image: c.image,
            status: c.status === "created" ? "stopped" : c.status,
            ports: c.ports.join(", "),
            labels: c.labels,
            nodeId: "local",
            nodeName: "Gateway (Local)",
          });
        }
      }
    } catch {
      // Local Docker may not be available
    }

    // Remote node containers
    const connected = context.nodeRegistry.listConnected?.() ?? [];
    const remoteProbes = connected.map(async (node: { nodeId: string; displayName?: string }) => {
      try {
        const result = await invokeNodeDocker(context, node.nodeId, "containers.list", { all: true });
        if (result.ok) {
          const data = result.data as { containers?: Record<string, unknown>[] } | undefined;
          for (const c of data?.containers ?? []) {
            c.nodeId = node.nodeId;
            c.nodeName = node.displayName ?? node.nodeId;
            allContainers.push(c);
          }
        }
      } catch {
        // Node may be unreachable
      }
    });

    await Promise.allSettled(remoteProbes);

    respond(true, { ok: true, containers: allContainers }, undefined);
  },
};

// ─── Helpers ──────────────────────────────────────────────────

function categorizePreset(name: string): string {
  const gpuPresets = ["comfyui", "comfyui-rtx", "blender-gpu", "ffmpeg-cuda"];
  const agentPresets = ["desktop-agent", "playwright-sandbox", "ubuntu"];
  const securityPresets = ["kali-linux", "parrot-os", "openvas", "wazuh"];
  const infraPresets = ["redis", "postgres", "mongodb", "chromadb", "minio", "n8n", "supabase"];

  if (gpuPresets.includes(name)) { return "gpu"; }
  if (agentPresets.includes(name)) { return "agent"; }
  if (securityPresets.includes(name)) { return "security"; }
  if (infraPresets.includes(name)) { return "infra"; }
  return "other";
}
