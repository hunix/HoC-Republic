/**
 * ComfyUI Manager — Docker auto-launch, model management, GPU detection
 *
 * Manages the ComfyUI lifecycle:
 *   1. Health check via /system_stats
 *   2. Auto-launch via Docker preset (GPU passthrough)
 *   3. Model downloads (FLUX.2 Klein, LTX-2.3, SD checkpoints)
 *   4. CUDA/GPU detection via nvidia-smi
 *   5. Model listing from the ComfyUI volume
 */

import { exec as execCb, spawn } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { getComfyUITargetNode, LM_LINK_GPU_PROFILES, type LMLinkNode } from "./lmlink-cluster.js";
import { dockerExecAsync as remoteDockerExecAsync } from "./docker-orchestrator.js";

const execAsync = promisify(execCb);

const logger = createSubsystemLogger("comfyui-manager");

// ─── Configuration ──────────────────────────────────────────────

const COMFYUI_API_URL = process.env.COMFYUI_API_URL ?? "http://127.0.0.1:8188";
export const COMFYUI_MODELS_DIR =
  process.env.COMFYUI_MODELS_DIR ??
  join(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".comfyui", "models");

// ─── Types ──────────────────────────────────────────────────────

export interface GPUInfo {
  available: boolean;
  name?: string;
  vram?: string;
  driverVersion?: string;
  cudaVersion?: string;
  error?: string;
}

export interface ComfyUIModel {
  id: string;
  name: string;
  filename: string;
  type: "checkpoint" | "lora" | "vae" | "controlnet" | "upscaler" | "clip" | "unknown";
  sizeBytes: number;
  path: string;
}

export interface ComfyUIModelDownload {
  id: string;
  name: string;
  url: string;
  filename: string;
  type: ComfyUIModel["type"];
  description: string;
  sizeEstimate: string;
  requirements: string[];
}

export interface ComfyUIStatus {
  running: boolean;
  url: string;
  dockerAvailable: boolean;
  containerName: string | null;
  containerStatus: string | null;
  gpu: GPUInfo;
  installedModels: ComfyUIModel[];
  availableDownloads: ComfyUIModelDownload[];
}

// ─── Model Registry ─────────────────────────────────────────────

export const MODEL_REGISTRY: ComfyUIModelDownload[] = [
  {
    id: "flux2-klein-fp8",
    name: "FLUX.2 Klein (FP8)",
    url: "https://huggingface.co/Comfy-Org/flux1-schnell/resolve/main/flux1-schnell-fp8.safetensors",
    filename: "flux1-schnell-fp8.safetensors",
    type: "checkpoint",
    description:
      "FLUX.2 Schnell with FP8 quantization — fast text-to-image, ~12GB VRAM",
    sizeEstimate: "17GB",
    requirements: ["RTX 3060+ (12GB VRAM)", "ComfyUI"],
  },
  {
    id: "flux2-dev-fp8",
    name: "FLUX.2 Dev (FP8)",
    url: "https://huggingface.co/Comfy-Org/flux1-dev/resolve/main/flux1-dev-fp8.safetensors",
    filename: "flux1-dev-fp8.safetensors",
    type: "checkpoint",
    description:
      "FLUX.2 Dev with FP8 quantization — high quality text-to-image",
    sizeEstimate: "17GB",
    requirements: ["RTX 3060+ (12GB VRAM)", "ComfyUI"],
  },
  {
    id: "sd-xl-base",
    name: "Stable Diffusion XL Base 1.0",
    url: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors",
    filename: "sd_xl_base_1.0.safetensors",
    type: "checkpoint",
    description: "SDXL 1.0 base model — versatile image generation",
    sizeEstimate: "6.5GB",
    requirements: ["8GB VRAM", "ComfyUI"],
  },
  {
    id: "ltx-video",
    name: "LTX Video",
    url: "https://huggingface.co/Lightricks/LTX-Video/resolve/main/ltx-video-2b-v0.9.1.safetensors",
    filename: "ltx-video-2b-v0.9.1.safetensors",
    type: "checkpoint",
    description: "LTX Video 2B — text-to-video and image-to-video generation",
    sizeEstimate: "4.5GB",
    requirements: ["RTX 3070+ (8GB VRAM)", "ComfyUI"],
  },
  {
    id: "4x-ultrasharp",
    name: "4x-UltraSharp Upscaler",
    url: "https://huggingface.co/Kim2091/UltraSharp/resolve/main/4x-UltraSharp.pth",
    filename: "4x-UltraSharp.pth",
    type: "upscaler",
    description: "4x upscaler for high-quality image enlargement",
    sizeEstimate: "67MB",
    requirements: ["ComfyUI"],
  },
];

// ─── GPU / CUDA Detection ───────────────────────────────────────

let _gpuCache: GPUInfo | null = null;
let _gpuCacheTs = 0;
const GPU_CACHE_TTL_MS = 60_000; // 1 minute

function getTargetNode(): LMLinkNode | null {
  return getComfyUITargetNode();
}

export async function checkCUDAAvailability(): Promise<GPUInfo> {
  const target = getTargetNode();
  if (target && !target.isLocal) {
    // Rely on LM Link registry profile for remote machines instead of probing via docker/ssh
    const profile = LM_LINK_GPU_PROFILES[target.gpuProfile];
    return {
      available: true,
      name: profile?.label ?? "Remote GPU",
      vram: `${profile?.vramGb ?? 0}GB`,
      driverVersion: "unknown",
      cudaVersion: "unknown",
    };
  }

  if (_gpuCache && Date.now() - _gpuCacheTs < GPU_CACHE_TTL_MS) {
    return _gpuCache;
  }

  try {
    const { stdout: output } = await execAsync(
      "nvidia-smi --query-gpu=gpu_name,memory.total,driver_version --format=csv,noheader,nounits",
      { encoding: "utf-8", timeout: 5000 },
    );
    const trimmed = output.trim();

    if (!trimmed) {
      _gpuCache = { available: false, error: "nvidia-smi returned empty output" };
      _gpuCacheTs = Date.now();
      return _gpuCache;
    }

    const parts = trimmed.split(",").map((s) => s.trim());
    const name = parts[0] ?? "Unknown GPU";
    const vramMB = parseInt(parts[1] ?? "0", 10);
    const driverVersion = parts[2] ?? "unknown";

    // Try to get CUDA version
    let cudaVersion = "unknown";
    try {
      const { stdout: cudaOut } = await execAsync("nvidia-smi --query-gpu=compute_cap --format=csv,noheader", {
        encoding: "utf-8",
        timeout: 5000,
      });
      cudaVersion = cudaOut.trim() || "unknown";
    } catch {
      // CUDA version query failed — not critical
    }

    _gpuCache = {
      available: true,
      name,
      vram: `${Math.round(vramMB / 1024)}GB`,
      driverVersion,
      cudaVersion,
    };
    _gpuCacheTs = Date.now();
    return _gpuCache;
  } catch (err) {
    _gpuCache = {
      available: false,
      error: err instanceof Error ? err.message : String(err),
    };
    _gpuCacheTs = Date.now();
    return _gpuCache;
  }
}

/**
 * Check if ComfyUI is reachable. Returns the live API URL if found, or null.
 * Probes both standard port (8188) and RTX preset port (8189).
 */
export async function checkComfyUIHealth(): Promise<string | null> {
  const target = getTargetNode();
  const hosts = target && !target.isLocal ? [target.host] : ["127.0.0.1"];

  // Try standard port 8188, then RTX preset port 8189
  for (const host of hosts) {
    for (const port of [8188, 8189]) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const resp = await fetch(`http://${host}:${port}/system_stats`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (resp.ok) { return `http://${host}:${port}`; }
      } catch {
        // Try next port
      }
    }
  }
  return null;
}

// ─── Docker Integration ─────────────────────────────────────────

async function isDockerAvailable(): Promise<boolean> {
  try {
    const target = getTargetNode();
    await remoteDockerExecAsync(["info"], 5000, target?.dockerHostUrl);
    return true;
  } catch {
    return false;
  }
}

async function getComfyUIContainer(): Promise<{ name: string; status: string } | null> {
  try {
    const target = getTargetNode();
    const output = await remoteDockerExecAsync(
      ['ps', '-a', '--filter', '"name=hoc-comfyui"', '--format', '"{{.Names}}|{{.Status}}"'],
      5000,
      target?.dockerHostUrl
    );
    const trimmed = output.trim();
    if (!trimmed) { return null; }
    const first = trimmed.split("\n")[0];
    const [name, status] = (first ?? "").split("|");
    return { name: name ?? "", status: status ?? "" };
  } catch {
    return null;
  }
}

export async function ensureComfyUI(): Promise<{
  launched: boolean;
  alreadyRunning: boolean;
  error?: string;
}> {
  // Check if already running
  const liveUrl = await checkComfyUIHealth();
  if (liveUrl) {
    return { launched: false, alreadyRunning: true };
  }

  // Check Docker availability
  if (!(await isDockerAvailable())) {
    return {
      launched: false,
      alreadyRunning: false,
      error: "Docker is not available. Install Docker Desktop to auto-launch ComfyUI.",
    };
  }

  // Check GPU
  const gpu = await checkCUDAAvailability();
  if (!gpu.available) {
    logger.warn("No NVIDIA GPU detected — ComfyUI will run on CPU (very slow)");
  }

  // Check if container exists but stopped
  const existing = await getComfyUIContainer();
  if (existing) {
    if (existing.status.toLowerCase().includes("up")) {
      // Container is running but health check failed — might still be starting
      return { launched: false, alreadyRunning: true };
    }
    // Restart stopped container
    try {
      const target = getTargetNode();
      await remoteDockerExecAsync(["start", existing.name], 15000, target?.dockerHostUrl);
      logger.info(`Restarted existing ComfyUI container: ${existing.name}`);
      return { launched: true, alreadyRunning: false };
    } catch (err) {
      return {
        launched: false,
        alreadyRunning: false,
        error: `Failed to restart container: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Launch new container via Docker preset
  try {
    const containerName = `hoc-comfyui-${Date.now().toString(36).slice(-6)}`;
    const args = [
      "run", "-d",
      "--name", containerName,
      "--restart", "unless-stopped",
      "-p", "8188:8188",
      "-v", "hoc-comfyui:/root",
      ...(gpu.available ? ["--gpus", "all"] : []),
      "--memory", "16g",
      "--cpus", "4.0",
      "--label", "hoc.managed=true",
      "--label", "hoc.service=comfyui",
      "yanwk/comfyui-boot:cu128-megapak",
    ];

    // 10 minute timeout — ComfyUI image is ~15GB, needs time to pull
    const target = getTargetNode();
    await remoteDockerExecAsync(args, 600_000, target?.dockerHostUrl);

    logger.info(`Launched ComfyUI container: ${containerName}`);
    return { launched: true, alreadyRunning: false };
  } catch (err) {
    return {
      launched: false,
      alreadyRunning: false,
      error: `Failed to launch ComfyUI: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Model Management ───────────────────────────────────────────

export async function listInstalledModels(): Promise<ComfyUIModel[]> {
  const models: ComfyUIModel[] = [];
  const subdirs = ["checkpoints", "loras", "vae", "controlnet", "upscale_models", "clip"];

  for (const subdir of subdirs) {
    const dir = join(COMFYUI_MODELS_DIR, subdir);
    if (!existsSync(dir)) { continue; }

    try {
      const files = await readdir(dir);
      for (const file of files) {
        const fullPath = join(dir, file);
        try {
          const st = await stat(fullPath);
          if (!st.isFile()) { continue; }

          const typeMap: Record<string, ComfyUIModel["type"]> = {
            checkpoints: "checkpoint",
            loras: "lora",
            vae: "vae",
            controlnet: "controlnet",
            upscale_models: "upscaler",
            clip: "clip",
          };

          models.push({
            id: `${subdir}/${file}`,
            name: file.replace(/\.(safetensors|ckpt|pt|pth|bin)$/i, ""),
            filename: file,
            type: typeMap[subdir] ?? "unknown",
            sizeBytes: st.size,
            path: fullPath,
          });
        } catch {
          // Skip files we can't stat
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  // Also check Docker volume if local directory is empty
  if (models.length === 0 && (await isDockerAvailable())) {
    try {
      const target = getTargetNode();
      const args = ['run', '--rm', '-v', 'hoc-comfyui:/root', 'alpine', 'find', '/root/ComfyUI/models', '-name', '*.safetensors', '-o', '-name', '*.ckpt', '-o', '-name', '*.pth'];
      const output = await remoteDockerExecAsync(args, 10000, target?.dockerHostUrl);
      const trimmed = output.trim();

      if (trimmed) {
        for (const line of trimmed.split("\n").filter(Boolean)) {
          const filename = line.split("/").pop() ?? "";
          const parentDir = line.split("/").slice(-2, -1)[0] ?? "";
          const typeMap: Record<string, ComfyUIModel["type"]> = {
            checkpoints: "checkpoint",
            loras: "lora",
            vae: "vae",
            controlnet: "controlnet",
            upscale_models: "upscaler",
            clip: "clip",
          };

          models.push({
            id: `docker:${parentDir}/${filename}`,
            name: filename.replace(/\.(safetensors|ckpt|pt|pth|bin)$/i, ""),
            filename,
            type: typeMap[parentDir] ?? "unknown",
            sizeBytes: 0, // Can't easily get size from Docker volume
            path: line,
          });
        }
      }
    } catch {
      // Docker volume inspection failed
    }
  }

  return models;
}

export async function downloadModel(
  modelId: string,
  onProgress?: (pct: number, downloaded: number, total: number) => void,
): Promise<{ ok: boolean; error?: string; path?: string }> {
  const model = MODEL_REGISTRY.find((m) => m.id === modelId);
  if (!model) {
    return { ok: false, error: `Unknown model: ${modelId}` };
  }

  // Determine destination
  const typeDir: Record<string, string> = {
    checkpoint: "checkpoints",
    lora: "loras",
    vae: "vae",
    controlnet: "controlnet",
    upscaler: "upscale_models",
    clip: "clip",
  };

  const destDir = join(COMFYUI_MODELS_DIR, typeDir[model.type] ?? "checkpoints");
  const destPath = join(destDir, model.filename);

  // Check if already downloaded
  if (existsSync(destPath)) {
    return { ok: true, path: destPath };
  }

  // Ensure directory exists
  mkdirSync(destDir, { recursive: true });

  logger.info(`Downloading model: ${model.name} → ${destPath}`);

  // Use curl for download (available on all platforms) with progress
  return new Promise((resolve) => {
    const curlArgs = [
      "-L", // Follow redirects
      "-o", destPath,
      "--progress-bar",
      model.url,
    ];

    const child = spawn("curl", curlArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let lastPct = 0;

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      // Parse curl progress: "  64  4.5G   64 2.9G    0     0  15.3M      0  0:05:00  0:03:08  0:01:52 15.1M"
      const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
      if (match) {
        const pct = parseFloat(match[1]);
        if (pct > lastPct) {
          lastPct = pct;
          onProgress?.(pct, 0, 0);
        }
      }
    });

    child.on("close", (code) => {
      if (code === 0 && existsSync(destPath)) {
        logger.info(`Model downloaded successfully: ${model.name}`);
        resolve({ ok: true, path: destPath });
      } else {
        resolve({ ok: false, error: `curl exited with code ${code}` });
      }
    });

    child.on("error", (err) => {
      resolve({ ok: false, error: err.message });
    });
  });
}

// ─── Aggregated Status ──────────────────────────────────────────

export async function getComfyUIStatus(): Promise<ComfyUIStatus> {
  const [liveUrl, gpu] = await Promise.all([
    checkComfyUIHealth(),
    checkCUDAAvailability(),
  ]);

  const running = liveUrl !== null;
  const dockerAvail = await isDockerAvailable();
  const container = dockerAvail ? await getComfyUIContainer() : null;
  const installedModels = await listInstalledModels();

  // Compute which models from registry are not yet installed
  const installedNames = new Set(installedModels.map((m) => m.filename));
  const availableDownloads = MODEL_REGISTRY.filter((m) => !installedNames.has(m.filename));

  // Use the discovered live URL if available, otherwise construct from target node
  const apiHostUrl = liveUrl ?? (
    (() => {
      const target = getTargetNode();
      return target && !target.isLocal ? `http://${target.host}:8188` : COMFYUI_API_URL;
    })()
  );

  return {
    running,
    url: apiHostUrl,
    dockerAvailable: dockerAvail,
    containerName: container?.name ?? null,
    containerStatus: container?.status ?? null,
    gpu,
    installedModels,
    availableDownloads,
  };
}

export function getModelRegistry(): ComfyUIModelDownload[] {
  return [...MODEL_REGISTRY];
}
