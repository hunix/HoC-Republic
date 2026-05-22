/**
 * Agent Sandbox Pool Manager — Container Lifecycle
 *
 * Image building (custom + ubuntu fallback), container creation,
 * start/stop/destroy, post-creation setup, and readiness probing.
 */

import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  createContainer,
  ensureDocker,
  inspectContainer,
  startContainer,
  stopContainer,
  removeContainer,
  type ContainerConfig,
} from "../docker-orchestrator.js";
import { emitNationalEvent } from "../event-sourcing.js";
import { ts } from "../utils.js";
import {
  SANDBOX_CONTAINER_NAME,
  SANDBOX_IMAGE_NAME,
  SANDBOX_NOVNC_PORT,
  SANDBOX_PREVIEW_PORT,
  SANDBOX_API_PORT,
  SANDBOX_API_URL,
  FALLBACK_SANDBOX_IMAGE,
  getModelVolumeMounts,
  getInferenceEnvVars,
} from "./config.js";
import {
  containerReady,
  containerInfo,
  taskQueue,
  setContainerReady,
  setContainerInfo,
  setDraining,
  pushRecent,
  isContainerRunning,
} from "./pool-state.js";

// ─── Docker Directory Discovery ─────────────────────────────────

function findDockerDir(): string | null {
  const candidates = [
    resolve(process.cwd(), "docker/agent-sandbox"),
    resolve(process.cwd(), "../docker/agent-sandbox"),
    resolve(import.meta.dirname ?? process.cwd(), "../../docker/agent-sandbox"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "Dockerfile"))) {
      return dir;
    }
  }
  return null;
}

// ─── Image Management ───────────────────────────────────────────

/**
 * Ensure the sandbox Docker image exists.
 * Tries: 1) local check → 2) build from Dockerfile → 3) ubuntu fallback
 */
async function ensureSandboxImage(): Promise<"custom" | "fallback" | false> {
  const docker = ensureDocker();
  if (!docker.available) {
    return false;
  }

  const { execFileSync } = await import("node:child_process");

  // 1. Check if image already exists
  try {
    const labelRaw = execFileSync(
      "docker",
      [
        "image",
        "inspect",
        "--format",
        '{{index .Config.Labels "hoc.image.type"}}',
        SANDBOX_IMAGE_NAME,
      ],
      { timeout: 10_000, stdio: "pipe" },
    )
      .toString()
      .trim();
    const isFallback = labelRaw === "fallback";
    console.log(
      `[SandboxPool] Image ${SANDBOX_IMAGE_NAME} exists (${isFallback ? "fallback" : "custom"}) ✓`,
    );
    return isFallback ? "fallback" : "custom";
  } catch {
    // Image doesn't exist — try building
  }

  // 2. Try building from Dockerfile
  const dockerDir = findDockerDir();
  if (dockerDir) {
    console.log(`[SandboxPool] Building image ${SANDBOX_IMAGE_NAME} from ${dockerDir}...`);
    emitNationalEvent("infrastructure", "sandbox_image_building", "agent-sandbox", {
      image: SANDBOX_IMAGE_NAME,
    });
    try {
      execFileSync("docker", ["build", "-t", SANDBOX_IMAGE_NAME, dockerDir], {
        timeout: 600_000,
        stdio: "inherit",
      });
      console.log(`[SandboxPool] Image built successfully ✓`);
      return "custom";
    } catch (err) {
      console.warn(
        "[SandboxPool] Custom image build failed, falling back to public image:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // 3. Fallback: ubuntu:22.04
  console.log(`[SandboxPool] Falling back to ${FALLBACK_SANDBOX_IMAGE}...`);
  try {
    execFileSync("docker", ["pull", FALLBACK_SANDBOX_IMAGE], {
      timeout: 300_000,
      stdio: "inherit",
    });
    const inlineDockerfile = [
      `FROM ${FALLBACK_SANDBOX_IMAGE}`,
      `LABEL hoc.image.type=fallback`,
      `RUN apt-get update -qq && apt-get install -y -qq curl wget git python3 python3-pip 2>/dev/null || true`,
      `RUN mkdir -p /workspace`,
      `WORKDIR /workspace`,
      `CMD ["sleep", "infinity"]`,
    ].join("\n");

    const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join: pathJoin } = await import("node:path");
    const tmpDir = mkdtempSync(pathJoin(tmpdir(), "hoc-sandbox-"));
    try {
      writeFileSync(pathJoin(tmpDir, "Dockerfile"), inlineDockerfile);
      execFileSync("docker", ["build", "-t", SANDBOX_IMAGE_NAME, tmpDir], {
        timeout: 600_000,
        stdio: "inherit",
      });
      console.log(`[SandboxPool] Fallback image built with sleep-infinity CMD ✓`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
    return "fallback";
  } catch (err) {
    console.error("[SandboxPool] Fallback image build failed:", err);
    return false;
  }
}

export async function buildSandboxImage(): Promise<boolean> {
  const result = await ensureSandboxImage();
  return result !== false;
}

// ─── Post-Creation Setup ────────────────────────────────────────

/**
 * Post-creation setup for fallback containers: install Node.js, Python, curl.
 * Uses async execFile to avoid blocking the event loop.
 */
async function postCreateSetup(): Promise<void> {
  const { execFile } = await import("node:child_process");

  const dockerExec = (cmd: string, timeout = 120_000): Promise<{ ok: boolean; output: string }> =>
    new Promise((resolve) => {
      execFile(
        "docker",
        ["exec", SANDBOX_CONTAINER_NAME, "bash", "-c", cmd],
        { timeout },
        (err, stdout, stderr) => {
          resolve({ ok: !err, output: (stdout ?? stderr ?? "").toString().trim() });
        },
      );
    });

  const check = await dockerExec("which node", 5_000);
  if (check.ok) {
    return;
  }

  console.log("[SandboxPool] Running first-time setup (installing Node.js, Python, curl)...");
  emitNationalEvent("infrastructure", "sandbox_setup", "agent-sandbox", { phase: "post-create" });

  const commands = [
    "apt-get update -qq",
    "apt-get install -y -qq curl python3 python3-pip git wget ca-certificates gnupg",
    "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
    "apt-get install -y -qq nodejs",
    "npm install -g pnpm tsx typescript",
    "mkdir -p /workspace",
  ];

  for (const cmd of commands) {
    const result = await dockerExec(cmd);
    if (!result.ok) {
      console.warn(
        `[SandboxPool] Setup command failed (continuing): ${cmd}`,
        result.output.slice(0, 200),
      );
    }
  }

  console.log("[SandboxPool] First-time setup complete ✓");
}

// ─── Readiness Probe ────────────────────────────────────────────

async function waitForReady(maxWaitMs = 30_000): Promise<void> {
  const start = Date.now();
  const { execFile } = await import("node:child_process");

  while (Date.now() - start < maxWaitMs) {
    // Primary: HTTP health check
    try {
      const res = await fetch(`${SANDBOX_API_URL}/health`, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) {
        setContainerReady(true);
        console.log("[SandboxPool] Container API ready ✓");
        emitNationalEvent("infrastructure", "sandbox_ready", "sandbox-pool", {
          containerId: containerInfo?.id,
        });
        return;
      }
    } catch {
      // API not ready — try docker exec fallback
    }

    // Fallback: async docker exec echo
    const alive = await new Promise<boolean>((resolve) => {
      execFile(
        "docker",
        ["exec", SANDBOX_CONTAINER_NAME, "echo", "ping"],
        { timeout: 3_000 },
        (err) => {
          resolve(!err);
        },
      );
    });
    if (alive) {
      setContainerReady(true);
      console.log("[SandboxPool] Container exec-ready (no API server, docker exec OK) ✓");
      emitNationalEvent("infrastructure", "sandbox_ready", "sandbox-pool", {
        containerId: containerInfo?.id,
        mode: "exec",
      });
      return;
    }

    await new Promise((r) => setTimeout(r, 2_000));
  }

  if (isContainerRunning()) {
    setContainerReady(true);
    console.warn(
      "[SandboxPool] Container running but API/exec unresponsive — marking ready (degraded mode)",
    );
    return;
  }
  console.warn("[SandboxPool] Container did not become ready within timeout");
  setContainerReady(false);
}

// ─── Container Lifecycle ────────────────────────────────────────

/** Ensure the sandbox container is running. Auto-creates if needed. */
let _ensureLock: Promise<boolean> | null = null;
export async function ensureContainerRunning(): Promise<boolean> {
  if (containerReady && isContainerRunning()) {
    return true;
  }
  if (_ensureLock) {
    return _ensureLock;
  }
  _ensureLock = startSandbox();
  try {
    return await _ensureLock;
  } finally {
    _ensureLock = null;
  }
}

export async function startSandbox(): Promise<boolean> {
  const docker = ensureDocker();
  if (!docker.available) {
    console.warn("[SandboxPool] Docker not available:", docker.error);
    return false;
  }
  if (isContainerRunning()) {
    setContainerReady(true);
    setContainerInfo(inspectContainer(SANDBOX_CONTAINER_NAME));
    return true;
  }

  const existing = inspectContainer(SANDBOX_CONTAINER_NAME);
  if (existing) {
    const started = await startContainer(SANDBOX_CONTAINER_NAME);
    if (started) {
      setContainerInfo(inspectContainer(SANDBOX_CONTAINER_NAME));
      await waitForReady();
      return containerReady;
    }
    await removeContainer(SANDBOX_CONTAINER_NAME, true);
  }

  const imageKind = await ensureSandboxImage();
  if (!imageKind) {
    console.error("[SandboxPool] No sandbox image available — cannot start");
    return false;
  }

  const isFallback = imageKind === "fallback";
  console.log(`[SandboxPool] Creating sandbox container (image mode: ${imageKind})...`);
  const modelMounts = getModelVolumeMounts();
  const inferenceEnv = getInferenceEnvVars();
  const dockerSocketMount = "/var/run/docker.sock:/var/run/docker.sock";

  const config: ContainerConfig = {
    name: SANDBOX_CONTAINER_NAME,
    image: SANDBOX_IMAGE_NAME,
    ports: [
      `${SANDBOX_NOVNC_PORT}:6080`,
      `${SANDBOX_PREVIEW_PORT}:8080`,
      `${SANDBOX_API_PORT}:3100`,
    ],
    volumes: [
      "hoc-sandbox-workspace:/workspace",
      "hoc-sandbox-config:/root/.config",
      dockerSocketMount,
      ...modelMounts,
    ],
    env: {
      DISPLAY: ":99",
      ...inferenceEnv,
      SUPABASE_URL: process.env.SUPABASE_URL || "",
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      SUPABASE_DB_URL:
        process.env.SUPABASE_DB_URL || "postgresql://postgres:postgres@localhost:54322/postgres",
      GH_TOKEN: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "",
      VERCEL_TOKEN: process.env.VERCEL_TOKEN || "",
    },
    cpuLimit: "12.0",
    memoryLimit: "16g",
    restartPolicy: "on-failure:3",
    ...(isFallback ? { command: ["sleep", "infinity"] } : {}),
    labels: { "hoc.service": "agent-sandbox", "hoc.managed": "true", "hoc.image.kind": imageKind },
    requestedBy: "sandbox-pool-manager",
  };

  const result = await createContainer(config);
  if (!result.container) {
    console.error("[SandboxPool] Failed to create container:", result.error);
    return false;
  }
  setContainerInfo(result.container);

  if (isFallback) {
    await postCreateSetup();
  }

  await waitForReady();
  return containerReady;
}

export async function stopSandbox(): Promise<boolean> {
  setDraining(true);
  while (taskQueue.length > 0) {
    const task = taskQueue.shift()!;
    task.status = "cancelled";
    task.completedAt = ts();
    pushRecent(task);
  }
  setContainerReady(false);
  setDraining(false);
  const stopped = await stopContainer(SANDBOX_CONTAINER_NAME);
  if (stopped) {
    emitNationalEvent("infrastructure", "sandbox_stopped", "sandbox-pool", {});
  }
  return stopped;
}

export async function destroySandbox(): Promise<boolean> {
  await stopSandbox();
  const removed = await removeContainer(SANDBOX_CONTAINER_NAME, true);
  if (removed) {
    setContainerInfo(null);
    emitNationalEvent("infrastructure", "sandbox_destroyed", "sandbox-pool", {});
  }
  return removed;
}
