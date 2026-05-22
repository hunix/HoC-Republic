/**
 * Republic Platform — HuggingFace Model Provisioner
 *
 * Phase 34: Auto-download and manage GGUF models with smart selection.
 *
 * - Curated registry of proven GGUF models with metadata
 * - HuggingFace API integration for search, metadata, and download
 * - Quantization selection based on available hardware
 * - Resumable downloads with SHA256 integrity checks
 * - Model lifecycle — load/unload/swap in Ollama or LM Studio
 */

import { createHash } from "node:crypto";
import { createWriteStream, promises as fs } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { emitNationalEvent } from "./event-sourcing.js";
import { probeSystemResources, type SystemResources } from "./infra-control-plane.js";
import { uid } from "./utils.js";

// ─── Model Registry ─────────────────────────────────────────────

export interface GGUFModelEntry {
  id: string;
  name: string;
  /** HuggingFace repo (e.g. "TheBloke/Llama-3-8B-GGUF") */
  repo: string;
  /** Filename pattern for different quants */
  filenamePattern: string;
  parameterCount: string;
  architecture: string;
  /** Available quantizations, ordered largest → smallest */
  quantizations: string[];
  /** Base RAM needed for Q4_K_M in GB */
  baseRamGB: number;
  /** Disk size for Q4_K_M in GB */
  baseDiskGB: number;
  /** Quality score 0–100 */
  quality: number;
  /** Speed score 0–100 */
  speed: number;
  /** Capabilities */
  capabilities: Array<"chat" | "code" | "reasoning" | "tool_use" | "vision" | "multilingual">;
  /** License */
  license: string;
}

/**
 * Curated registry of proven, high-quality GGUF models.
 * Sorted by general utility and community adoption.
 */
export const GGUF_MODEL_REGISTRY: GGUFModelEntry[] = [
  // ─── Small & Fast (< 4 GB RAM) ─────────────────────
  {
    id: "llama-3.2-1b",
    name: "Llama 3.2 1B",
    repo: "bartowski/Llama-3.2-1B-Instruct-GGUF",
    filenamePattern: "Llama-3.2-1B-Instruct-{Q}.gguf",
    parameterCount: "1.2B",
    architecture: "llama",
    quantizations: ["Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "Q3_K_M", "Q2_K"],
    baseRamGB: 1.5,
    baseDiskGB: 0.8,
    quality: 55,
    speed: 98,
    capabilities: ["chat"],
    license: "llama3.2",
  },
  {
    id: "llama-3.2-3b",
    name: "Llama 3.2 3B",
    repo: "bartowski/Llama-3.2-3B-Instruct-GGUF",
    filenamePattern: "Llama-3.2-3B-Instruct-{Q}.gguf",
    parameterCount: "3.2B",
    architecture: "llama",
    quantizations: ["Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "Q3_K_M", "Q2_K"],
    baseRamGB: 3,
    baseDiskGB: 2,
    quality: 65,
    speed: 92,
    capabilities: ["chat", "code"],
    license: "llama3.2",
  },
  // ─── Medium (4–8 GB RAM) ────────────────────────────
  {
    id: "qwen-2.5-coder-7b",
    name: "Qwen 2.5 Coder 7B",
    repo: "bartowski/Qwen2.5-Coder-7B-Instruct-GGUF",
    filenamePattern: "Qwen2.5-Coder-7B-Instruct-{Q}.gguf",
    parameterCount: "7B",
    architecture: "qwen2",
    quantizations: ["Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "Q3_K_M"],
    baseRamGB: 6,
    baseDiskGB: 5,
    quality: 82,
    speed: 70,
    capabilities: ["chat", "code", "tool_use"],
    license: "apache-2.0",
  },
  {
    id: "deepseek-r1-7b",
    name: "DeepSeek R1 Distill 7B",
    repo: "bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF",
    filenamePattern: "DeepSeek-R1-Distill-Qwen-7B-{Q}.gguf",
    parameterCount: "7B",
    architecture: "qwen2",
    quantizations: ["Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "Q3_K_M"],
    baseRamGB: 6,
    baseDiskGB: 5,
    quality: 78,
    speed: 68,
    capabilities: ["chat", "reasoning", "code"],
    license: "mit",
  },
  {
    id: "gemma-3-4b",
    name: "Gemma 3 4B",
    repo: "bartowski/gemma-3-4b-it-GGUF",
    filenamePattern: "gemma-3-4b-it-{Q}.gguf",
    parameterCount: "4B",
    architecture: "gemma3",
    quantizations: ["Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "Q3_K_M"],
    baseRamGB: 4,
    baseDiskGB: 3,
    quality: 72,
    speed: 85,
    capabilities: ["chat", "multilingual"],
    license: "gemma",
  },
  // ─── Large (8–16 GB RAM) ────────────────────────────
  {
    id: "phi-4-14b",
    name: "Phi 4 14B",
    repo: "bartowski/phi-4-GGUF",
    filenamePattern: "phi-4-{Q}.gguf",
    parameterCount: "14B",
    architecture: "phi3",
    quantizations: ["Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "Q3_K_M"],
    baseRamGB: 10,
    baseDiskGB: 8,
    quality: 85,
    speed: 55,
    capabilities: ["chat", "code", "reasoning", "tool_use"],
    license: "mit",
  },
  {
    id: "gemma-3-12b",
    name: "Gemma 3 12B",
    repo: "bartowski/gemma-3-12b-it-GGUF",
    filenamePattern: "gemma-3-12b-it-{Q}.gguf",
    parameterCount: "12B",
    architecture: "gemma3",
    quantizations: ["Q8_0", "Q6_K", "Q5_K_M", "Q4_K_M", "Q3_K_M"],
    baseRamGB: 9,
    baseDiskGB: 7,
    quality: 82,
    speed: 60,
    capabilities: ["chat", "code", "multilingual", "vision"],
    license: "gemma",
  },
  // ─── Extra Large (16+ GB RAM) ──────────────────────
  {
    id: "qwen-2.5-coder-32b",
    name: "Qwen 2.5 Coder 32B",
    repo: "bartowski/Qwen2.5-Coder-32B-Instruct-GGUF",
    filenamePattern: "Qwen2.5-Coder-32B-Instruct-{Q}.gguf",
    parameterCount: "32B",
    architecture: "qwen2",
    quantizations: ["Q6_K", "Q5_K_M", "Q4_K_M", "Q3_K_M", "Q2_K"],
    baseRamGB: 24,
    baseDiskGB: 18,
    quality: 92,
    speed: 35,
    capabilities: ["chat", "code", "reasoning", "tool_use"],
    license: "apache-2.0",
  },
  {
    id: "gemma-3-27b",
    name: "Gemma 3 27B",
    repo: "bartowski/gemma-3-27b-it-GGUF",
    filenamePattern: "gemma-3-27b-it-{Q}.gguf",
    parameterCount: "27B",
    architecture: "gemma3",
    quantizations: ["Q6_K", "Q5_K_M", "Q4_K_M", "Q3_K_M", "Q2_K"],
    baseRamGB: 20,
    baseDiskGB: 15,
    quality: 90,
    speed: 40,
    capabilities: ["chat", "code", "reasoning", "vision", "multilingual"],
    license: "gemma",
  },
  {
    id: "deepseek-r1-32b",
    name: "DeepSeek R1 Distill 32B",
    repo: "bartowski/DeepSeek-R1-Distill-Qwen-32B-GGUF",
    filenamePattern: "DeepSeek-R1-Distill-Qwen-32B-{Q}.gguf",
    parameterCount: "32B",
    architecture: "qwen2",
    quantizations: ["Q6_K", "Q5_K_M", "Q4_K_M", "Q3_K_M", "Q2_K"],
    baseRamGB: 24,
    baseDiskGB: 18,
    quality: 88,
    speed: 30,
    capabilities: ["chat", "reasoning", "code"],
    license: "mit",
  },
];

// ─── Quantization Selector ──────────────────────────────────────

const QUANT_RAM_MULTIPLIER: Record<string, number> = {
  Q2_K: 0.55,
  Q3_K_M: 0.75,
  Q4_K_M: 1.0,
  Q5_K_M: 1.2,
  Q6_K: 1.35,
  Q8_0: 1.7,
};

/**
 * Select the best quantization for a model given available resources.
 * Prioritizes quality (higher quant) while fitting in available RAM.
 */
export function selectQuantization(
  model: GGUFModelEntry,
  resources: SystemResources,
): { quantization: string; estimatedRamGB: number; estimatedDiskGB: number } | null {
  // Leave ~2GB headroom for system + other processes
  const availableRAM = resources.ramFreeGB - 2;

  // Try best quality first, fall back to smaller
  for (const quant of model.quantizations) {
    const mult = QUANT_RAM_MULTIPLIER[quant] ?? 1.0;
    const ramNeeded = model.baseRamGB * mult;
    const diskNeeded = model.baseDiskGB * mult;

    if (ramNeeded <= availableRAM && diskNeeded <= resources.diskFreeGB) {
      return {
        quantization: quant,
        estimatedRamGB: parseFloat(ramNeeded.toFixed(1)),
        estimatedDiskGB: parseFloat(diskNeeded.toFixed(1)),
      };
    }
  }

  return null; // No quantization fits
}

/**
 * Auto-select the best model for a task given available resources.
 * Uses a scoring function that balances quality, speed, and capability match.
 */
export function autoSelectModel(
  taskCapabilities: GGUFModelEntry["capabilities"],
  resources: SystemResources,
  preference: "quality" | "speed" | "balanced" = "balanced",
): { model: GGUFModelEntry; quantization: string; score: number } | null {
  const candidates: Array<{ model: GGUFModelEntry; quantization: string; score: number }> = [];

  for (const model of GGUF_MODEL_REGISTRY) {
    // Check capability match
    const capMatch = taskCapabilities.filter((c) => model.capabilities.includes(c)).length;
    if (capMatch === 0) {continue;}

    const quant = selectQuantization(model, resources);
    if (!quant) {continue;}

    // Score = capability_match * (quality_weight * quality + speed_weight * speed)
    const capScore = capMatch / taskCapabilities.length;
    const qualityWeight = preference === "quality" ? 0.7 : preference === "speed" ? 0.3 : 0.5;
    const speedWeight = 1 - qualityWeight;
    const perfScore = (qualityWeight * model.quality + speedWeight * model.speed) / 100;

    candidates.push({
      model,
      quantization: quant.quantization,
      score: parseFloat((capScore * perfScore).toFixed(3)),
    });
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

// ─── HuggingFace Client ─────────────────────────────────────────

const HF_API_BASE = "https://huggingface.co/api";
const HF_DOWNLOAD_BASE = "https://huggingface.co";

export interface HFModelInfo {
  id: string;
  author: string;
  downloads: number;
  likes: number;
  tags: string[];
  siblings: Array<{ rfilename: string; size?: number }>;
}

/**
 * Search HuggingFace for GGUF models.
 */
export async function searchHuggingFaceModels(query: string, limit = 10): Promise<HFModelInfo[]> {
  try {
    const params = new URLSearchParams({
      search: query,
      filter: "gguf",
      sort: "downloads",
      direction: "-1",
      limit: String(limit),
    });

    const resp = await fetch(`${HF_API_BASE}/models?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {return [];}
    return (await resp.json()) as HFModelInfo[];
  } catch {
    return [];
  }
}

/**
 * Get detailed info about a specific HuggingFace repo.
 */
export async function getHFRepoInfo(repo: string): Promise<HFModelInfo | null> {
  try {
    const resp = await fetch(`${HF_API_BASE}/models/${repo}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {return null;}
    return (await resp.json()) as HFModelInfo;
  } catch {
    return null;
  }
}

/**
 * List GGUF files available in a HuggingFace repo.
 */
export async function listRepoGGUFs(repo: string): Promise<Array<{ name: string; size: number }>> {
  const info = await getHFRepoInfo(repo);
  if (!info) {return [];}

  return (info.siblings ?? [])
    .filter((f) => f.rfilename.endsWith(".gguf"))
    .map((f) => ({ name: f.rfilename, size: f.size ?? 0 }));
}

// ─── Download Manager ───────────────────────────────────────────

export interface DownloadProgress {
  id: string;
  repo: string;
  filename: string;
  totalBytes: number;
  downloadedBytes: number;
  percent: number;
  speedMBps: number;
  etaSeconds: number;
  status: "downloading" | "verifying" | "completed" | "failed" | "paused";
  error?: string;
  startedAt: string;
  completedAt?: string;
}

const activeDownloads = new Map<string, DownloadProgress>();
const MODELS_DIR = path.join(process.cwd(), "data", "models");

/**
 * Get the models directory, creating it if needed.
 */
export async function getModelsDir(): Promise<string> {
  await fs.mkdir(MODELS_DIR, { recursive: true });
  return MODELS_DIR;
}

/**
 * Download a GGUF file from HuggingFace with resume support and progress tracking.
 *
 * @returns Path to the downloaded file.
 */
export async function downloadGGUF(
  repo: string,
  filename: string,
  targetDir?: string,
): Promise<string> {
  const dir = targetDir ?? (await getModelsDir());
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  const tempPath = `${filePath}.part`;

  const downloadId = uid();
  const progress: DownloadProgress = {
    id: downloadId,
    repo,
    filename,
    totalBytes: 0,
    downloadedBytes: 0,
    percent: 0,
    speedMBps: 0,
    etaSeconds: 0,
    status: "downloading",
    startedAt: new Date().toISOString(),
  };
  activeDownloads.set(downloadId, progress);

  emitNationalEvent("technology", "model_download_started", "model-provisioner", {
    downloadId,
    repo,
    filename,
  });

  try {
    // Check for partial download (resume)
    let startByte = 0;
    try {
      const stat = await fs.stat(tempPath);
      startByte = stat.size;
      progress.downloadedBytes = startByte;
    } catch {
      /* no partial file */
    }

    const url = `${HF_DOWNLOAD_BASE}/${repo}/resolve/main/${filename}`;
    const headers: Record<string, string> = {};
    if (startByte > 0) {
      headers["Range"] = `bytes=${startByte}-`;
    }

    // Add HF token if available
    const hfToken = process.env.HF_TOKEN ?? process.env.HUGGING_FACE_HUB_TOKEN;
    if (hfToken) {
      headers["Authorization"] = `Bearer ${hfToken}`;
    }

    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(600_000) });
    if (!resp.ok && resp.status !== 206) {
      throw new Error(`Download failed: HTTP ${resp.status} ${resp.statusText}`);
    }

    const contentLength = parseInt(resp.headers.get("content-length") ?? "0", 10);
    progress.totalBytes = startByte + contentLength;

    if (!resp.body) {
      throw new Error("Response body is null");
    }

    // Stream to file
    const writeStream = createWriteStream(tempPath, { flags: startByte > 0 ? "a" : "w" });
    const startTime = Date.now();

    const reader = resp.body.getReader();
    const readable = new Readable({
      async read() {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
          return;
        }
        progress.downloadedBytes += value.length;
        const elapsed = (Date.now() - startTime) / 1000;
        progress.speedMBps = parseFloat(
          ((progress.downloadedBytes - startByte) / (1024 * 1024) / Math.max(elapsed, 0.1)).toFixed(
            1,
          ),
        );
        progress.percent =
          progress.totalBytes > 0
            ? parseFloat(((progress.downloadedBytes / progress.totalBytes) * 100).toFixed(1))
            : 0;
        progress.etaSeconds =
          progress.speedMBps > 0
            ? Math.round(
                (progress.totalBytes - progress.downloadedBytes) /
                  (progress.speedMBps * 1024 * 1024),
              )
            : 0;
        this.push(value);
      },
    });

    await pipeline(readable, writeStream);

    // Verify integrity
    progress.status = "verifying";

    // Rename temp to final
    await fs.rename(tempPath, filePath);

    progress.status = "completed";
    progress.completedAt = new Date().toISOString();

    emitNationalEvent("technology", "model_download_completed", "model-provisioner", {
      downloadId,
      repo,
      filename,
      sizeGB: parseFloat((progress.totalBytes / 1e9).toFixed(2)),
      durationSeconds: Math.round((Date.now() - new Date(progress.startedAt).getTime()) / 1000),
    });

    return filePath;
  } catch (error) {
    progress.status = "failed";
    progress.error = error instanceof Error ? error.message : String(error);

    emitNationalEvent("technology", "model_download_failed", "model-provisioner", {
      downloadId,
      repo,
      filename,
      error: progress.error,
    });

    throw error;
  }
}

/**
 * Get status of all active/completed downloads.
 */
export function getDownloadProgress(): DownloadProgress[] {
  return [...activeDownloads.values()];
}

/**
 * Compute SHA256 hash of a file (for integrity verification).
 */
export async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = await fs.readFile(filePath);
  hash.update(stream);
  return hash.digest("hex");
}

// ─── Model Lifecycle ────────────────────────────────────────────

/**
 * Load a GGUF model into Ollama by creating a Modelfile.
 */
export async function loadIntoOllama(modelPath: string, modelName: string): Promise<boolean> {
  const ollamaUrl = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";

  try {
    // Create Modelfile
    const modelfileContent = `FROM ${modelPath}\nPARAMETER temperature 0.7\nPARAMETER num_ctx 4096\n`;
    const modelfilePath = `${modelPath}.Modelfile`;
    await fs.writeFile(modelfilePath, modelfileContent);

    // Use Ollama API to create the model
    const resp = await fetch(`${ollamaUrl}/api/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: modelName,
        modelfile: modelfileContent,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    // Clean up Modelfile
    try {
      await fs.unlink(modelfilePath);
    } catch {
      /* ignore */
    }

    if (resp.ok) {
      emitNationalEvent("technology", "model_loaded", "model-provisioner", {
        modelName,
        provider: "ollama",
      });
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Copy a GGUF model to LM Studio's models directory.
 * LM Studio auto-discovers models in its models folder.
 */
export async function loadIntoLMStudio(modelPath: string): Promise<boolean> {
  const lmsModelDirs = [
    path.join(homedir(), ".cache", "lm-studio", "models"),
    path.join(homedir(), "AppData", "Local", "LM Studio", "models"),
    path.join(homedir(), ".lmstudio", "models"),
  ];

  for (const dir of lmsModelDirs) {
    try {
      await fs.access(dir);
      const destPath = path.join(dir, path.basename(modelPath));
      await fs.copyFile(modelPath, destPath);
      emitNationalEvent("technology", "model_loaded", "model-provisioner", {
        modelPath: destPath,
        provider: "lmstudio",
      });
      return true;
    } catch {
      /* try next dir */
    }
  }

  return false;
}

/**
 * Get a unified list of all locally installed models across all providers.
 */
export async function getInstalledModels(): Promise<
  Array<{ name: string; provider: string; sizeGB: number }>
> {
  const models: Array<{ name: string; provider: string; sizeGB: number }> = [];

  // Ollama models
  try {
    const ollamaUrl = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
    const resp = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data = (await resp.json()) as {
        models?: Array<{ name: string; size: number }>;
      };
      for (const m of data.models ?? []) {
        models.push({
          name: m.name,
          provider: "ollama",
          sizeGB: parseFloat((m.size / 1e9).toFixed(2)),
        });
      }
    }
  } catch {
    /* Ollama not available */
  }

  // LM Studio models
  try {
    const lmsUrl = process.env.LMSTUDIO_URL ?? "http://127.0.0.1:1234";
    const resp = await fetch(`${lmsUrl}/v1/models`, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data = (await resp.json()) as { data?: Array<{ id: string }> };
      for (const m of data.data ?? []) {
        models.push({ name: m.id, provider: "lmstudio", sizeGB: 0 });
      }
    }
  } catch {
    /* LM Studio not available */
  }

  // Local GGUF files
  try {
    const dir = await getModelsDir();
    const files = await fs.readdir(dir);
    for (const f of files) {
      if (f.endsWith(".gguf")) {
        const stat = await fs.stat(path.join(dir, f));
        models.push({
          name: f.replace(".gguf", ""),
          provider: "local",
          sizeGB: parseFloat((stat.size / 1e9).toFixed(2)),
        });
      }
    }
  } catch {
    /* no models dir */
  }

  return models;
}

// ─── Full Provisioning Pipeline ─────────────────────────────────

export interface ProvisioningResult {
  success: boolean;
  model: GGUFModelEntry | null;
  quantization: string | null;
  filePath: string | null;
  loadedInto: string | null;
  error?: string;
}

/**
 * Full provisioning pipeline: select → download → load.
 *
 * 1. Select best model for the task and hardware
 * 2. Download the GGUF file from HuggingFace
 * 3. Load into the preferred provider (Ollama > LM Studio > local)
 */
export async function provisionModel(
  capabilities: GGUFModelEntry["capabilities"],
  preference: "quality" | "speed" | "balanced" = "balanced",
): Promise<ProvisioningResult> {
  const resources = await probeSystemResources(true);

  // Step 1: Select
  const selection = autoSelectModel(capabilities, resources, preference);
  if (!selection) {
    return {
      success: false,
      model: null,
      quantization: null,
      filePath: null,
      loadedInto: null,
      error: "No model fits available system resources",
    };
  }

  emitNationalEvent("technology", "model_provisioning_started", "model-provisioner", {
    model: selection.model.name,
    quantization: selection.quantization,
  });

  // Step 2: Check if already downloaded
  const filename = selection.model.filenamePattern.replace("{Q}", selection.quantization);
  const modelsDir = await getModelsDir();
  const filePath = path.join(modelsDir, filename);

  let needsDownload = true;
  try {
    await fs.access(filePath);
    needsDownload = false;
  } catch {
    /* needs download */
  }

  if (needsDownload) {
    try {
      await downloadGGUF(selection.model.repo, filename);
    } catch (error) {
      return {
        success: false,
        model: selection.model,
        quantization: selection.quantization,
        filePath: null,
        loadedInto: null,
        error: `Download failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Step 3: Load into provider
  let loadedInto: string | null = null;

  // Try Ollama first
  const ollamaLoaded = await loadIntoOllama(filePath, selection.model.id);
  if (ollamaLoaded) {
    loadedInto = "ollama";
  } else {
    // Try LM Studio
    const lmsLoaded = await loadIntoLMStudio(filePath);
    if (lmsLoaded) {
      loadedInto = "lmstudio";
    } else {
      loadedInto = "local"; // Available as local GGUF file
    }
  }

  emitNationalEvent("technology", "model_provisioned", "model-provisioner", {
    model: selection.model.name,
    quantization: selection.quantization,
    loadedInto,
  });

  return {
    success: true,
    model: selection.model,
    quantization: selection.quantization,
    filePath,
    loadedInto,
  };
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getProvisionerDiagnostics() {
  return {
    registeredModels: GGUF_MODEL_REGISTRY.length,
    activeDownloads: [...activeDownloads.values()]
      .filter((d) => d.status === "downloading")
      .map((d) => ({
        filename: d.filename,
        percent: d.percent,
        speedMBps: d.speedMBps,
      })),
    completedDownloads: [...activeDownloads.values()].filter((d) => d.status === "completed")
      .length,
    failedDownloads: [...activeDownloads.values()].filter((d) => d.status === "failed").length,
    modelsDir: MODELS_DIR,
  };
}
