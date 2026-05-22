/**
 * Multi-Sandbox Manager
 *
 * Extends the single-sandbox model to support multiple specialized sandbox containers:
 *   - exec: General-purpose code execution (default)
 *   - playwright: Browser automation with full Playwright + Chromium
 *   - comfyui: GPU-accelerated image/video production via ComfyUI
 *   - ml: Machine learning with PyTorch/TensorFlow + GPU
 *
 * Each sandbox type has its own Docker image, port mappings, and resource limits.
 * The coordinator agent delegates tasks to the appropriate sandbox based on intent.
 */

import { homedir } from "node:os";
import { resolve } from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  createContainer,
  ensureDocker,
  findContainerByNameOrPrefix,
  startContainer,
  stopContainer,
  removeContainer,
  type ContainerConfig,
} from "./docker-orchestrator.js";

const logger = createSubsystemLogger("multi-sandbox");

// ─── Sandbox Types ──────────────────────────────────────────────

export type SpecializedSandbox = "exec" | "playwright" | "comfyui" | "ml" | "kali" | "dev";

export interface SandboxSpec {
  name: string; // Container name
  image: string; // Docker image
  ports: Record<string, number>; // service → host port
  gpuRequired: boolean; // Needs NVIDIA GPU passthrough
  cpuLimit: string; // CPU cores limit
  memoryLimit: string; // RAM limit
  volumes: string[]; // Additional volume mounts
  env: Record<string, string>; // Environment variables
  description: string; // Human-readable description
  capAdd?: string[]; // Linux capabilities: ["NET_RAW", "NET_ADMIN"]
}

const PROJECT_DIR = resolve(homedir(), ".openclaw", "sandbox-projects");

const SANDBOX_SPECS: Record<SpecializedSandbox, SandboxSpec> = {
  exec: {
    name: "hoc-agent-sandbox",
    image: "hoc/agent-sandbox:latest",
    ports: { api: 3100, novnc: 6080, preview: 8080 },
    gpuRequired: false,
    cpuLimit: "12.0",
    memoryLimit: "16g",
    volumes: [
      "hoc-sandbox-workspace:/workspace",
      "hoc-sandbox-config:/root/.config",
      `${PROJECT_DIR}:/workspace/projects`,
    ],
    env: { DISPLAY: ":99" },
    description: "General-purpose sandbox for code execution, web scraping, and app building",
  },

  playwright: {
    name: "hoc-playwright-sandbox",
    image: "hoc/playwright-sandbox:latest", // Lightweight: Ubuntu + Playwright + VNC + archive tools only
    ports: { api: 3101, novnc: 6081, preview: 8081 },
    gpuRequired: false,
    cpuLimit: "4.0",
    memoryLimit: "4g",
    volumes: [
      "hoc-playwright-workspace:/workspace",
      "hoc-sandbox-config:/root/.config",
      `${PROJECT_DIR}:/workspace/projects`,
    ],
    env: {
      DISPLAY: ":99",
      PLAYWRIGHT_BROWSERS_PATH: "/opt/playwright",
    },
    description:
      "Lightweight browser automation sandbox with Playwright + Chromium + VNC + archive tools",
  },

  comfyui: {
    name: "hoc-comfyui-sandbox",
    image: "yanwk/comfyui-boot:cu128-megapak",
    ports: { api: 3102, comfyui: 8188, preview: 8082 },
    gpuRequired: true,
    cpuLimit: "8.0",
    memoryLimit: "16g",
    volumes: [
      "hoc-comfyui-workspace:/workspace",
      "hoc-comfyui-models:/models",
      `${PROJECT_DIR}:/workspace/projects`,
    ],
    env: {
      NVIDIA_VISIBLE_DEVICES: "all",
      NVIDIA_DRIVER_CAPABILITIES: "compute,utility",
    },
    description: "GPU-accelerated ComfyUI sandbox for image/video generation",
  },

  ml: {
    name: "hoc-ml-sandbox",
    image: "yanwk/comfyui-boot:cu128-megapak", // GPU base image (shared with comfyui)
    ports: { api: 3103, jupyter: 8888, preview: 8083 },
    gpuRequired: true,
    cpuLimit: "8.0",
    memoryLimit: "16g",
    volumes: [
      "hoc-ml-workspace:/workspace",
      "hoc-ml-models:/models",
      `${PROJECT_DIR}:/workspace/projects`,
    ],
    env: {
      NVIDIA_VISIBLE_DEVICES: "all",
      NVIDIA_DRIVER_CAPABILITIES: "compute,utility",
    },
    description: "GPU-accelerated ML sandbox for training, fine-tuning, and inference",
  },

  kali: {
    name: "hoc-kali-sandbox",
    image: "hoc/kali-sandbox:latest",
    ports: { api: 3104 },
    gpuRequired: false,
    cpuLimit: "8.0",
    memoryLimit: "8g",
    volumes: [
      "hoc-kali-workspace:/workspace",
      "hoc-kali-reports:/reports",
      "hoc-kali-evidence:/evidence",
      `${PROJECT_DIR}:/workspace/projects`,
    ],
    env: {},
    capAdd: ["NET_RAW", "NET_ADMIN"],
    description:
      "Kali Linux penetration testing lab with 45+ security tools: Nmap, Metasploit, Nikto, SQLMap, Hydra, Hashcat, and more",
  },

  dev: {
    name: "hoc-dev-sandbox",
    image: "hoc/dev-sandbox:latest",
    ports: { api: 3105, novnc: 6082, preview: 8085, code: 8443 },
    gpuRequired: false,
    cpuLimit: "12.0",
    memoryLimit: "16g",
    volumes: [
      "hoc-dev-workspace:/workspace",
      "hoc-sandbox-config:/root/.config",
      `${PROJECT_DIR}:/workspace/projects`,
    ],
    env: {
      DISPLAY: ":99",
      PLAYWRIGHT_BROWSERS_PATH: "/opt/playwright",
    },
    description:
      "Full-stack developer sandbox with code-server, Claude Code CLI, GitHub CLI, Supabase CLI, Docker CLI, Go, Rust, and compilers",
  },
};

// ─── Sandbox State ──────────────────────────────────────────────

const sandboxState = new Map<
  SpecializedSandbox,
  {
    running: boolean;
    apiUrl: string | null;
    startedAt: number | null;
  }
>();

// Initialize state
for (const type of Object.keys(SANDBOX_SPECS) as SpecializedSandbox[]) {
  sandboxState.set(type, { running: false, apiUrl: null, startedAt: null });
}

/**
 * Wait for a sandbox's API to become healthy after start.
 * Polls the API health endpoint with a configurable timeout.
 * Replaces hardcoded `await sleep(3000)` calls.
 */
export async function waitForSandboxHealthy(
  type: SpecializedSandbox,
  maxWaitMs = 30_000,
): Promise<boolean> {
  const spec = SANDBOX_SPECS[type];
  if (!spec) {
    return false;
  }
  const apiUrl = `http://127.0.0.1:${spec.ports.api}`;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${apiUrl}/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (res.ok) {
        logger.info(`[${type}] Health check passed after ${Date.now() - start}ms`);
        return true;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  // Final fallback: try docker exec echo
  try {
    const { dockerExecAsync } = await import("./docker-orchestrator.js");
    const result = await dockerExecAsync(["exec", spec.name, "echo", "OK"], 5_000);
    if (result.trim() === "OK") {
      logger.info(`[${type}] Docker exec health check passed (API not available)`);
      return true;
    }
  } catch {
    // Container not even responding to exec
  }
  logger.warn(`[${type}] Health check timed out after ${maxWaitMs}ms`);
  return false;
}

// ─── Public API ─────────────────────────────────────────────────

/** Get the spec for a sandbox type */
export function getSandboxSpec(type: SpecializedSandbox): SandboxSpec {
  return SANDBOX_SPECS[type];
}

/** List all available sandbox types */
export function listSandboxTypes(): Array<{
  type: SpecializedSandbox;
  spec: SandboxSpec;
  running: boolean;
}> {
  return (Object.entries(SANDBOX_SPECS) as Array<[SpecializedSandbox, SandboxSpec]>).map(
    ([type, spec]) => ({
      type,
      spec,
      running: isSandboxTypeRunning(type),
    }),
  );
}

/** Check if a specific sandbox type is running */
export function isSandboxTypeRunning(type: SpecializedSandbox): boolean {
  const spec = SANDBOX_SPECS[type];
  if (!spec) {
    return false;
  }
  // Use prefix-based discovery to handle orchestrator-generated names (hoc-<preset>-<uid>)
  const info = findContainerByNameOrPrefix(spec.name);
  return !!info && info.status === "running";
}

/** Get the API URL for a running sandbox */
export function getSandboxApiUrl(type: SpecializedSandbox): string | null {
  const spec = SANDBOX_SPECS[type];
  if (!spec) {
    return null;
  }
  if (!isSandboxTypeRunning(type)) {
    return null;
  }
  return `http://127.0.0.1:${spec.ports.api}`;
}

/** Start a specialized sandbox container */
export async function startSpecializedSandbox(type: SpecializedSandbox): Promise<boolean> {
  const spec = SANDBOX_SPECS[type];
  if (!spec) {
    logger.error(`Unknown sandbox type: ${type}`);
    return false;
  }

  const docker = ensureDocker();
  if (!docker.available) {
    logger.warn(`Docker not available: ${docker.error}`);
    return false;
  }

  // Already running?
  if (isSandboxTypeRunning(type)) {
    logger.info(`[${type}] Already running`);
    sandboxState.set(type, {
      running: true,
      apiUrl: `http://127.0.0.1:${spec.ports.api}`,
      startedAt: Date.now(),
    });
    return true;
  }

  // Try to start existing container (check by prefix to handle UID-suffixed names)
  const existing = findContainerByNameOrPrefix(spec.name);
  if (existing) {
    const started = await startContainer(existing.name);
    if (started) {
      logger.info(`[${type}] Started existing container ${existing.name}`);
      sandboxState.set(type, {
        running: true,
        apiUrl: `http://127.0.0.1:${spec.ports.api}`,
        startedAt: Date.now(),
      });
      return true;
    }
    // Remove and recreate
    await removeContainer(existing.name, true);
  }

  // Create new container
  logger.info(`[${type}] Creating container ${spec.name}...`);

  const config: ContainerConfig = {
    name: spec.name,
    image: spec.image,
    ports: Object.entries(spec.ports).map(([, hostPort]) => {
      // For specialized sandboxes, host port = container port (they're purpose-built)
      return `${hostPort}:${hostPort}`;
    }),
    volumes: spec.volumes,
    env: spec.env,
    cpuLimit: spec.cpuLimit,
    memoryLimit: spec.memoryLimit,
    restartPolicy: "unless-stopped",
    labels: {
      "hoc.service": `sandbox-${type}`,
      "hoc.managed": "true",
      "hoc.sandbox.type": type,
    },
    requestedBy: "multi-sandbox-manager",
    // GPU passthrough — ContainerConfig uses gpus: "all" for NVIDIA Container Toolkit
    ...(spec.gpuRequired ? { gpus: "all" as const } : {}),
    // Linux capabilities (e.g. NET_RAW for Kali nmap)
    ...(spec.capAdd?.length ? { capAdd: spec.capAdd } : {}),
  };

  const result = await createContainer(config);
  if (!result.container) {
    logger.error(`[${type}] Failed to create container: ${result.error}`);
    return false;
  }

  sandboxState.set(type, {
    running: true,
    apiUrl: `http://127.0.0.1:${spec.ports.api}`,
    startedAt: Date.now(),
  });

  // Wait for the container's API/exec to become healthy instead of hardcoded sleep
  const healthy = await waitForSandboxHealthy(type, 30_000);
  if (!healthy) {
    logger.warn(`[${type}] Container started but health check failed — may be slow to initialize`);
  }

  logger.info(`[${type}] Container started: ${spec.name}`);
  return true;
}

/** Stop a specialized sandbox */
export async function stopSpecializedSandbox(type: SpecializedSandbox): Promise<boolean> {
  const spec = SANDBOX_SPECS[type];
  if (!spec) {
    return false;
  }
  // Resolve actual name (may have UID suffix)
  const found = findContainerByNameOrPrefix(spec.name);
  const actualName = found?.name ?? spec.name;
  const stopped = await stopContainer(actualName);
  sandboxState.set(type, { running: false, apiUrl: null, startedAt: null });
  return stopped;
}

/** Destroy a specialized sandbox (remove container entirely) */
export async function destroySpecializedSandbox(type: SpecializedSandbox): Promise<boolean> {
  const spec = SANDBOX_SPECS[type];
  if (!spec) {
    return false;
  }
  // Resolve actual name (may have UID suffix)
  const found = findContainerByNameOrPrefix(spec.name);
  const actualName = found?.name ?? spec.name;
  const removed = await removeContainer(actualName, true);
  sandboxState.set(type, { running: false, apiUrl: null, startedAt: null });
  return removed;
}

/** Get status of all sandboxes */
export function getAllSandboxStatus(): Record<
  SpecializedSandbox,
  { running: boolean; apiUrl: string | null; spec: SandboxSpec }
> {
  const result = {} as Record<
    SpecializedSandbox,
    { running: boolean; apiUrl: string | null; spec: SandboxSpec }
  >;
  for (const [type, spec] of Object.entries(SANDBOX_SPECS) as Array<
    [SpecializedSandbox, SandboxSpec]
  >) {
    result[type] = {
      running: isSandboxTypeRunning(type),
      apiUrl: getSandboxApiUrl(type),
      spec,
    };
  }
  return result;
}

// ─── Intent-Based Sandbox Selection ─────────────────────────────

/** Given a task description, determine which sandbox type to use */
export function selectSandboxForTask(task: string): SpecializedSandbox {
  const lower = task.toLowerCase();

  // Browser automation keywords
  if (
    /playwright|browser.*automat|scrape.*dynamic|fill.*form|click.*button|login.*site|web.*interact|crawl.*javascript|spa|single.page/i.test(
      lower,
    )
  ) {
    return "playwright";
  }

  // GPU/media keywords
  if (
    /comfyui|stable.diffusion|generate.*image|generate.*video|imagen|diffusion|sd.*xl|flux.*model|video.*generat|animate/i.test(
      lower,
    )
  ) {
    return "comfyui";
  }

  // ML keywords
  if (
    /train.*model|fine.?tune|machine.learn|pytorch|tensorflow|hugging.?face|llm.*train|neural.*net|deep.*learn|inference/i.test(
      lower,
    )
  ) {
    return "ml";
  }

  // Cybersecurity / penetration testing keywords
  if (isCyberTask(lower)) {
    return "kali";
  }

  // Full-stack development keywords → dev sandbox with code-server, Claude Code, Supabase
  if (
    /full.?stack|react.*supabase|supabase.*react|build.*app|create.*project|scaffold|code.?server|claude.*code|develop.*system|vscode|vs.?code|prisma|next\.?js.*app|vite.*react/i.test(
      lower,
    )
  ) {
    return "dev";
  }

  // Default: general exec sandbox
  return "exec";
}

/** Check if a task is cybersecurity-related and should use the Kali sandbox */
function isCyberTask(task: string): boolean {
  return /pentest|penetration.test|vuln.scan|nmap|port.scan|security.audit|exploit|brute.?force|sqlmap|nikto|metasploit|kali|cyber.?attack|hack|ctf|forensic|incident.response|malware|reconnaissance|phishing/i.test(
    task,
  );
}

/** Execute a command in a specific sandbox type, auto-starting if needed */
export async function execInSandbox(
  type: SpecializedSandbox,
  command: string,
  timeout = 300,
): Promise<{
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  // Ensure sandbox is running
  if (!isSandboxTypeRunning(type)) {
    const started = await startSpecializedSandbox(type);
    if (!started) {
      return { ok: false, stdout: "", stderr: `Failed to start ${type} sandbox`, exitCode: 1 };
    }
  }

  const apiUrl = getSandboxApiUrl(type);
  if (!apiUrl) {
    return { ok: false, stdout: "", stderr: "Sandbox API not available", exitCode: 1 };
  }

  try {
    const response = await fetch(`${apiUrl}/exec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, timeout }),
      signal: AbortSignal.timeout(timeout * 1000 + 5000),
    });

    if (!response.ok) {
      return { ok: false, stdout: "", stderr: `API error: ${response.status}`, exitCode: 1 };
    }

    return (await response.json()) as {
      ok: boolean;
      stdout: string;
      stderr: string;
      exitCode: number;
    };
  } catch (e) {
    return {
      ok: false,
      stdout: "",
      stderr: `${e instanceof Error ? e.message : String(e)}`,
      exitCode: 1,
    };
  }
}
