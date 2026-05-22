/**
 * republic.infra.* — Universal Infrastructure Ensure Handlers
 *
 * Provides idempotent "one-click deploy" for every critical HoC service.
 * Each handler follows the same pattern:
 *  1. Check if already running (TCP probe or container inspect)
 *  2. If stopped → restart it
 *  3. If missing → create from preset
 *  4. Poll for readiness
 *
 * These are also exposed as agent tools so citizens can manage
 * infrastructure via natural language in chat.
 */

import net from "node:net";
import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  ensureDocker,
  listContainers,
  startContainer,
  pullImage,
  imageExists,
  initResourceBudget,
  createContainer,
  CONTAINER_PRESETS,
  getContainerLogs,
  execInContainer,
} from "../../../republic/docker-orchestrator.js";

// ─── TCP Probe ──────────────────────────────────────────────────

function tcpProbe(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
    socket.on("error", () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

async function pollReady(host: string, port: number, maxWaitMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await tcpProbe(host, port)) { return true; }
    await new Promise((r) => setTimeout(r, 600));
  }
  return false;
}

// ─── Generic Ensure Helper ──────────────────────────────────────

interface EnsureResult {
  ok: boolean;
  status: "already-running" | "restarted" | "deployed" | "failed";
  containerName: string;
  error?: string;
}

async function ensureService(
  presetName: string,
  stableContainerName: string,
  probePort?: number,
  probeHost = "localhost",
): Promise<EnsureResult> {
  const docker = ensureDocker();
  if (!docker.available) {
    return { ok: false, status: "failed", containerName: stableContainerName, error: "Docker not available" };
  }

  // Already reachable via TCP?
  if (probePort && await tcpProbe(probeHost, probePort)) {
    return { ok: true, status: "already-running", containerName: stableContainerName };
  }

  const containers = listContainers(false);
  // Find by exact name first, then fall back to prefix match
  // (the orchestrator names containers as hoc-<preset>-<uid>)
  const existing = containers.find((c) => c.name === stableContainerName)
    ?? containers.find((c) => c.name.startsWith(stableContainerName));

  if (existing) {
    if (existing.status === "running") {
      // Running but port not responding yet — poll
      if (probePort) {
        const ready = await pollReady(probeHost, probePort, 15_000);
        return ready
          ? { ok: true, status: "already-running", containerName: stableContainerName }
          : { ok: false, status: "failed", containerName: stableContainerName, error: "Container running but port not responding" };
      }
      return { ok: true, status: "already-running", containerName: stableContainerName };
    }
    // Stopped — restart it (use actual resolved name, may have UID suffix)
    const started = await startContainer(existing.name);
    if (!started) {
      return { ok: false, status: "failed", containerName: stableContainerName, error: "Failed to restart container" };
    }
    if (probePort) {
      const ready = await pollReady(probeHost, probePort, 20_000);
      return ready
        ? { ok: true, status: "restarted", containerName: stableContainerName }
        : { ok: false, status: "failed", containerName: stableContainerName, error: "Container restarted but port not responding within 20s" };
    }
    return { ok: true, status: "restarted", containerName: stableContainerName };
  }

  // Missing — create from preset
  const preset = CONTAINER_PRESETS[presetName];
  if (!preset) {
    return { ok: false, status: "failed", containerName: stableContainerName, error: `Unknown preset: ${presetName}` };
  }

  if (!imageExists(preset.image)) {
    const pulled = await pullImage(preset.image);
    if (!pulled) {
      return { ok: false, status: "failed", containerName: stableContainerName, error: `Failed to pull image: ${preset.image}` };
    }
  }

  await initResourceBudget();
  const result = await createContainer({
    ...preset,
    name: stableContainerName,
    requestedBy: "infra-ensure",
    labels: { ...preset.labels, "hoc.managed": "true" },
  });

  if (!result.container) {
    return { ok: false, status: "failed", containerName: stableContainerName, error: result.error ?? "createContainer failed" };
  }

  if (probePort) {
    const ready = await pollReady(probeHost, probePort, 30_000);
    return ready
      ? { ok: true, status: "deployed", containerName: stableContainerName }
      : { ok: false, status: "failed", containerName: stableContainerName, error: "Container created but service not reachable within 30s" };
  }

  return { ok: true, status: "deployed", containerName: stableContainerName };
}

// ─── Service Registry ───────────────────────────────────────────
// Maps service key → { presetName, containerName, probePort? }

const SERVICE_REGISTRY: Record<string, {
  preset: string;
  name: string;
  port?: number;
  uiPort?: number;
  uiPath?: string;
  description: string;
  category: "infra" | "ml" | "security" | "agents" | "automation" | "storage" | "creative" | "research";
  essential: boolean;
}> = {
  redis:        { preset: "redis",           name: "hoc-redis-cluster",        port: 6379,  description: "Redis key-value store & pub/sub",           category: "infra",       essential: true },
  postgres:     { preset: "postgres",        name: "hoc-postgres",             port: 5432,  description: "PostgreSQL relational database",             category: "infra",       essential: true },
  mongodb:      { preset: "mongodb",         name: "hoc-mongodb",              port: 27017, description: "MongoDB document database",                  category: "infra",       essential: false },
  chromadb:     { preset: "chromadb",        name: "hoc-chromadb",             port: 8000,  uiPort: 8000, uiPath: "/", description: "ChromaDB vector database for RAG",          category: "ml",          essential: true },
  minio:        { preset: "minio",           name: "hoc-minio",                port: 9000,  uiPort: 9001, uiPath: "/", description: "MinIO S3-compatible object storage",         category: "storage",     essential: false },
  n8n:          { preset: "n8n",             name: "hoc-n8n",                  port: 5678,  uiPort: 5678, uiPath: "/", description: "n8n workflow automation engine",             category: "automation",  essential: false },
  jupyter:      { preset: "jupyter",         name: "hoc-jupyter",              port: 8888,  uiPort: 8888, uiPath: "/", description: "Jupyter Lab for ML & data science",          category: "ml",          essential: false },
  "deep-research": { preset: "deep-research",name: "hoc-deep-research",        port: 7860,  uiPort: 7860, uiPath: "/", description: "Open-WebUI research & RAG interface",        category: "research",    essential: false },
  comfyui:      { preset: "comfyui",         name: "hoc-comfyui",              port: 8188,  uiPort: 8188, uiPath: "/", description: "ComfyUI GPU image/video generation",         category: "creative",    essential: false },
  playwright:   { preset: "playwright-sandbox", name: "hoc-playwright-sandbox",              description: "Playwright browser automation sandbox",        category: "agents",      essential: true },
  "kali-linux": { preset: "kali-linux",      name: "hoc-kali-sandbox",                       description: "Kali Linux penetration testing sandbox",       category: "security",    essential: false },
  desktop:      { preset: "desktop-agent",   name: "hoc-desktop-agent",        port: 3100,  uiPort: 6081, uiPath: "/", description: "Agent desktop with noVNC visual interface",   category: "agents",      essential: true },
};

// ─── Aggregate Status ───────────────────────────────────────────

function buildInfraStatus() {
  const docker = ensureDocker();
  if (!docker.available) {
    return {
      dockerAvailable: false,
      services: Object.entries(SERVICE_REGISTRY).map(([key, svc]) => ({
        key,
        ...svc,
        status: "docker-unavailable" as const,
      })),
    };
  }

  const containers = listContainers(false);
  const containerMap = new Map(containers.map((c) => [c.name, c]));

  const services = Object.entries(SERVICE_REGISTRY).map(([key, svc]) => {
    // Try exact name match, then prefix match for UID-suffixed containers
    const container = containerMap.get(svc.name)
      ?? containers.find((c) => c.name.startsWith(svc.name));
    let status: "running" | "stopped" | "missing" = "missing";
    if (container) {
      status = container.status === "running" ? "running" : "stopped";
    }
    return {
      key,
      name: svc.name,
      preset: svc.preset,
      port: svc.port,
      uiPort: svc.uiPort,
      uiPath: svc.uiPath,
      description: svc.description,
      category: svc.category,
      essential: svc.essential,
      status,
      containerId: container?.id ?? null,
      image: container?.image ?? CONTAINER_PRESETS[svc.preset]?.image ?? null,
    };
  });

  const running = services.filter((s) => s.status === "running").length;
  const essential = services.filter((s) => s.essential);
  const essentialOk = essential.filter((s) => s.status === "running").length;

  return {
    dockerAvailable: true,
    totalServices: services.length,
    running,
    essentialRunning: essentialOk,
    essentialTotal: essential.length,
    services,
  };
}

// ─── Handlers ───────────────────────────────────────────────────

export const infraEnsureHandlers: Partial<GatewayRequestHandlers> = {

  // ── Aggregate status of all managed services ─────────────────

  "republic.infra.status": ({ respond }) => {
    respond(true, { ok: true, ...buildInfraStatus() }, undefined);
  },

  // ── Generic ensure by key ────────────────────────────────────

  "republic.infra.ensure": async ({ params, respond }) => {
    const { service } = (params ?? {}) as { service?: string };
    if (!service || !(service in SERVICE_REGISTRY)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST,
        `Unknown service: ${service}. Valid keys: ${Object.keys(SERVICE_REGISTRY).join(", ")}`));
      return;
    }
    const svc = SERVICE_REGISTRY[service]!;
    const result = await ensureService(svc.preset, svc.name, svc.port);
    const { ok: _ok, ...rest } = result;
    respond(result.ok,
      result.ok ? { ok: true, ...rest } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Failed"));
  },

  // ── Per-service named ensure handlers ────────────────────────

  "republic.infra.ensure.redis": async ({ respond }) => {
    const { ok, ...rest } = await ensureService("redis", "hoc-redis-cluster", 6379);
    respond(ok, ok ? { ok, ...rest } : undefined,
      ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, rest.error ?? "Failed"));
  },

  "republic.infra.ensure.postgres": async ({ respond }) => {
    const { ok, ...rest } = await ensureService("postgres", "hoc-postgres", 5432);
    respond(ok, ok ? { ok, ...rest } : undefined,
      ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, rest.error ?? "Failed"));
  },

  "republic.infra.ensure.mongodb": async ({ respond }) => {
    const { ok, ...rest } = await ensureService("mongodb", "hoc-mongodb", 27017);
    respond(ok, ok ? { ok, ...rest } : undefined,
      ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, rest.error ?? "Failed"));
  },

  "republic.infra.ensure.chromadb": async ({ respond }) => {
    const { ok, ...rest } = await ensureService("chromadb", "hoc-chromadb", 8000);
    respond(ok, ok ? { ok, ...rest } : undefined,
      ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, rest.error ?? "Failed"));
  },

  "republic.infra.ensure.minio": async ({ respond }) => {
    const { ok, ...rest } = await ensureService("minio", "hoc-minio", 9000);
    respond(ok, ok ? { ok, ...rest } : undefined,
      ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, rest.error ?? "Failed"));
  },

  "republic.infra.ensure.n8n": async ({ respond }) => {
    const { ok, ...rest } = await ensureService("n8n", "hoc-n8n", 5678);
    respond(ok, ok ? { ok, ...rest } : undefined,
      ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, rest.error ?? "Failed"));
  },

  "republic.infra.ensure.jupyter": async ({ respond }) => {
    const { ok, ...rest } = await ensureService("jupyter", "hoc-jupyter", 8888);
    respond(ok, ok ? { ok, ...rest } : undefined,
      ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, rest.error ?? "Failed"));
  },

  "republic.infra.ensure.deep-research": async ({ respond }) => {
    const { ok, ...rest } = await ensureService("deep-research", "hoc-deep-research", 7860);
    respond(ok, ok ? { ok, ...rest } : undefined,
      ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, rest.error ?? "Failed"));
  },

  "republic.infra.ensure.comfyui": async ({ respond }) => {
    const { ok, ...rest } = await ensureService("comfyui", "hoc-comfyui", 8188);
    respond(ok, ok ? { ok, ...rest } : undefined,
      ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, rest.error ?? "Failed"));
  },

  "republic.infra.ensure.playwright": async ({ respond }) => {
    // playwright-sandbox has no TCP probe port — check container state only
    const { ok, ...rest } = await ensureService("playwright-sandbox", "hoc-playwright-sandbox");
    respond(ok, ok ? { ok, ...rest } : undefined,
      ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, rest.error ?? "Failed"));
  },

  "republic.infra.ensure.kali": async ({ respond }) => {
    // Kali is managed via multi-sandbox — delegate there
    const { startSpecializedSandbox, isSandboxTypeRunning } = await import("../../../republic/multi-sandbox.js");
    if (isSandboxTypeRunning("kali")) {
      respond(true, { ok: true, status: "already-running", containerName: "hoc-kali-sandbox" }, undefined);
      return;
    }
    const started = await startSpecializedSandbox("kali");
    respond(started, started ? { ok: true, status: "deployed", containerName: "hoc-kali-sandbox" } : undefined,
      started ? undefined : errorShape(ErrorCodes.UNAVAILABLE, "Failed to start Kali sandbox"));
  },

  "republic.infra.ensure.desktop": async ({ respond }) => {
    // Desktop agent is the main sandbox — delegate to agent-sandbox
    const { startSandbox, getSandboxPoolStatus } = await import("../../../republic/agent-sandbox.js");
    const status = getSandboxPoolStatus();
    if (status.containerRunning) {
      respond(true, { ok: true, status: "already-running", containerName: "hoc-agent-sandbox", ...status }, undefined);
      return;
    }
    const started = await startSandbox();
    respond(started, started
      ? { ok: true, status: "deployed", containerName: "hoc-agent-sandbox", ...getSandboxPoolStatus() }
      : undefined,
      started ? undefined : errorShape(ErrorCodes.UNAVAILABLE, "Failed to start desktop agent sandbox"));
  },

  "republic.infra.ensure.supabase": async ({ respond }) => {
    // Supabase managed via CLI / supabase-manager
    const { getEnhancedStatus, startLocal } = await import("../../../republic/supabase-manager.js");
    try {
      const status = await getEnhancedStatus();
      if (status.running) {
        respond(true, { ok: true, status: "already-running", containerName: "supabase-local" }, undefined);
        return;
      }
      const result = await startLocal();
      respond(result.ok,
        result.ok ? { ok: true, status: "deployed", containerName: "supabase-local" } : undefined,
        result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.stderr || "Failed to start Supabase"));
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Supabase CLI error: ${err instanceof Error ? err.message : String(err)}`));
    }
  },

  // ── Deploy all essential services in parallel ─────────────────

  "republic.infra.ensure.all": async ({ respond }) => {
    const results: Record<string, { ok: boolean; status: string }> = {};

    const tasks = [
      ensureService("redis",     "hoc-redis-cluster",    6379).then((r) => { results.redis    = r; }),
      ensureService("postgres",  "hoc-postgres",         5432).then((r) => { results.postgres  = r; }),
      ensureService("chromadb",  "hoc-chromadb",         8000).then((r) => { results.chromadb  = r; }),
      ensureService("playwright-sandbox", "hoc-playwright-sandbox").then((r) => { results.playwright = r; }),
    ];

    await Promise.allSettled(tasks);

    // Also try desktop agent
    try {
      const { startSandbox, getSandboxPoolStatus } = await import("../../../republic/agent-sandbox.js");
      const s = getSandboxPoolStatus();
      if (!s.containerRunning) { await startSandbox(); }
      results.desktop = { ok: true, status: s.containerRunning ? "already-running" : "deployed" };
    } catch {
      results.desktop = { ok: false, status: "failed" };
    }

    const allOk = Object.values(results).every((r) => r.ok);
    respond(true, { ok: allOk, results }, undefined);
  },

  // ── Container logs for any infra service ──────────────────────

  "republic.infra.logs": ({ params, respond }) => {
    const { service, lines = 200 } = (params ?? {}) as { service?: string; lines?: number };
    if (!service || !(service in SERVICE_REGISTRY)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Unknown service: ${service}`));
      return;
    }
    const svc = SERVICE_REGISTRY[service]!;
    const logs = getContainerLogs(svc.name, lines);
    respond(true, { ok: true, service, containerName: svc.name, logs }, undefined);
  },

  // ── Exec a command in any infra service container ─────────────

  "republic.infra.exec": async ({ params, respond }) => {
    const { service, command, shell = "sh" } = (params ?? {}) as {
      service?: string;
      command?: string;
      shell?: string;
    };
    if (!service || !command) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "service and command required"));
      return;
    }
    if (!(service in SERVICE_REGISTRY)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Unknown service: ${service}`));
      return;
    }
    const svc = SERVICE_REGISTRY[service]!;
    try {
      const output = await execInContainer(svc.name, [shell, "-c", command]);
      respond(true, { ok: true, service, containerName: svc.name, output }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE,
        `exec failed: ${err instanceof Error ? err.message : String(err)}`));
    }
  },

  // ── Stop a service ────────────────────────────────────────────

  "republic.infra.stop": async ({ params, respond }) => {
    const { service } = (params ?? {}) as { service?: string };
    if (!service || !(service in SERVICE_REGISTRY)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Unknown service: ${service}`));
      return;
    }
    const svc = SERVICE_REGISTRY[service]!;
    const { stopContainer } = await import("../../../republic/docker-orchestrator.js");
    const ok = await stopContainer(svc.name);
    respond(ok, ok ? { ok: true, service, containerName: svc.name } : undefined,
      ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, "Failed to stop container"));
  },

  // ── Restart a service ─────────────────────────────────────────

  "republic.infra.restart": async ({ params, respond }) => {
    const { service } = (params ?? {}) as { service?: string };
    if (!service || !(service in SERVICE_REGISTRY)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Unknown service: ${service}`));
      return;
    }
    const svc = SERVICE_REGISTRY[service]!;
    const { restartContainer } = await import("../../../republic/docker-orchestrator.js");
    const ok = await restartContainer(svc.name);
    respond(ok, ok ? { ok: true, service, containerName: svc.name } : undefined,
      ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, "Failed to restart container"));
  },

  // ── Service registry (for UI preset picker) ───────────────────

  "republic.infra.registry": ({ respond }) => {
    const services = Object.entries(SERVICE_REGISTRY).map(([key, svc]) => ({
      key,
      ...svc,
      image: CONTAINER_PRESETS[svc.preset]?.image ?? "unknown",
    }));
    respond(true, { ok: true, services }, undefined);
  },
};
