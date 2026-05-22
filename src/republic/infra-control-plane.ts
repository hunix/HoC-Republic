/**
 * Republic Platform — Infrastructure Control Plane
 *
 * Phase 33: Central orchestrator for the entire local compute stack.
 *
 * Manages:
 * - System resource probing (CPU, RAM, VRAM, disk, GPU)
 * - Runtime discovery (Ollama, LM Studio, Docker, BitNet)
 * - Runtime lifecycle (start/stop/restart with health monitoring)
 * - Eligibility checking (can this machine run model X?)
 * - Infrastructure health monitoring with circuit breaker integration
 */

import { ChildProcess, exec as execCb, spawn } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(execCb);
import { promises as fs } from "node:fs";
import { arch, cpus, freemem, homedir, platform, totalmem } from "node:os";
import * as path from "node:path";
import { emitNationalEvent } from "./event-sourcing.js";
import { getCircuitBreaker } from "./resilience.js";

// ─── System Resources ───────────────────────────────────────────

/** Individual GPU device info */
export interface GPUDevice {
  /** GPU index (0-based from nvidia-smi) */
  index: number;
  name: string;
  driver: string | null;
  /** Total VRAM in GB */
  vramGB: number;
  /** Used VRAM in GB */
  vramUsedGB: number;
  /** GPU utilization percentage (0-100) */
  utilizationPct: number;
  /** GPU temperature in Celsius */
  temperatureC: number;
  /** Whether CUDA / ROCm compute is available */
  computeAvailable: boolean;
}

export interface SystemResources {
  cpuCores: number;
  cpuModel: string;
  /** Total physical RAM in GB */
  ramTotalGB: number;
  /** Free RAM in GB */
  ramFreeGB: number;
  /** Detected VRAM in GB (sum of all GPUs, 0 if no GPU) */
  vramGB: number;
  /** Free disk space in GB on the data partition */
  diskFreeGB: number;
  os: "windows" | "linux" | "darwin" | "unknown";
  arch: string;
  gpuName: string | null;
  gpuDriver: string | null;
  /** Whether CUDA / ROCm is available */
  gpuComputeAvailable: boolean;
  /** All detected GPU devices */
  gpus: GPUDevice[];
  /** Timestamp of last probe */
  probedAt: string;
}

let cachedResources: SystemResources | null = null;
let lastProbeAt = 0;
const PROBE_CACHE_MS = 30_000; // Re-probe every 30s

/**
 * Probe the host system for hardware resources.
 * Results are cached for 30 seconds to avoid expensive syscalls.
 */
export async function probeSystemResources(force = false): Promise<SystemResources> {
  if (!force && cachedResources && Date.now() - lastProbeAt < PROBE_CACHE_MS) {
    return cachedResources;
  }

  const osType = detectOS();
  const cpuInfo = cpus();
  const gpuDevices = await detectGPUs(osType);
  const diskFree = await getDiskFreeGB(osType);

  // Aggregate GPU info: use first GPU for backward compat, sum VRAM
  const totalVram = gpuDevices.reduce((sum, g) => sum + g.vramGB, 0);
  const primaryGpu = gpuDevices[0] ?? null;

  const resources: SystemResources = {
    cpuCores: cpuInfo.length,
    cpuModel: cpuInfo[0]?.model ?? "unknown",
    ramTotalGB: parseFloat((totalmem() / 1e9).toFixed(2)),
    ramFreeGB: parseFloat((freemem() / 1e9).toFixed(2)),
    vramGB: totalVram,
    diskFreeGB: diskFree,
    os: osType,
    arch: arch(),
    gpuName: primaryGpu?.name ?? null,
    gpuDriver: primaryGpu?.driver ?? null,
    gpuComputeAvailable: gpuDevices.some((g) => g.computeAvailable),
    gpus: gpuDevices,
    probedAt: new Date().toISOString(),
  };

  cachedResources = resources;
  lastProbeAt = Date.now();
  return resources;
}

function detectOS(): SystemResources["os"] {
  const p = platform();
  if (p === "win32") {return "windows";}
  if (p === "linux") {return "linux";}
  if (p === "darwin") {return "darwin";}
  return "unknown";
}

/**
 * Detect ALL GPU devices on the system.
 * Returns an array of GPUDevice objects — one per physical GPU.
 *
 * Queries nvidia-smi for: index, name, driver, total VRAM, used VRAM, utilization%, temperature.
 * Falls back to WMIC on Windows if nvidia-smi unavailable.
 */
async function detectGPUs(os: SystemResources["os"]): Promise<GPUDevice[]> {
  const devices: GPUDevice[] = [];

  // ── NVIDIA GPUs (multi-GPU via nvidia-smi) ──────────────────
  try {
    const output = await execSafeAsync(
      "nvidia-smi --query-gpu=index,name,driver_version,memory.total,memory.used,utilization.gpu,temperature.gpu --format=csv,noheader,nounits",
    );
    if (output) {
      const lines = output.trim().split("\n");
      for (const line of lines) {
        const parts = line.split(", ").map((p) => p.trim());
        if (parts.length >= 7) {
          devices.push({
            index: parseInt(parts[0] ?? "0", 10),
            name: parts[1] ?? "NVIDIA GPU",
            driver: parts[2] ?? null,
            vramGB: parseFloat((parseInt(parts[3] ?? "0", 10) / 1024).toFixed(1)),
            vramUsedGB: parseFloat((parseInt(parts[4] ?? "0", 10) / 1024).toFixed(1)),
            utilizationPct: parseInt(parts[5] ?? "0", 10),
            temperatureC: parseInt(parts[6] ?? "0", 10),
            computeAvailable: true,
          });
        }
      }
      if (devices.length > 0) {
        return devices;
      }
    }
  } catch {
    /* no nvidia-smi */
  }

  // ── AMD ROCm ────────────────────────────────────────────────
  try {
    const output = await execSafeAsync("rocm-smi --showmeminfo vram --csv");
    if (output && output.includes("GPU")) {
      const lines = output.trim().split("\n");
      const dataLine = lines.find((l) => l.includes("Total"));
      const vramMB = dataLine ? parseInt(dataLine.split(",")[1] ?? "0", 10) / (1024 * 1024) : 0;
      devices.push({
        index: 0,
        name: "AMD GPU (ROCm)",
        driver: "ROCm",
        vramGB: parseFloat(vramMB.toFixed(1)),
        vramUsedGB: 0,
        utilizationPct: 0,
        temperatureC: 0,
        computeAvailable: true,
      });
      return devices;
    }
  } catch {
    /* no rocm-smi */
  }

  // ── Windows WMIC fallback ───────────────────────────────────
  if (os === "windows") {
    try {
      const output = await execSafeAsync("wmic path win32_VideoController get Name,AdapterRAM /format:csv");
      if (output) {
        const lines = output
          .trim()
          .split("\n")
          .filter((l) => l.trim().length > 0);
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(",");
          const adapterRAM = parseInt(parts[parts.length - 1] ?? "0", 10);
          if (adapterRAM > 0) {
            devices.push({
              index: i - 1,
              name: parts.slice(1, -1).join(",").trim() || "GPU",
              driver: null,
              vramGB: parseFloat((adapterRAM / 1e9).toFixed(1)),
              vramUsedGB: 0,
              utilizationPct: 0,
              temperatureC: 0,
              computeAvailable: adapterRAM > 2e9,
            });
          }
        }
      }
    } catch {
      /* no WMIC */
    }
  }

  return devices;
}

/**
 * Get the current GPU device pool with live utilization data.
 * Force-refreshes the probe for real-time stats.
 */
export async function getGPUPool(): Promise<GPUDevice[]> {
  const resources = await probeSystemResources(true);
  return resources.gpus;
}

async function getDiskFreeGB(os: SystemResources["os"]): Promise<number> {
  try {
    if (os === "windows") {
      const drive = process.cwd().charAt(0);
      const output = await execSafeAsync(`wmic logicaldisk where "DeviceID='${drive}:'" get FreeSpace /value`);
      if (output) {
        const match = output.match(/FreeSpace=(\d+)/);
        return match ? parseFloat((parseInt(match[1], 10) / 1e9).toFixed(1)) : 0;
      }
    } else {
      const output = await execSafeAsync("df -BG . --output=avail");
      if (output) {
        const match = output.match(/(\d+)G/);
        return match ? parseInt(match[1], 10) : 0;
      }
    }
  } catch {
    /* disk check failed */
  }
  return 0;
}

async function execSafeAsync(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(cmd, { encoding: "utf-8", timeout: 10_000 });
    return stdout;
  } catch {
    return null;
  }
}

// ─── Runtime Detection ──────────────────────────────────────────

export type RuntimeName = "ollama" | "lmstudio" | "docker";

export interface RuntimeStatus {
  name: RuntimeName;
  installed: boolean;
  running: boolean;
  version: string | null;
  endpoint: string | null;
  pid: number | null;
  models: string[];
  lastChecked: string;
  error: string | null;
}

const RUNTIME_ENDPOINTS: Record<RuntimeName, string> = {
  ollama: process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
  lmstudio: process.env.LMSTUDIO_URL ?? "http://127.0.0.1:1234",
  docker: "unix:///var/run/docker.sock",
};

const runtimeStatuses = new Map<RuntimeName, RuntimeStatus>();

/**
 * Discover all installed runtimes and their status.
 * Returns a snapshot of all known runtimes.
 */
export async function discoverRuntimes(): Promise<Record<RuntimeName, RuntimeStatus>> {
  const results = await Promise.allSettled([
    probeOllama(),
    probeLMStudio(),
    probeDocker(),
  ]);

  const names: RuntimeName[] = ["ollama", "lmstudio", "docker"];
  for (let i = 0; i < names.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      runtimeStatuses.set(names[i], result.value);
    } else {
      runtimeStatuses.set(names[i], {
        name: names[i],
        installed: false,
        running: false,
        version: null,
        endpoint: null,
        pid: null,
        models: [],
        lastChecked: new Date().toISOString(),
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  return Object.fromEntries(runtimeStatuses) as Record<RuntimeName, RuntimeStatus>;
}

async function probeOllama(): Promise<RuntimeStatus> {
  const base: RuntimeStatus = {
    name: "ollama",
    installed: false,
    running: false,
    version: null,
    endpoint: RUNTIME_ENDPOINTS.ollama,
    pid: null,
    models: [],
    lastChecked: new Date().toISOString(),
    error: null,
  };

  // Check if installed
  const ver = await execSafeAsync("ollama --version");
  if (!ver) {return base;}
  base.installed = true;
  base.version = ver.trim().replace("ollama version ", "");

  // Check if running by hitting the API
  const cb = getCircuitBreaker("ollama-probe", { failureThreshold: 3, resetTimeoutMs: 60_000 });
  try {
    await cb.execute(async () => {
      const resp = await fetch(`${RUNTIME_ENDPOINTS.ollama}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { models?: Array<{ name: string }> };
        base.running = true;
        base.models = (data.models ?? []).map((m) => m.name);
      }
    });
  } catch {
    base.error = "Ollama installed but not responding";
  }

  return base;
}

async function probeLMStudio(): Promise<RuntimeStatus> {
  const base: RuntimeStatus = {
    name: "lmstudio",
    installed: false,
    running: false,
    version: null,
    endpoint: RUNTIME_ENDPOINTS.lmstudio,
    pid: null,
    models: [],
    lastChecked: new Date().toISOString(),
    error: null,
  };

  // LM Studio doesn't have a CLI, check if the API is reachable
  const cb = getCircuitBreaker("lmstudio-probe", { failureThreshold: 3, resetTimeoutMs: 60_000 });
  try {
    await cb.execute(async () => {
      const resp = await fetch(`${RUNTIME_ENDPOINTS.lmstudio}/v1/models`, {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { data?: Array<{ id: string }> };
        base.installed = true;
        base.running = true;
        base.models = (data.data ?? []).map((m) => m.id);
      }
    });
  } catch {
    // Check common install paths
    const lmsPaths =
      detectOS() === "windows"
        ? [path.join(homedir(), "AppData", "Local", "LM Studio")]
        : [path.join(homedir(), ".lmstudio")];

    for (const p of lmsPaths) {
      try {
        await fs.access(p);
        base.installed = true;
        base.error = "LM Studio installed but server not running";
        break;
      } catch {
        /* not found */
      }
    }
  }

  return base;
}

async function probeDocker(): Promise<RuntimeStatus> {
  const base: RuntimeStatus = {
    name: "docker",
    installed: false,
    running: false,
    version: null,
    endpoint: RUNTIME_ENDPOINTS.docker,
    pid: null,
    models: [],
    lastChecked: new Date().toISOString(),
    error: null,
  };

  const ver = await execSafeAsync("docker --version");
  if (!ver) {return base;}
  base.installed = true;
  base.version = ver.trim();

  // Check if daemon is running
  const info = await execSafeAsync("docker info --format '{{.ServerVersion}}'");
  if (info) {
    base.running = true;
  } else {
    base.error = "Docker installed but daemon not running";
  }

  return base;
}

// BitNet removed — probeBitNet() deleted

// ─── Runtime Lifecycle ──────────────────────────────────────────

const managedProcesses = new Map<RuntimeName, ChildProcess>();

/**
 * Start a local runtime. Returns true if started successfully.
 *
 * - ollama: `ollama serve`
 * - docker: `dockerd` (Linux) or starts Docker Desktop (Windows/Mac)
 * - lmstudio/bitnet: manual start required, but we can check readiness
 */
export async function startRuntime(name: RuntimeName): Promise<boolean> {
  const status = runtimeStatuses.get(name);
  if (status?.running) {return true;}

  emitNationalEvent("infrastructure", "runtime_starting", "infra-control-plane", { runtime: name });

  try {
    switch (name) {
      case "ollama": {
        const proc = spawn("ollama", ["serve"], {
          detached: true,
          stdio: "ignore",
        });
        proc.unref();
        managedProcesses.set("ollama", proc);

        // Wait for it to come up
        for (let i = 0; i < 10; i++) {
          await sleep(1000);
          try {
            const resp = await fetch(`${RUNTIME_ENDPOINTS.ollama}/api/tags`, {
              signal: AbortSignal.timeout(2000),
            });
            if (resp.ok) {
              emitNationalEvent("infrastructure", "runtime_started", "infra-control-plane", {
                runtime: name,
              });
              return true;
            }
          } catch {
            /* not ready yet */
          }
        }
        return false;
      }

      case "docker": {
        const os = detectOS();
        if (os === "windows") {
          // Try starting Docker Desktop
          const dockerDesktop = path.join(
            process.env.ProgramFiles ?? "C:\\Program Files",
            "Docker",
            "Docker",
            "Docker Desktop.exe",
          );
          try {
            await fs.access(dockerDesktop);
            spawn(dockerDesktop, [], { detached: true, stdio: "ignore" }).unref();
            // Wait for daemon
            for (let i = 0; i < 30; i++) {
              await sleep(2000);
              if (await execSafeAsync("docker info")) {
                emitNationalEvent("infrastructure", "runtime_started", "infra-control-plane", {
                  runtime: name,
                });
                return true;
              }
            }
          } catch {
            return false;
          }
        } else if (os === "linux") {
          await execSafeAsync("sudo systemctl start docker");
          await sleep(3000);
          return !!(await execSafeAsync("docker info"));
        }
        return false;
      }

      case "lmstudio":
        // LM Studio doesn't have a standard daemon to start
        return false;
    }
  } catch (error) {
    emitNationalEvent("infrastructure", "runtime_start_failed", "infra-control-plane", {
      runtime: name,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Stop a managed runtime gracefully.
 */
export async function stopRuntime(name: RuntimeName): Promise<boolean> {
  const proc = managedProcesses.get(name);
  if (proc && !proc.killed) {
    proc.kill("SIGTERM");
    managedProcesses.delete(name);
    emitNationalEvent("infrastructure", "runtime_stopped", "infra-control-plane", {
      runtime: name,
    });
    return true;
  }

  // Try system-level stop
  switch (name) {
    case "ollama":
      await execSafeAsync(detectOS() === "windows" ? "taskkill /IM ollama.exe /F" : "pkill ollama");
      return true;
    case "docker":
      if (detectOS() === "linux") {
        await execSafeAsync("sudo systemctl stop docker");
        return true;
      }
      return false;
    default:
      return false;
  }
}

/**
 * Restart a runtime (stop + start).
 */
export async function restartRuntime(name: RuntimeName): Promise<boolean> {
  await stopRuntime(name);
  await sleep(2000);
  return startRuntime(name);
}

/**
 * Get the current status of a specific runtime.
 */
export function getRuntimeStatus(name: RuntimeName): RuntimeStatus | undefined {
  return runtimeStatuses.get(name);
}

// ─── Model Eligibility ──────────────────────────────────────────

export interface ModelRequirements {
  name: string;
  /** Minimum RAM in GB needed to load the model */
  ramGB: number;
  /** Minimum VRAM in GB (0 if CPU-only) */
  vramGB: number;
  /** Disk space needed for the model file in GB */
  diskGB: number;
  /** Whether GPU is required (vs optional) */
  gpuRequired: boolean;
  /** Quantization level */
  quantization?: string;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
  recommendation: string;
  /** If the full model doesn't fit, suggest a smaller one */
  alternativeModel?: string;
  alternativeQuantization?: string;
  resourceDelta: {
    ramDeficitGB: number;
    vramDeficitGB: number;
    diskDeficitGB: number;
  };
}

/**
 * Well-known model size requirements (RAM in GB for loading).
 * These are approximate and vary by quantization.
 */
const MODEL_SIZE_TABLE: Record<string, { ramGB: number; vramGB: number; diskGB: number }> = {
  // BitNet 1-bit models (very efficient)
  "bitnet-3b": { ramGB: 2, vramGB: 0, diskGB: 1 },
  "bitnet-7b": { ramGB: 4, vramGB: 0, diskGB: 2 },

  // Ollama-class GGUF models (Q4_K_M)
  "llama-3.2-1b": { ramGB: 2, vramGB: 0, diskGB: 1 },
  "llama-3.2-3b": { ramGB: 4, vramGB: 0, diskGB: 2 },
  "llama-3.3-8b": { ramGB: 6, vramGB: 0, diskGB: 5 },
  "llama-3.3-70b": { ramGB: 48, vramGB: 0, diskGB: 40 },
  "qwen-2.5-7b": { ramGB: 6, vramGB: 0, diskGB: 5 },
  "qwen-2.5-32b": { ramGB: 24, vramGB: 0, diskGB: 18 },
  "deepseek-r1-7b": { ramGB: 6, vramGB: 0, diskGB: 5 },
  "deepseek-r1-70b": { ramGB: 48, vramGB: 0, diskGB: 40 },
  "phi-4-14b": { ramGB: 10, vramGB: 0, diskGB: 8 },
  "gemma-3-9b": { ramGB: 7, vramGB: 0, diskGB: 6 },
  "gemma-3-27b": { ramGB: 20, vramGB: 0, diskGB: 15 },
  "mistral-7b": { ramGB: 6, vramGB: 0, diskGB: 5 },
  "codellama-7b": { ramGB: 6, vramGB: 0, diskGB: 5 },
  "codellama-34b": { ramGB: 24, vramGB: 0, diskGB: 18 },
};

/**
 * Quantization multipliers (relative to Q4_K_M baseline in MODEL_SIZE_TABLE).
 */
const QUANT_MULTIPLIERS: Record<string, number> = {
  Q2_K: 0.55,
  Q3_K_S: 0.7,
  Q3_K_M: 0.75,
  Q4_0: 0.85,
  Q4_K_S: 0.9,
  Q4_K_M: 1.0, // baseline
  Q5_0: 1.1,
  Q5_K_S: 1.15,
  Q5_K_M: 1.2,
  Q6_K: 1.35,
  Q8_0: 1.7,
  F16: 3.0,
};

/**
 * Check if the current system can run a given model.
 * Returns detailed eligibility info including resource deficits and alternatives.
 */
export async function checkEligibility(
  requirements: ModelRequirements,
): Promise<EligibilityResult> {
  const resources = await probeSystemResources();
  const quantMult = requirements.quantization
    ? (QUANT_MULTIPLIERS[requirements.quantization] ?? 1.0)
    : 1.0;

  const effectiveRam = requirements.ramGB * quantMult;
  const effectiveVram = requirements.vramGB * quantMult;
  const effectiveDisk = requirements.diskGB * quantMult;

  const ramDeficit = effectiveRam - resources.ramFreeGB;
  const vramDeficit = requirements.gpuRequired ? effectiveVram - resources.vramGB : 0;
  const diskDeficit = effectiveDisk - resources.diskFreeGB;

  const reasons: string[] = [];
  let eligible = true;

  if (ramDeficit > 0) {
    eligible = false;
    reasons.push(
      `Insufficient RAM: need ${effectiveRam.toFixed(1)} GB, have ${resources.ramFreeGB.toFixed(1)} GB free`,
    );
  }

  if (vramDeficit > 0 && requirements.gpuRequired) {
    eligible = false;
    reasons.push(
      `Insufficient VRAM: need ${effectiveVram.toFixed(1)} GB, have ${resources.vramGB.toFixed(1)} GB`,
    );
  }

  if (diskDeficit > 0) {
    eligible = false;
    reasons.push(
      `Insufficient disk: need ${effectiveDisk.toFixed(1)} GB, have ${resources.diskFreeGB.toFixed(1)} GB free`,
    );
  }

  // Suggest alternative quantization if RAM is the issue
  let alternativeQuantization: string | undefined;
  if (ramDeficit > 0) {
    // Find smallest quantization that fits
    const sortedQuants = Object.entries(QUANT_MULTIPLIERS).toSorted((a, b) => a[1] - b[1]);
    for (const [quant, mult] of sortedQuants) {
      if (requirements.ramGB * mult <= resources.ramFreeGB) {
        alternativeQuantization = quant;
        break;
      }
    }
  }

  const recommendation = eligible
    ? `System can run ${requirements.name}` +
      (resources.gpuComputeAvailable ? " with GPU acceleration" : " on CPU")
    : alternativeQuantization
      ? `Try ${requirements.name} with ${alternativeQuantization} quantization (${(requirements.ramGB * (QUANT_MULTIPLIERS[alternativeQuantization] ?? 1)).toFixed(1)} GB RAM)`
      : "Model too large for this system. Consider a smaller model.";

  return {
    eligible,
    reasons,
    recommendation,
    alternativeQuantization,
    resourceDelta: {
      ramDeficitGB: parseFloat(Math.max(0, ramDeficit).toFixed(1)),
      vramDeficitGB: parseFloat(Math.max(0, vramDeficit).toFixed(1)),
      diskDeficitGB: parseFloat(Math.max(0, diskDeficit).toFixed(1)),
    },
  };
}

/**
 * Look up model requirements from the built-in table.
 * Returns null if the model is not in the catalog.
 */
export function lookupModelRequirements(
  modelName: string,
  quantization?: string,
): ModelRequirements | null {
  const key = modelName.toLowerCase().replace(/[_\s]/g, "-");
  const entry = MODEL_SIZE_TABLE[key];
  if (!entry) {return null;}

  return {
    name: modelName,
    ramGB: entry.ramGB,
    vramGB: entry.vramGB,
    diskGB: entry.diskGB,
    gpuRequired: false,
    quantization,
  };
}

// ─── Infrastructure Health Monitor ──────────────────────────────

export interface InfraHealth {
  system: SystemResources;
  runtimes: Record<RuntimeName, RuntimeStatus>;
  overallStatus: "healthy" | "degraded" | "unhealthy";
  alerts: string[];
  checkedAt: string;
}

let healthMonitorTimer: ReturnType<typeof setInterval> | null = null;
let latestHealth: InfraHealth | null = null;

/**
 * Run a full infrastructure health check.
 */
export async function checkInfraHealth(): Promise<InfraHealth> {
  const [system, runtimes] = await Promise.all([probeSystemResources(true), discoverRuntimes()]);

  const alerts: string[] = [];

  // System alerts
  if (system.ramFreeGB < 2) {
    alerts.push(`Low RAM: only ${system.ramFreeGB.toFixed(1)} GB free`);
  }
  if (system.diskFreeGB < 5) {
    alerts.push(`Low disk: only ${system.diskFreeGB.toFixed(1)} GB free`);
  }

  // Runtime alerts
  for (const [name, status] of Object.entries(runtimes)) {
    if (status.installed && !status.running) {
      alerts.push(`${name} is installed but not running`);
    }
    if (status.error) {
      alerts.push(`${name}: ${status.error}`);
    }
  }

  const runningCount = Object.values(runtimes).filter((r) => r.running).length;
  const overallStatus: InfraHealth["overallStatus"] =
    alerts.length === 0
      ? "healthy"
      : runningCount === 0 || system.ramFreeGB < 1
        ? "unhealthy"
        : "degraded";

  latestHealth = {
    system,
    runtimes,
    overallStatus,
    alerts,
    checkedAt: new Date().toISOString(),
  };

  return latestHealth;
}

/**
 * Start periodic infrastructure health monitoring.
 */
export function startInfraMonitor(intervalMs = 60_000): void {
  if (healthMonitorTimer) {return;}

  healthMonitorTimer = setInterval(async () => {
    const health = await checkInfraHealth();
    if (health.overallStatus === "unhealthy") {
      emitNationalEvent("infrastructure", "infra_unhealthy", "infra-control-plane", {
        alerts: health.alerts,
        ramFreeGB: health.system.ramFreeGB,
        diskFreeGB: health.system.diskFreeGB,
      });
    }
  }, intervalMs);

  if (healthMonitorTimer.unref) {
    healthMonitorTimer.unref();
  }
}

/**
 * Stop the health monitor.
 */
export function stopInfraMonitor(): void {
  if (healthMonitorTimer) {
    clearInterval(healthMonitorTimer);
    healthMonitorTimer = null;
  }
}

/**
 * Get the latest cached health (or run a fresh check).
 */
export async function getInfraHealth(): Promise<InfraHealth> {
  return latestHealth ?? checkInfraHealth();
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getInfraDiagnostics() {
  return {
    cachedResources,
    runtimes: Object.fromEntries(runtimeStatuses),
    managedProcesses: [...managedProcesses.keys()],
    monitorRunning: healthMonitorTimer !== null,
    remoteGPUNodes: [...remoteGPUNodes.values()],
    gpuCluster: getGPUCluster(),
    latestHealth: latestHealth
      ? {
          overallStatus: latestHealth.overallStatus,
          alerts: latestHealth.alerts,
          checkedAt: latestHealth.checkedAt,
        }
      : null,
  };
}

// ─── Remote GPU Cluster ─────────────────────────────────────────

/** Remote GPU node accessible over the network (e.g. via Tailscale). */
export interface RemoteGPUNode {
  id: string;
  name: string;
  host: string;
  /** Expected GPU hardware */
  gpuName: string;
  /** Expected VRAM in GB */
  vramGB: number;
  /** System RAM in GB */
  ramGB?: number;
  /** RAM type (e.g. DDR5) */
  ramType?: string;
  /** NVMe/SSD storage in TB */
  storageTB?: number;
  /** Network transport */
  transport: "tailscale" | "lan" | "wireguard" | "ssh";
  /** Service endpoints on this node */
  endpoints: {
    /** SSH for remote command execution */
    ssh?: number;
    /** Docker API port (usually 2375 or 2376) */
    docker?: number;
    /** FFmpeg render worker port */
    ffmpeg?: number;
    /** PersonaPlex / LLM inference port */
    inference?: number;
    /** LM Studio native API port */
    lmstudio?: number;
    /** LM Studio OpenAI-compatible API port */
    lmstudioOpenAI?: number;
    /** NVIDIA Container Toolkit runtime */
    nvidiaRuntime?: boolean;
  };
  /** When the node was registered */
  registeredAt: string;
  /** Last successful health check */
  lastHealthCheck?: string;
  /** Current status */
  status: "online" | "offline" | "unknown";
}

const remoteGPUNodes = new Map<string, RemoteGPUNode>();

// ─── Pre-registered GPU Nodes ───────────────────────────────────

// RTX 6000 Pro via Tailscale (96 GB VRAM, 128 GB DDR5, Blackwell Server Edition)
remoteGPUNodes.set("rtx6000pro-tailscale", {
  id: "rtx6000pro-tailscale",
  name: "RTX 6000 Pro Server Edition",
  host: "100.68.218.68",
  gpuName: "NVIDIA RTX 6000 Pro Blackwell Server Edition",
  vramGB: 96,
  ramGB: 128,
  ramType: "DDR5",
  storageTB: 4,
  transport: "tailscale",
  endpoints: {
    ssh: 22,
    docker: 2375,
    ffmpeg: 9100,
    inference: 8998,
    lmstudio: 1234,
    lmstudioOpenAI: 1234,
    nvidiaRuntime: true,
  },
  registeredAt: new Date().toISOString(),
  status: "unknown",
});

/** Register a remote GPU node. */
export function registerRemoteGPU(
  node: Omit<RemoteGPUNode, "registeredAt" | "status">,
): RemoteGPUNode {
  const full: RemoteGPUNode = {
    ...node,
    registeredAt: new Date().toISOString(),
    status: "unknown",
  };
  remoteGPUNodes.set(node.id, full);

  emitNationalEvent("infrastructure", "remote_gpu_registered", "infra-control-plane", {
    id: node.id,
    name: node.name,
    host: node.host,
    gpuName: node.gpuName,
    vramGB: node.vramGB,
  });

  return full;
}

/** Remove a remote GPU node. */
export function removeRemoteGPU(nodeId: string): boolean {
  return remoteGPUNodes.delete(nodeId);
}

/** Get all registered remote GPU nodes. */
export function getRemoteGPUNodes(): RemoteGPUNode[] {
  return [...remoteGPUNodes.values()];
}

/** Get combined local + remote GPU cluster summary. */
export function getGPUCluster(): {
  localGPUs: GPUDevice[];
  remoteNodes: RemoteGPUNode[];
  totalLocalVramGB: number;
  totalRemoteVramGB: number;
  totalClusterVramGB: number;
} {
  const localGPUs = cachedResources?.gpus ?? [];
  const remote = [...remoteGPUNodes.values()];
  const localVram = localGPUs.reduce((sum, g) => sum + g.vramGB, 0);
  const remoteVram = remote.reduce((sum, n) => sum + n.vramGB, 0);

  return {
    localGPUs,
    remoteNodes: remote,
    totalLocalVramGB: localVram,
    totalRemoteVramGB: remoteVram,
    totalClusterVramGB: localVram + remoteVram,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
