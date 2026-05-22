/**
 * Republic Platform — Docker Orchestration Engine
 *
 * Phase 35: Full Docker lifecycle for arbitrary containers — not limited
 * to the sandbox system. Citizens and Republic modules can request
 * containers for databases, tools, services, or entire OSes.
 *
 * - Docker CLI wrapper for container and image lifecycle
 * - Resource governor with CPU/memory limits and global budget
 * - Network management for inter-container communication
 * - Automatic image pulling and cleanup
 * - Container health monitoring and restart policies
 */

import { exec, execFileSync, spawn } from "node:child_process";
import { cpus, totalmem } from "node:os";
import { emitNationalEvent } from "./event-sourcing.js";
import { probeSystemResources } from "./infra-control-plane.js";
import { uid } from "./utils.js";

// ─── Types (extracted to docker-orchestrator/types.ts) ──────────────────────
export type {
  ContainerConfig,
  ContainerInfo,
  ImageInfo,
  DockerNetwork,
  ResourceBudget,
  PullProgress,
  ContainerLaunchResult,
} from "./docker-orchestrator/types.js";
import type {
  ContainerConfig,
  ContainerInfo,
  ImageInfo,
  DockerNetwork,
  ResourceBudget,
  PullProgress,
  ContainerLaunchResult,
} from "./docker-orchestrator/types.js";

// ─── Container Presets (extracted to docker-orchestrator/presets.ts) ─────────
export { CONTAINER_PRESETS } from "./docker-orchestrator/presets.js";
import { CONTAINER_PRESETS } from "./docker-orchestrator/presets.js";

// ─── Resource Governor ──────────────────────────────────────────
let budget: ResourceBudget = {
  maxCpuCores: 0,
  maxMemoryGB: 0,
  maxContainers: 20,
  allocatedCpuCores: 0,
  allocatedMemoryGB: 0,
  activeContainers: 0,
};

/** Track containers we manage (by name → ContainerInfo) */
const managedContainers = new Map<string, ContainerInfo>();

/**
 * Initialize the resource budget based on system resources.
 * Reserves 50% of CPU and 60% of RAM for Docker (configurable).
 */
export async function initResourceBudget(
  cpuFraction = 0.5,
  memFraction = 0.6,
): Promise<ResourceBudget> {
  const resources = await probeSystemResources();
  budget.maxCpuCores = Math.floor(resources.cpuCores * cpuFraction);
  budget.maxMemoryGB = parseFloat((resources.ramTotalGB * memFraction).toFixed(1));

  emitNationalEvent("infrastructure", "docker_budget_initialized", "docker-orchestrator", {
    maxCpuCores: budget.maxCpuCores,
    maxMemoryGB: budget.maxMemoryGB,
    maxContainers: budget.maxContainers,
  });

  return { ...budget };
}

/**
 * Get a read-only snapshot of the current resource budget.
 * Includes a hasCapacity flag for quick availability checks.
 */
export function getResourceBudget(): ResourceBudget & { hasCapacity: boolean } {
  return {
    ...budget,
    hasCapacity:
      budget.activeContainers < budget.maxContainers &&
      budget.allocatedCpuCores < budget.maxCpuCores &&
      budget.allocatedMemoryGB < budget.maxMemoryGB,
  };
}

/**
 * Check if a container can be created within the resource budget.
 */
export function checkBudget(config: ContainerConfig): {
  allowed: boolean;
  reason?: string;
} {
  // Remote Docker hosts manage their own resources outside this orchestrator's awareness
  if (config.dockerHostUrl) {
    return { allowed: true };
  }

  if (budget.activeContainers >= budget.maxContainers) {
    return { allowed: false, reason: `Container limit reached (${budget.maxContainers})` };
  }

  const cpuReq = parseFloat(config.cpuLimit ?? "1.0");
  const memReq = parseMemoryLimit(config.memoryLimit ?? "1g");

  if (budget.allocatedCpuCores + cpuReq > budget.maxCpuCores) {
    return {
      allowed: false,
      reason: `CPU budget exceeded: need ${cpuReq}, available ${(budget.maxCpuCores - budget.allocatedCpuCores).toFixed(1)}`,
    };
  }

  if (budget.allocatedMemoryGB + memReq > budget.maxMemoryGB) {
    return {
      allowed: false,
      reason: `Memory budget exceeded: need ${memReq} GB, available ${(budget.maxMemoryGB - budget.allocatedMemoryGB).toFixed(1)} GB`,
    };
  }

  return { allowed: true };
}

function parseMemoryLimit(limit: string): number {
  const match = limit.match(/^([\d.]+)([gmk]?)$/i);
  if (!match) {
    return 1;
  }
  const val = parseFloat(match[1]);
  switch (match[2]?.toLowerCase()) {
    case "g":
      return val;
    case "m":
      return val / 1024;
    case "k":
      return val / (1024 * 1024);
    default:
      return val / 1e9; // bytes
  }
}

// ─── Docker CLI Wrapper ─────────────────────────────────────────

export function dockerExec(
  args: string[],
  timeoutMs = 30_000,
  dockerHostUrl?: string,
): string | null {
  try {
    return execFileSync("docker", args, {
      encoding: "utf-8",
      timeout: timeoutMs,
      env: dockerHostUrl ? { ...process.env, DOCKER_HOST: dockerHostUrl } : process.env,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

export function dockerExecAsync(
  args: string[],
  timeoutMs = 120_000,
  dockerHostUrl?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const envObj = dockerHostUrl ? { ...process.env, DOCKER_HOST: dockerHostUrl } : process.env;
    exec(`docker ${args.join(" ")}`, { timeout: timeoutMs, env: envObj }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// ─── Docker Availability ────────────────────────────────────────

/**
 * Check if Docker is installed and the daemon is running.
 */
export function ensureDocker(): { available: boolean; error?: string } {
  const version = dockerExec(["--version"]);
  if (!version) {
    return { available: false, error: "Docker CLI not found" };
  }

  const info = dockerExec(["info", "--format", "{{.ServerVersion}}"]);
  if (!info) {
    return { available: false, error: "Docker daemon not running" };
  }

  return { available: true };
}

// ─── Image Management ───────────────────────────────────────────

/**
 * Pull a Docker image. Returns true if successful.
 */
export async function pullImage(image: string): Promise<boolean> {
  const docker = ensureDocker();
  if (!docker.available) {
    return false;
  }

  emitNationalEvent("infrastructure", "docker_image_pulling", "docker-orchestrator", { image });

  try {
    // 10 minute timeout for large images (ComfyUI ~15GB, CUDA images)
    await dockerExecAsync(["pull", image], 600_000);
    emitNationalEvent("infrastructure", "docker_image_pulled", "docker-orchestrator", { image });
    return true;
  } catch (error) {
    emitNationalEvent("infrastructure", "docker_image_pull_failed", "docker-orchestrator", {
      image,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

// ─── Active Pull Tracking ───────────────────────────────────────

const activePulls = new Map<string, PullProgress>();

/** Get the progress of an active pull by pullId */
export function getPullProgress(pullId: string): PullProgress | null {
  return activePulls.get(pullId) ?? null;
}

/** Get all active pull operations */
export function getActivePulls(): PullProgress[] {
  return [...activePulls.values()];
}

/**
 * Pull a Docker image with streaming progress events.
 *
 * Uses `docker pull` via spawn() to stream stdout line-by-line,
 * parsing Docker's progress output and emitting national events
 * that the UI can subscribe to for real-time progress bars.
 *
 * Returns a pullId immediately. Monitor progress via:
 * - getPullProgress(pullId)
 * - WS events: docker_pull_progress
 */
export function pullImageStreaming(image: string): {
  pullId: string;
  promise: Promise<boolean>;
} {
  const pullId = `pull-${uid()}`;
  const startTime = Date.now();

  const progress: PullProgress = {
    pullId,
    image,
    status: "pulling",
    percent: 0,
    elapsedMs: 0,
  };
  activePulls.set(pullId, progress);

  emitNationalEvent("infrastructure", "docker_pull_started", "docker-orchestrator", {
    pullId,
    image,
  });

  const promise = new Promise<boolean>((resolve) => {
    const child = spawn("docker", ["pull", image], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let lastEmit = 0;
    const layers = new Map<string, { current: number; total: number }>();

    function parseAndEmit(line: string) {
      progress.elapsedMs = Date.now() - startTime;
      progress.detail = line.trim();

      // Parse Docker pull progress lines like:
      // "abc123: Downloading  12.5MB/45.2MB"
      // "abc123: Pull complete"
      // "abc123: Extracting  10MB/45.2MB"
      const dlMatch = line.match(
        /^([a-f0-9]+):\s+(Downloading|Extracting)\s+([\d.]+(?:[kKmMgG][bB]?))\s*\/\s*([\d.]+(?:[kKmMgG][bB]?))/i,
      );
      if (dlMatch) {
        const layerId = dlMatch[1];
        const current = parseSizeBytes(dlMatch[3]);
        const total = parseSizeBytes(dlMatch[4]);
        layers.set(layerId, { current, total });
        progress.currentLayer = layerId;
      }

      const completeMatch = line.match(/^([a-f0-9]+):\s+(Pull complete|Already exists)/i);
      if (completeMatch) {
        const layerId = completeMatch[1];
        const existing = layers.get(layerId);
        if (existing) {
          existing.current = existing.total;
        } else {
          layers.set(layerId, { current: 1, total: 1 });
        }
      }

      // Calculate overall progress
      if (layers.size > 0) {
        let totalBytes = 0;
        let downloadedBytes = 0;
        for (const l of layers.values()) {
          totalBytes += l.total;
          downloadedBytes += l.current;
        }
        progress.totalBytes = totalBytes;
        progress.downloadedBytes = downloadedBytes;
        progress.percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
      }

      // Throttle events to max 1 per second
      const now = Date.now();
      if (now - lastEmit > 1000) {
        lastEmit = now;
        emitNationalEvent("infrastructure", "docker_pull_progress", "docker-orchestrator", {
          ...progress,
        });
      }
    }

    let stdoutBuf = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) {
          parseAndEmit(line);
        }
      }
    });

    let stderrBuf = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      // Docker outputs progress to stderr too
      const lines = stderrBuf.split("\n");
      stderrBuf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) {
          parseAndEmit(line);
        }
      }
    });

    // 15-minute timeout for very large images
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      progress.status = "failed";
      progress.detail = "Pull timed out after 15 minutes";
      emitNationalEvent("infrastructure", "docker_pull_failed", "docker-orchestrator", {
        pullId,
        image,
        error: "Timed out",
      });
      activePulls.delete(pullId);
      resolve(false);
    }, 900_000);

    child.on("close", (code) => {
      clearTimeout(timeout);
      progress.elapsedMs = Date.now() - startTime;

      if (code === 0) {
        progress.status = "complete";
        progress.percent = 100;
        emitNationalEvent("infrastructure", "docker_pull_complete", "docker-orchestrator", {
          pullId,
          image,
          elapsedMs: progress.elapsedMs,
        });
        resolve(true);
      } else {
        progress.status = "failed";
        progress.detail = `Pull exited with code ${code}`;
        emitNationalEvent("infrastructure", "docker_pull_failed", "docker-orchestrator", {
          pullId,
          image,
          error: progress.detail,
        });
        resolve(false);
      }

      // Keep in map for 30s so UI can show final status
      setTimeout(() => activePulls.delete(pullId), 30_000);
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      progress.status = "failed";
      progress.detail = err.message;
      activePulls.delete(pullId);
      resolve(false);
    });
  });

  return { pullId, promise };
}

function parseSizeBytes(s: string): number {
  const match = s.match(/([\d.]+)\s*([kKmMgGbB]*)/i);
  if (!match) {
    return 0;
  }
  const val = parseFloat(match[1]);
  const unit = (match[2] ?? "").toUpperCase().replace("B", "");
  switch (unit) {
    case "G":
      return val * 1024 * 1024 * 1024;
    case "M":
      return val * 1024 * 1024;
    case "K":
      return val * 1024;
    default:
      return val;
  }
}

/**
 * Get the full `docker inspect` output for a container.
 * Returns the complete JSON object with all configuration details.
 */
export function inspectContainerFull(nameOrId: string): Record<string, unknown> | null {
  const output = dockerExec(["inspect", nameOrId], 10_000);
  if (!output) {
    return null;
  }
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>[];
    return parsed[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Async (non-blocking) version of inspectContainerFull.
 * Use this from RPC handlers instead of the sync version.
 */
export async function inspectContainerFullAsync(
  nameOrId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const output = await dockerExecAsync(["inspect", nameOrId], 10_000);
    if (!output) {
      return null;
    }
    const parsed = JSON.parse(output) as Record<string, unknown>[];
    return parsed[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Get live CPU and memory stats for a container.
 * Uses `docker stats --no-stream` for a point-in-time snapshot.
 */
export function getContainerStats(nameOrId: string): {
  cpuPercent: number;
  memUsage: string;
  memLimit: string;
  memPercent: number;
  netIO: string;
  blockIO: string;
  pids: number;
} | null {
  const output = dockerExec(
    [
      "stats",
      "--no-stream",
      "--format",
      "{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}|{{.PIDs}}",
      nameOrId,
    ],
    10_000,
  );
  if (!output) {
    return null;
  }

  const parts = output.split("|");
  if (parts.length < 6) {
    return null;
  }

  const memParts = (parts[1] ?? "").split("/").map((s) => s.trim());

  return {
    cpuPercent: parseFloat((parts[0] ?? "0").replace("%", "")),
    memUsage: memParts[0] ?? "0",
    memLimit: memParts[1] ?? "0",
    memPercent: parseFloat((parts[2] ?? "0").replace("%", "")),
    netIO: parts[3] ?? "0",
    blockIO: parts[4] ?? "0",
    pids: parseInt(parts[5] ?? "0", 10),
  };
}

/** Resource alert thresholds — emit events when containers exceed these */
const RESOURCE_ALERT_CPU_PCT = 90;
const RESOURCE_ALERT_MEM_PCT = 85;

/**
 * Async (non-blocking) version of getContainerStats.
 * Use this from health monitors and background ticks instead of the sync version.
 */
export async function getContainerStatsAsync(nameOrId: string): Promise<{
  cpuPercent: number;
  memUsage: string;
  memLimit: string;
  memPercent: number;
  netIO: string;
  blockIO: string;
  pids: number;
} | null> {
  try {
    const output = await dockerExecAsync(
      [
        "stats",
        "--no-stream",
        "--format",
        "{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}|{{.PIDs}}",
        nameOrId,
      ],
      10_000,
    );
    if (!output) {
      return null;
    }

    const parts = output.split("|");
    if (parts.length < 6) {
      return null;
    }

    const memParts = (parts[1] ?? "").split("/").map((s) => s.trim());

    const stats = {
      cpuPercent: parseFloat((parts[0] ?? "0").replace("%", "")),
      memUsage: memParts[0] ?? "0",
      memLimit: memParts[1] ?? "0",
      memPercent: parseFloat((parts[2] ?? "0").replace("%", "")),
      netIO: parts[3] ?? "0",
      blockIO: parts[4] ?? "0",
      pids: parseInt(parts[5] ?? "0", 10),
    };

    // Emit resource alerts when thresholds are exceeded
    if (stats.cpuPercent > RESOURCE_ALERT_CPU_PCT) {
      emitNationalEvent("infrastructure", "container_resource_alert", "resource-monitor", {
        name: nameOrId,
        resource: "cpu",
        value: stats.cpuPercent,
        threshold: RESOURCE_ALERT_CPU_PCT,
      });
    }
    if (stats.memPercent > RESOURCE_ALERT_MEM_PCT) {
      emitNationalEvent("infrastructure", "container_resource_alert", "resource-monitor", {
        name: nameOrId,
        resource: "memory",
        value: stats.memPercent,
        threshold: RESOURCE_ALERT_MEM_PCT,
      });
    }

    return stats;
  } catch {
    return null;
  }
}

/**
 * Update resource limits on a running container via `docker update`.
 * Only CPU and memory can be changed without recreating.
 */
export async function updateContainerResources(
  nameOrId: string,
  opts: { cpuLimit?: string; memoryLimit?: string },
): Promise<{ ok: boolean; error?: string }> {
  const args = ["update"];
  if (opts.cpuLimit) {
    args.push("--cpus", opts.cpuLimit);
  }
  if (opts.memoryLimit) {
    args.push("--memory", opts.memoryLimit);
  }
  args.push(nameOrId);

  try {
    await dockerExecAsync(args);
    // Update internal tracking
    const info = managedContainers.get(nameOrId);
    if (info) {
      if (opts.cpuLimit) {
        info.cpuLimit = opts.cpuLimit;
      }
      if (opts.memoryLimit) {
        info.memoryLimit = opts.memoryLimit;
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * List all available Docker images.
 */
export function listImages(): ImageInfo[] {
  const output = dockerExec([
    "images",
    "--format",
    "{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedAt}}",
  ]);
  if (!output) {
    return [];
  }

  return output
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      const [id, repository, tag, size, createdAt] = line.split("|");
      return {
        id: id ?? "",
        repository: repository ?? "",
        tag: tag ?? "",
        sizeGB: parseSizeToGB(size ?? "0"),
        createdAt: createdAt ?? "",
      };
    });
}

/**
 * Remove a Docker image.
 */
export async function removeImage(image: string, force = false): Promise<boolean> {
  const args = ["rmi"];
  if (force) {
    args.push("-f");
  }
  args.push(image);

  try {
    await dockerExecAsync(args);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a Docker image exists locally.
 */
export function imageExists(image: string): boolean {
  const output = dockerExec(["images", "-q", image]);
  return !!output && output.length > 0;
}

function parseSizeToGB(sizeStr: string): number {
  const match = sizeStr.match(/([\d.]+)\s*(GB|MB|KB|B)/i);
  if (!match) {
    return 0;
  }
  const val = parseFloat(match[1]);
  switch (match[2].toUpperCase()) {
    case "GB":
      return val;
    case "MB":
      return val / 1024;
    case "KB":
      return val / (1024 * 1024);
    default:
      return val / 1e9;
  }
}

// ─── Container Lifecycle ────────────────────────────────────────

/**
 * Create and start a container with the given configuration.
 * Respects the resource budget. Returns structured result with error details.
 */
export async function createContainer(config: ContainerConfig): Promise<ContainerLaunchResult> {
  const docker = ensureDocker();
  if (!docker.available) {
    return { container: null, error: docker.error ?? "Docker is not available" };
  }

  // Lazy-init budget if nobody called initResourceBudget() yet
  if (budget.maxCpuCores === 0 && budget.maxMemoryGB === 0) {
    await initResourceBudget();
  }

  // Check budget
  const budgetCheck = checkBudget(config);
  if (!budgetCheck.allowed) {
    emitNationalEvent("infrastructure", "docker_container_denied", "docker-orchestrator", {
      name: config.name,
      reason: budgetCheck.reason,
    });
    console.warn(`[DockerOrch] Container denied: ${budgetCheck.reason}`);
    return { container: null, error: `Budget denied: ${budgetCheck.reason}` };
  }

  // Ensure image exists
  if (!imageExists(config.image)) {
    const pulled = await pullImage(config.image);
    if (!pulled) {
      return {
        container: null,
        error: `Failed to pull image: ${config.image} (may need longer to download — try again)`,
      };
    }
  }

  // Build docker run command
  const args = ["run"];

  if (config.detached !== false) {
    args.push("-d");
  }

  args.push("--name", config.name);

  // Resource limits
  if (config.cpuLimit) {
    args.push("--cpus", config.cpuLimit);
  }
  if (config.memoryLimit) {
    args.push("--memory", config.memoryLimit);
  }

  // GPU passthrough (NVIDIA Container Toolkit)
  if (config.gpus) {
    args.push("--gpus", config.gpus);
  }

  // Restart policy
  if (config.restartPolicy) {
    args.push("--restart", config.restartPolicy);
  }

  // Network mode (host = full LAN access, bypasses port mappings)
  if (config.networkMode === "host") {
    args.push("--network", "host");
  } else if (config.network) {
    args.push("--network", config.network);
  }

  // Privileged mode (USB, Bluetooth, raw sockets)
  if (config.privileged) {
    args.push("--privileged");
  }

  // Device passthrough
  for (const dev of config.devices ?? []) {
    args.push("--device", dev);
  }

  // Linux capabilities
  for (const cap of config.capAdd ?? []) {
    args.push("--cap-add", cap);
  }

  // Ports (skipped for host network mode)
  if (config.networkMode !== "host") {
    for (const port of config.ports ?? []) {
      args.push("-p", port);
    }
  }

  // Volumes
  for (const vol of config.volumes ?? []) {
    args.push("-v", vol);
  }

  // Environment variables
  for (const [key, val] of Object.entries(config.env ?? {})) {
    args.push("-e", `${key}=${val}`);
  }

  // Labels
  const labels: Record<string, string> = {
    "hoc.managed": "true",
    "hoc.created-at": new Date().toISOString(),
    ...(config.requestedBy ? { "hoc.requested-by": config.requestedBy } : {}),
    ...config.labels,
  };

  for (const [key, val] of Object.entries(labels)) {
    args.push("--label", `${key}=${val}`);
  }

  args.push(config.image);

  // Command override
  if (config.command && config.command.length > 0) {
    args.push(...config.command);
  }

  try {
    const containerId = await dockerExecAsync(args);

    const info: ContainerInfo = {
      id: containerId.substring(0, 12),
      name: config.name,
      image: config.image,
      status: "running",
      ports: config.ports ?? [],
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      cpuLimit: config.cpuLimit,
      memoryLimit: config.memoryLimit,
      network: config.network,
      labels,
      managed: true,
      requestedBy: config.requestedBy,
    };

    managedContainers.set(config.name, info);

    // Update budget
    budget.allocatedCpuCores += parseFloat(config.cpuLimit ?? "1.0");
    budget.allocatedMemoryGB += parseMemoryLimit(config.memoryLimit ?? "1g");
    budget.activeContainers++;

    emitNationalEvent("infrastructure", "docker_container_created", "docker-orchestrator", {
      name: config.name,
      image: config.image,
      containerId: info.id,
    });

    invalidateContainerListCache();
    return { container: info };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[DockerOrch] Failed to create container "${config.name}":`, errMsg);
    emitNationalEvent("infrastructure", "docker_container_create_failed", "docker-orchestrator", {
      name: config.name,
      image: config.image,
      error: errMsg,
    });
    return { container: null, error: `Docker run failed: ${errMsg}` };
  }
}

/**
 * Start a stopped container.
 */
export async function startContainer(nameOrId: string): Promise<boolean> {
  try {
    await dockerExecAsync(["start", nameOrId]);
    const info = managedContainers.get(nameOrId);
    if (info) {
      info.status = "running";
      info.startedAt = new Date().toISOString();
    }
    invalidateContainerListCache();
    return true;
  } catch {
    return false;
  }
}

/**
 * Stop a running container.
 */
export async function stopContainer(nameOrId: string, timeoutSeconds = 10): Promise<boolean> {
  try {
    await dockerExecAsync(["stop", "-t", String(timeoutSeconds), nameOrId]);
    const info = managedContainers.get(nameOrId);
    if (info) {
      info.status = "exited";
    }
    invalidateContainerListCache();
    return true;
  } catch {
    return false;
  }
}

/**
 * Restart a container.
 */
export async function restartContainer(nameOrId: string): Promise<boolean> {
  try {
    await dockerExecAsync(["restart", nameOrId]);
    const info = managedContainers.get(nameOrId);
    if (info) {
      info.status = "running";
      info.startedAt = new Date().toISOString();
    }
    invalidateContainerListCache();
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove a container (stops it first if running).
 */
export async function removeContainer(nameOrId: string, force = false): Promise<boolean> {
  try {
    const args = ["rm"];
    if (force) {
      args.push("-f");
    }
    args.push(nameOrId);
    await dockerExecAsync(args);

    // Update budget
    const info = managedContainers.get(nameOrId);
    if (info) {
      budget.allocatedCpuCores -= parseFloat(info.cpuLimit ?? "1.0");
      budget.allocatedMemoryGB -= parseMemoryLimit(info.memoryLimit ?? "1g");
      budget.activeContainers = Math.max(0, budget.activeContainers - 1);
      managedContainers.delete(nameOrId);
    }

    emitNationalEvent("infrastructure", "docker_container_removed", "docker-orchestrator", {
      name: nameOrId,
    });

    invalidateContainerListCache();
    return true;
  } catch {
    return false;
  }
}

/**
 * Inspect a container and return detailed info.
 */
export function inspectContainer(nameOrId: string): ContainerInfo | null {
  const output = dockerExec([
    "inspect",
    "--format",
    "{{.Id}}|{{.Name}}|{{.Config.Image}}|{{.State.Status}}|{{.Created}}|{{.State.StartedAt}}",
    nameOrId,
  ]);
  if (!output) {
    return null;
  }

  const [id, name, image, status, created, started] = output.split("|");
  return {
    id: (id ?? "").substring(0, 12),
    name: (name ?? "").replace(/^\//, ""),
    image: image ?? "",
    status: (status ?? "unknown") as ContainerInfo["status"],
    ports: [],
    createdAt: created ?? "",
    startedAt: started,
    labels: {},
    managed: managedContainers.has((name ?? "").replace(/^\//, "")),
  };
}

/**
 * Find a container by exact name first, then fall back to prefix-based
 * discovery. The Docker orchestrator names containers as `hoc-<preset>-<uid>`,
 * so consumers that hard-code `hoc-comfyui` need to match
 * `hoc-comfyui-rtx-8cdeb6` etc.
 *
 * Returns the container info if found (running or stopped), null if no match.
 */
export function findContainerByNameOrPrefix(nameOrPrefix: string): ContainerInfo | null {
  // 1. Exact match
  const exact = inspectContainer(nameOrPrefix);
  if (exact) {
    return exact;
  }

  // 2. Prefix match via docker ps -a --filter
  const output = dockerExec([
    "ps",
    "-a",
    "--filter",
    `name=${nameOrPrefix}`,
    "--format",
    "{{.Names}}",
  ]);
  if (!output) {
    return null;
  }

  // Take the first matching container
  const firstName = output.split("\n").filter(Boolean)[0];
  if (!firstName) {
    return null;
  }

  return inspectContainer(firstName);
}

/**
 * List all containers (optionally only managed ones).
 */
export function listContainers(onlyManaged = false): ContainerInfo[] {
  const args = [
    "ps",
    "-a",
    "--format",
    "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.CreatedAt}}",
  ];

  if (onlyManaged) {
    args.push("--filter", "label=hoc.managed=true");
  }

  const output = dockerExec(args);
  if (!output) {
    return [];
  }

  return parseContainerListOutput(output);
}

// ── Async container list with TTL cache ─────────────────────────
let _containerListCache: { data: ContainerInfo[]; ts: number } | null = null;
const CONTAINER_LIST_TTL_MS = 5_000;

/**
 * Async (non-blocking) version of listContainers with a 5-second TTL cache.
 * Use this from RPC handlers and background tasks instead of the sync version.
 */
export async function listContainersAsync(onlyManaged = false): Promise<ContainerInfo[]> {
  // Check cache first (all-containers cache — filter managed client-side)
  if (_containerListCache && Date.now() - _containerListCache.ts < CONTAINER_LIST_TTL_MS) {
    return onlyManaged
      ? _containerListCache.data.filter((c) => c.managed)
      : _containerListCache.data;
  }

  const args = [
    "ps",
    "-a",
    "--format",
    "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.CreatedAt}}",
  ];

  try {
    const output = await dockerExecAsync(args, 15_000);
    if (!output) {
      return [];
    }
    const data = parseContainerListOutput(output);
    _containerListCache = { data, ts: Date.now() };
    return onlyManaged ? data.filter((c) => c.managed) : data;
  } catch {
    // Fallback to cached data if Docker is transiently unavailable
    return _containerListCache?.data ?? [];
  }
}

/** Invalidate the container list cache. Call after create/start/stop/remove. */
export function invalidateContainerListCache(): void {
  _containerListCache = null;
}

/** Shared parser for docker ps output */
function parseContainerListOutput(output: string): ContainerInfo[] {
  return output
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      const parts = line.split("|");
      const name = parts[1] ?? "";
      const statusStr = (parts[3] ?? "").toLowerCase();
      let status: ContainerInfo["status"] = "unknown";
      if (statusStr.includes("up")) {
        status = "running";
      } else if (statusStr.includes("exited")) {
        status = "exited";
      } else if (statusStr.includes("created")) {
        status = "created";
      } else if (statusStr.includes("paused")) {
        status = "paused";
      } else if (statusStr.includes("dead")) {
        status = "dead";
      }

      return {
        id: parts[0] ?? "",
        name,
        image: parts[2] ?? "",
        status,
        ports: (parts[4] ?? "").split(",").filter((p) => p.trim().length > 0),
        createdAt: parts[5] ?? "",
        labels: {},
        managed: managedContainers.has(name),
      };
    });
}

/**
 * Get container logs.
 */
export function getContainerLogs(nameOrId: string, tail = 100): string {
  return dockerExec(["logs", "--tail", String(tail), nameOrId]) ?? "";
}

/**
 * Execute a command inside a running container.
 */
export async function execInContainer(nameOrId: string, command: string[]): Promise<string> {
  return dockerExecAsync(["exec", nameOrId, ...command]);
}

// ─── Network Management ────────────────────────────────────────

/**
 * Create a Docker network.
 */
export async function createNetwork(name: string, driver = "bridge"): Promise<boolean> {
  try {
    await dockerExecAsync(["network", "create", "--driver", driver, name]);
    emitNationalEvent("infrastructure", "docker_network_created", "docker-orchestrator", {
      name,
      driver,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove a Docker network.
 */
export async function removeNetwork(name: string): Promise<boolean> {
  try {
    await dockerExecAsync(["network", "rm", name]);
    return true;
  } catch {
    return false;
  }
}

/**
 * List Docker networks.
 */
export function listNetworks(): DockerNetwork[] {
  const output = dockerExec([
    "network",
    "ls",
    "--format",
    "{{.ID}}|{{.Name}}|{{.Driver}}|{{.Scope}}",
  ]);
  if (!output) {
    return [];
  }

  return output
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      const [id, name, driver, scope] = line.split("|");
      return {
        id: id ?? "",
        name: name ?? "",
        driver: driver ?? "",
        scope: scope ?? "",
      };
    });
}

/**
 * Connect a container to a network.
 */
export async function connectToNetwork(container: string, network: string): Promise<boolean> {
  try {
    await dockerExecAsync(["network", "connect", network, container]);
    return true;
  } catch {
    return false;
  }
}

// ─── Convenience: Quick-Launch Presets ───────────────────────────

// CONTAINER_PRESETS: 210 lines now in docker-orchestrator/presets.ts

/**
 * Quick-launch a preset container.
 */
export async function launchPreset(
  preset: keyof typeof CONTAINER_PRESETS,
  requestedBy?: string,
): Promise<ContainerLaunchResult> {
  const config = CONTAINER_PRESETS[preset];
  if (!config) {
    return { container: null, error: `Unknown preset: ${String(preset)}` };
  }

  return createContainer({
    ...config,
    name: `hoc-${preset}-${uid().substring(0, 6)}`,
    requestedBy,
  });
}

// ─── Startup Reconciliation ─────────────────────────────────────

/**
 * Rebuild the `managedContainers` map and resource budget counters from live
 * Docker state. Call this once at gateway startup (or after a restart) so the
 * in-process budget and ownership tracking match reality.
 *
 * Strategy:
 *   1. Query Docker for all containers labelled `hoc.managed=true`.
 *   2. For each, read resource limits from inspect output.
 *   3. Repopulate `managedContainers` and recalculate budget.
 */
export async function reconcileManagedContainers(): Promise<{
  reconciled: number;
  budget: ResourceBudget;
}> {
  const docker = ensureDocker();
  if (!docker.available) {
    return { reconciled: 0, budget: { ...budget } };
  }

  // Query all managed containers (running or stopped)
  const output = dockerExec([
    "ps",
    "-a",
    "--filter",
    "label=hoc.managed=true",
    "--format",
    "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.CreatedAt}}",
  ]);

  if (!output) {
    return { reconciled: 0, budget: { ...budget } };
  }

  const lines = output.split("\n").filter((l) => l.trim().length > 0);

  // Clear existing map and budget counters before rebuild
  managedContainers.clear();
  budget.allocatedCpuCores = 0;
  budget.allocatedMemoryGB = 0;
  budget.activeContainers = 0;

  for (const line of lines) {
    const parts = line.split("|");
    const id = parts[0] ?? "";
    const name = parts[1] ?? "";
    const image = parts[2] ?? "";
    const statusStr = (parts[3] ?? "").toLowerCase();
    const ports = (parts[4] ?? "").split(",").filter((p) => p.trim().length > 0);
    const createdAt = parts[5] ?? "";

    let status: ContainerInfo["status"] = "unknown";
    if (statusStr.includes("up")) {
      status = "running";
    } else if (statusStr.includes("exited")) {
      status = "exited";
    } else if (statusStr.includes("created")) {
      status = "created";
    } else if (statusStr.includes("paused")) {
      status = "paused";
    } else if (statusStr.includes("dead")) {
      status = "dead";
    }

    // Read labels + resource limits via docker inspect
    const inspectOut = dockerExec([
      "inspect",
      "--format",
      "{{.HostConfig.CpuQuota}}|{{.HostConfig.Memory}}|{{.Config.Labels}}",
      id,
    ]);

    let cpuLimit: string | undefined;
    let memoryLimit: string | undefined;
    let requestedBy: string | undefined;
    const labels: Record<string, string> = {};

    if (inspectOut) {
      // Separately read labels map (format is map[k:v k:v])
      const labelsRaw = dockerExec([
        "inspect",
        "--format",
        "{{range $k,$v := .Config.Labels}}{{$k}}={{$v}}\n{{end}}",
        id,
      ]);
      if (labelsRaw) {
        for (const lline of labelsRaw.split("\n").filter(Boolean)) {
          const eq = lline.indexOf("=");
          if (eq > 0) {
            const k = lline.slice(0, eq).trim();
            const v = lline.slice(eq + 1).trim();
            labels[k] = v;
          }
        }
      }
      requestedBy = labels["hoc.requested-by"];

      // Read cpu/mem from inspect directly
      const cpuInspect = dockerExec(["inspect", "--format", "{{.HostConfig.CpuQuota}}", id]);
      const memInspect = dockerExec(["inspect", "--format", "{{.HostConfig.Memory}}", id]);
      // CpuQuota is in microseconds per 100ms period; 100000 = 1 core
      if (cpuInspect && cpuInspect !== "0") {
        const cores = parseInt(cpuInspect, 10) / 100_000;
        if (cores > 0) {
          cpuLimit = cores.toFixed(1);
        }
      }
      if (memInspect && memInspect !== "0") {
        const bytes = parseInt(memInspect, 10);
        if (bytes > 0) {
          memoryLimit = `${Math.round(bytes / 1024 / 1024)}m`;
        }
      }
    }

    const info: ContainerInfo = {
      id: id.substring(0, 12),
      name,
      image,
      status,
      ports,
      createdAt,
      cpuLimit,
      memoryLimit,
      labels,
      managed: true,
      requestedBy,
    };

    managedContainers.set(name, info);

    if (status === "running") {
      budget.activeContainers++;
      budget.allocatedCpuCores += parseFloat(cpuLimit ?? "1.0");
      budget.allocatedMemoryGB += parseMemoryLimit(memoryLimit ?? "1g");
    }
  }

  emitNationalEvent("infrastructure", "docker_reconciled", "docker-orchestrator", {
    reconciled: managedContainers.size,
    allocatedCpuCores: budget.allocatedCpuCores,
    allocatedMemoryGB: budget.allocatedMemoryGB,
    activeContainers: budget.activeContainers,
  });

  return { reconciled: managedContainers.size, budget: { ...budget } };
}

// ─── Cleanup ────────────────────────────────────────────────────

/**
 * Remove all stopped managed containers.
 */
export async function pruneStoppedContainers(): Promise<number> {
  let removed = 0;
  for (const [name, info] of managedContainers) {
    if (info.status === "exited" || info.status === "dead") {
      const success = await removeContainer(name, true);
      if (success) {
        removed++;
      }
    }
  }
  return removed;
}

// ─── Container Health Monitor + Circuit Breaker ────────────────

export type CircuitState = "closed" | "open" | "half-open";

export interface ContainerHealthState {
  name: string;
  state: CircuitState;
  consecutiveFailures: number;
  lastCheckMs: number;
  lastHealthy: number | null;
}

const HEALTH_CHECK_INTERVAL_MS = 30_000; // 30s
const CIRCUIT_OPEN_THRESHOLD = 3; // 3 consecutive failures → OPEN
const CIRCUIT_COOLDOWN_MS = 60_000; // 1 min cooldown before HALF-OPEN

/** Per-container circuit breaker state */
const containerHealth = new Map<string, ContainerHealthState>();

/** Get the health/circuit state for a container */
export function getContainerHealthState(name: string): ContainerHealthState | undefined {
  return containerHealth.get(name);
}

/** Get all container health states */
export function getAllContainerHealth(): ContainerHealthState[] {
  return [...containerHealth.values()];
}

/** Check if a container's circuit is open (unhealthy — should not route tasks to it) */
export function isCircuitOpen(name: string): boolean {
  const h = containerHealth.get(name);
  if (!h) {
    return false;
  }
  if (h.state === "open") {
    // Check if cooldown has elapsed → transition to HALF-OPEN
    if (Date.now() - h.lastCheckMs > CIRCUIT_COOLDOWN_MS) {
      h.state = "half-open";
      return false; // allow one probe
    }
    return true;
  }
  return false;
}

export interface HealthMonitorHandle {
  stop(): void;
}

/**
 * Start a background health monitor that probes all managed running containers.
 * Uses async docker exec (non-blocking) to avoid freezing the event loop.
 */
export function scheduleHealthMonitor(intervalMs = HEALTH_CHECK_INTERVAL_MS): HealthMonitorHandle {
  async function healthTick() {
    const docker = ensureDocker();
    if (!docker.available) {
      return;
    }

    for (const [name, info] of managedContainers) {
      if (info.status !== "running") {
        continue;
      }

      let health = containerHealth.get(name);
      if (!health) {
        health = {
          name,
          state: "closed",
          consecutiveFailures: 0,
          lastCheckMs: Date.now(),
          lastHealthy: Date.now(),
        };
        containerHealth.set(name, health);
      }

      // Skip if circuit is OPEN and still in cooldown
      if (health.state === "open" && Date.now() - health.lastCheckMs < CIRCUIT_COOLDOWN_MS) {
        continue;
      }

      try {
        // Async health probe — never blocks the event loop
        const result = await dockerExecAsync(["exec", name, "echo", "OK"], 5_000);
        if (result.trim() === "OK") {
          // Healthy
          if (health.state !== "closed") {
            emitNationalEvent("infrastructure", "container_health_recovered", "health-monitor", {
              name,
              previousState: health.state,
              failureCount: health.consecutiveFailures,
            });
          }
          health.state = "closed";
          health.consecutiveFailures = 0;
          health.lastHealthy = Date.now();
        } else {
          throw new Error(`Unexpected response: ${result.slice(0, 100)}`);
        }
      } catch {
        health.consecutiveFailures++;
        health.lastCheckMs = Date.now();

        if (health.consecutiveFailures >= CIRCUIT_OPEN_THRESHOLD) {
          health.state = "open";
          emitNationalEvent("infrastructure", "container_circuit_open", "health-monitor", {
            name,
            consecutiveFailures: health.consecutiveFailures,
            lastHealthy: health.lastHealthy,
          });

          // Attempt self-heal: restart the container
          try {
            await restartContainer(name);
            emitNationalEvent("infrastructure", "container_self_heal_attempted", "health-monitor", {
              name,
            });
          } catch {
            /* restart attempt failed — circuit stays open, will retry after cooldown */
          }
        } else if (health.state === "half-open") {
          // Probe failed in half-open → back to open
          health.state = "open";
        }
      }
    }

    // Clean up health entries for containers that no longer exist
    for (const name of containerHealth.keys()) {
      if (!managedContainers.has(name)) {
        containerHealth.delete(name);
      }
    }
  }

  const timer = setInterval(() => {
    void healthTick();
  }, intervalMs);
  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return { stop: () => clearInterval(timer) };
}

// ─── TTL Reaper ─────────────────────────────────────────────────

/** Containers in this set are never reaped by the TTL reaper */
const PROTECTED_CONTAINERS = new Set([
  "hoc-agent-sandbox", // Primary sandbox — intended to be long-lived
]);

/** Add a container to the reaper protection list */
export function protectContainer(name: string): void {
  PROTECTED_CONTAINERS.add(name);
}

/** Remove a container from the reaper protection list */
export function unprotectContainer(name: string): void {
  PROTECTED_CONTAINERS.delete(name);
}

export interface DockerReaperHandle {
  stop(): void;
}

export interface DockerReaperOptions {
  /** How often to run the reaper (default: 60 min) */
  intervalMs?: number;
  /** Kill running managed containers older than this (default: 48 h, 0 = disabled) */
  maxAgeHours?: number;
}

/**
 * Start a background reaper that periodically:
 *   1. Prunes all stopped/dead managed containers.
 *   2. (Optionally) kills running managed containers older than `maxAgeHours`.
 *   3. Skips containers in the PROTECTED set.
 *
 * Returns a handle with a `stop()` method for graceful shutdown.
 */
export function scheduleDockerReaper(opts: DockerReaperOptions = {}): DockerReaperHandle {
  const intervalMs = opts.intervalMs ?? 60 * 60 * 1000; // 1 hour
  const maxAgeHours = opts.maxAgeHours ?? 48;

  async function reaperTick() {
    const docker = ensureDocker();
    if (!docker.available) {
      return;
    }

    // 1. Prune stopped containers
    const pruned = await pruneStoppedContainers();

    // 2. Optionally reap old running containers (skip protected)
    let reaped = 0;
    let skippedProtected = 0;
    if (maxAgeHours > 0) {
      const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
      for (const [name, info] of managedContainers) {
        if (info.status !== "running") {
          continue;
        }
        // Never reap protected containers
        if (PROTECTED_CONTAINERS.has(name)) {
          skippedProtected++;
          continue;
        }
        const created = info.createdAt ? new Date(info.createdAt).getTime() : NaN;
        if (!isNaN(created) && created < cutoff) {
          emitNationalEvent("infrastructure", "docker_reaper_killing_old", "docker-orchestrator", {
            name,
            ageHours: Math.round((Date.now() - created) / 3_600_000),
          });
          const ok = await removeContainer(name, true);
          if (ok) {
            reaped++;
          }
        }
      }
    }

    emitNationalEvent("infrastructure", "docker_reaper_cycle", "docker-orchestrator", {
      pruned,
      reaped,
      skippedProtected,
      remaining: managedContainers.size,
    });
  }

  const timer = setInterval(() => {
    void reaperTick();
  }, intervalMs);
  // Allow Node.js to exit even if reaper is scheduled
  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return { stop: () => clearInterval(timer) };
}

/**
 * Remove dangling (untagged) images.
 */
export async function pruneImages(): Promise<boolean> {
  try {
    await dockerExecAsync(["image", "prune", "-f"]);
    return true;
  } catch {
    return false;
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getDockerDiagnostics() {
  const docker = ensureDocker();

  // Lazy-init budget so the UI doesn't show 0/0
  if (docker.available && budget.maxCpuCores === 0 && budget.maxMemoryGB === 0) {
    // Synchronous fallback: try to probe system resources inline
    try {
      const cpuCores = cpus().length;
      const ramGB = totalmem() / 1024 ** 3;
      budget.maxCpuCores = Math.floor(cpuCores * 0.5);
      budget.maxMemoryGB = parseFloat((ramGB * 0.6).toFixed(1));
    } catch {
      /* ignore */
    }
  }

  // Get ALL containers from Docker (not just managed)
  const allContainers = docker.available ? listContainers(false) : [];

  // Update activeContainers count from real Docker state
  if (docker.available) {
    budget.activeContainers = allContainers.filter((c) => c.status === "running").length;
  }

  return {
    available: docker.available,
    error: docker.error,
    budget: { ...budget },
    managedContainers: [...managedContainers.values()].map((c) => ({
      name: c.name,
      image: c.image,
      status: c.status,
    })),
    allContainers,
    presets: Object.keys(CONTAINER_PRESETS),
  };
}

// ─── Graceful Shutdown ──────────────────────────────────────────

/** Tracked handles for cleanup */
let _healthMonitorHandle: HealthMonitorHandle | null = null;
let _reaperHandle: DockerReaperHandle | null = null;

/** Store a health monitor handle for later cleanup */
export function setHealthMonitorHandle(handle: HealthMonitorHandle): void {
  _healthMonitorHandle = handle;
}

/** Store a reaper handle for later cleanup */
export function setReaperHandle(handle: DockerReaperHandle): void {
  _reaperHandle = handle;
}

/**
 * Gracefully shut down all orchestrator background timers.
 * Call this on process exit / SIGTERM to prevent orphaned intervals.
 */
export function shutdownOrchestrator(): void {
  if (_healthMonitorHandle) {
    _healthMonitorHandle.stop();
    _healthMonitorHandle = null;
    console.log("[DockerOrchestrator] Health monitor stopped ✓");
  }
  if (_reaperHandle) {
    _reaperHandle.stop();
    _reaperHandle = null;
    console.log("[DockerOrchestrator] Reaper stopped ✓");
  }
}
