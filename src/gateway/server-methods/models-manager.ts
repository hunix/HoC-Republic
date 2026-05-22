/**
 * Model Manager — Gateway RPC handlers
 *
 * Extends the existing models.ts handlers with full local model lifecycle:
 *   models.manager.catalog      — full model catalog with disk/status info
 *   models.manager.download     — start a HuggingFace download
 *   models.manager.delete       — remove a downloaded model file
 *   models.manager.progress     — get download progress map
 *   models.manager.scan         — re-scan disk for existing models
 *   models.manager.ollama.list  — list Ollama models
 *   models.manager.ollama.pull  — pull an Ollama model tag
 *   models.manager.ollama.delete— delete an Ollama model
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import * as path from "node:path";
import type { ModelDownloadParams, ModelDeleteParams } from "./rpc-params.js";
import type { GatewayRequestHandlers } from "./types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

// ─── Types (public types extracted to models-manager/types.ts) ────────────────
export type {
  ModelCategory,
  DownloadType,
  ModelFile,
  ManagedModel,
} from "./models-manager/types.js";
import type { ManagedModel } from "./models-manager/types.js";
// ─── Model Registry (extracted to models-manager/catalog.ts — 720+ static entries)
import { MODEL_REGISTRY } from "./models-manager/catalog.js";
export { MODEL_REGISTRY } from "./models-manager/catalog.js";

interface ActiveDownload {
  modelId: string;
  url: string;
  dest: string;
  partDest: string;
  progress: number;
  speed: number;
  totalBytes: number;
  downloadedBytes: number;
  startedAt: number;
  error?: string;
  request?: http.ClientRequest;
  paused?: boolean;
}

/** Persisted download state for gateway restart recovery */
interface DownloadState {
  activeDownloads: Record<
    string,
    {
      modelId: string;
      downloadedBytes: number;
      totalBytes: number;
      partPath: string;
      paused: boolean;
      startedAt: number;
      lastUpdated: number;
    }
  >;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve HF token from explicit param, then env (both names). */
function resolveHfToken(explicit?: string): string | undefined {
  return explicit || process.env.HUGGINGFACE_HUB_TOKEN || process.env.HF_TOKEN || undefined;
}

// ─── State ────────────────────────────────────────────────────────────────────

const activeDownloads = new Map<string, ActiveDownload>();

/**
 * Keep a failed download entry visible in activeDownloads for 30s so the UI
 * can show the error to the user, then clean up and process the next queued item.
 */
function scheduleErrorCleanup(modelId: string): void {
  const dl = activeDownloads.get(modelId);
  console.error(`[model-manager] Download failed for ${modelId}: ${dl?.error ?? "unknown error"}`);
  saveDownloadState();
  setTimeout(() => {
    activeDownloads.delete(modelId);
    processQueue();
  }, 30_000);
}

// ─── Download Queue & Throttle ───────────────────────────────────────────────

let MAX_CONCURRENT_DOWNLOADS = 3;
let bandwidthLimitBps = 0; // 0 = unlimited, in bytes per second

interface QueuedDownload {
  model: (typeof MODEL_REGISTRY)[number];
  hfToken?: string;
}
const downloadQueue: QueuedDownload[] = [];

/** Process the download queue — start downloads up to the concurrency limit */
function processQueue(): void {
  while (downloadQueue.length > 0) {
    const runningCount = [...activeDownloads.values()].filter((d) => !d.paused).length;
    if (runningCount >= MAX_CONCURRENT_DOWNLOADS) {
      break;
    }
    const next = downloadQueue.shift();
    if (next) {
      startDownloadImmediate(next.model, next.hfToken);
    }
  }
}

/** Enqueue a download — it starts immediately if under the concurrency limit */
function enqueueDownload(model: (typeof MODEL_REGISTRY)[number], hfToken?: string): void {
  if (activeDownloads.has(model.id)) {
    return;
  }
  const runningCount = [...activeDownloads.values()].filter((d) => !d.paused).length;
  if (runningCount >= MAX_CONCURRENT_DOWNLOADS) {
    downloadQueue.push({ model, hfToken });
    return;
  }
  startDownloadImmediate(model, hfToken);
}

// Data directory — mirrors scripts/install-models.ps1 layout
/** Walk up from a start directory to find the repo root (contains package.json) */
function _findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return path.resolve(startDir, "..", ".."); // fallback
}
const REPO_ROOT = _findRepoRoot(
  path.resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/i, "$1")),
);
const DATA_DIR = path.join(REPO_ROOT, "models");
const BITNET_DIR = path.join(DATA_DIR, "bitnet");
const GGUF_DIR = path.join(DATA_DIR, "gguf");
const PLUGINS_DIR = path.join(DATA_DIR, "plugins");
const DOWNLOADS_STATE_DIR = path.join(DATA_DIR, ".downloads");
const DOWNLOADS_STATE_FILE = path.join(DOWNLOADS_STATE_DIR, "state.json");

// HuggingFace cache — multi-file repos use this layout
const HF_CACHE =
  process.env.HF_HOME ??
  path.join(process.env.USERPROFILE ?? process.env.HOME ?? "~", ".cache", "huggingface", "hub");

const HF_BASE = "https://huggingface.co";
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";

// LM Studio default model path
const LM_STUDIO_DIR =
  process.env.LM_STUDIO_MODELS_PATH ??
  path.join(process.env.USERPROFILE ?? process.env.HOME ?? "~", ".cache", "lm-studio", "models");

// ─── Async Helpers (event-loop safe) ─────────────────────────────────────────

/** GPU info cache — nvidia-smi is expensive, cache for 30s */
let _gpuCache: { totalVramGB: number; gpus: Array<{ name: string; vramGB: number }> } | null = null;
let _gpuCacheTime = 0;

async function _getCachedGpuInfo(): Promise<{
  totalVramGB: number;
  gpus: Array<{ name: string; vramGB: number }>;
}> {
  const now = Date.now();
  if (_gpuCache && now - _gpuCacheTime < 30_000) {
    return _gpuCache;
  }

  let totalVramGB = 0;
  const gpus: Array<{ name: string; vramGB: number }> = [];
  try {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);
    const { stdout } = await execAsync(
      "nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits",
      { encoding: "utf-8", timeout: 5000 },
    );
    for (const line of stdout.trim().split("\n")) {
      const parts = line.split(",").map((s) => s.trim());
      if (parts.length >= 2) {
        const vram = Math.round((parseInt(parts[1], 10) / 1024) * 10) / 10;
        gpus.push({ name: parts[0], vramGB: vram });
        totalVramGB += vram;
      }
    }
  } catch {
    /* no NVIDIA GPU or nvidia-smi unavailable */
  }

  _gpuCache = { totalVramGB, gpus };
  _gpuCacheTime = now;
  return _gpuCache;
}

/** Async recursive directory size — does NOT block the event loop */
async function _asyncDirSize(dirPath: string): Promise<number> {
  const fsp = await import("node:fs/promises");
  try {
    let total = 0;
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    const tasks: Promise<number>[] = [];
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        tasks.push(_asyncDirSize(full));
      } else if (entry.isFile()) {
        tasks.push(
          fsp
            .stat(full)
            .then((s) => s.size)
            .catch(() => 0),
        );
      }
    }
    const sizes = await Promise.all(tasks);
    for (const s of sizes) {
      total += s;
    }
    return total;
  } catch {
    return 0;
  }
}

/** Disk usage cache — 60s TTL */
let _diskCache: Record<string, unknown> | null = null;
let _diskCacheTime = 0;

// ─── Download State Persistence ──────────────────────────────────────────────

function saveDownloadState(): void {
  try {
    fs.mkdirSync(DOWNLOADS_STATE_DIR, { recursive: true });
    const state: DownloadState = { activeDownloads: {} };
    for (const [id, dl] of activeDownloads) {
      state.activeDownloads[id] = {
        modelId: dl.modelId,
        downloadedBytes: dl.downloadedBytes,
        totalBytes: dl.totalBytes,
        partPath: dl.partDest,
        paused: dl.paused ?? false,
        startedAt: dl.startedAt,
        lastUpdated: Date.now(),
      };
    }
    fs.writeFileSync(DOWNLOADS_STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    /* best-effort */
  }
}

function loadDownloadState(): DownloadState | null {
  try {
    if (!fs.existsSync(DOWNLOADS_STATE_FILE)) {
      return null;
    }
    const raw = fs.readFileSync(DOWNLOADS_STATE_FILE, "utf-8");
    return JSON.parse(raw) as DownloadState;
  } catch {
    return null;
  }
}

// MODEL_REGISTRY: 720+ model entries now in models-manager/catalog.ts

// ─── Local Path Resolver ─────────────────────────────────────────────────────

function resolveLocalPath(model: (typeof MODEL_REGISTRY)[number]): string {
  // HF cache layout — multi-file repos resolve to the HF hub cache
  if (model.hfCacheLayout) {
    const safeName = model.repo.replace(/\//g, "--");
    return path.join(HF_CACHE, `models--${safeName}`, "snapshots", "main", model.filename);
  }

  switch (model.category) {
    case "bitnet":
      return path.join(BITNET_DIR, model.repo.replace(/\//g, "--"), model.filename);
    case "gguf":
      return path.join(GGUF_DIR, model.id, model.filename);
    case "embedding":
      return path.join(GGUF_DIR, "embeddings", model.filename);
    case "plugin":
      return path.join(PLUGINS_DIR, model.id, model.filename);
    case "diffusion":
    case "tts":
    case "audio":
    case "3d":
    case "face":
      return path.join(PLUGINS_DIR, model.id, model.filename);
    default:
      return path.join(DATA_DIR, model.filename);
  }
}

// ─── Catalog Builder ─────────────────────────────────────────────────────────

function buildCatalog(): ManagedModel[] {
  return MODEL_REGISTRY.map((entry) => {
    const localPath = resolveLocalPath(entry);
    const dl = activeDownloads.get(entry.id);

    let status: ManagedModel["status"] = "available";
    let sizeBytes: number | undefined;
    let downloadProgress: number | undefined;
    let downloadSpeed: number | undefined;

    if (dl) {
      status = dl.paused ? "paused" : "downloading";
      downloadProgress = dl.progress;
      downloadSpeed = dl.speed;
    } else {
      try {
        const stat = fs.statSync(localPath);
        if (stat.size > 100_000) {
          status = "downloaded";
          sizeBytes = stat.size;
        }
      } catch {
        status = "available";
      }
    }

    return {
      ...entry,
      localPath: status === "downloaded" ? localPath : undefined,
      sizeBytes,
      status,
      downloadProgress,
      downloadSpeed,
    };
  });
}

// ─── Downloader ───────────────────────────────────────────────────────────────

/** Internal: start a download immediately (bypassing queue). Called by enqueueDownload. */
function startDownloadImmediate(model: (typeof MODEL_REGISTRY)[number], hfToken?: string): void {
  if (activeDownloads.has(model.id)) {
    return;
  }
  console.log(
    `[model-manager] Starting download: ${model.id} (${model.name}) type=${model.downloadType ?? "single-file"}`,
  );

  const localPath = resolveLocalPath(model);
  const partPath = `${localPath}.part`;
  const dir = path.dirname(localPath);

  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* exists */
  }

  // ─── HF Repo Download (multi-file via huggingface-cli) ───────────────────
  if (model.downloadType === "hf-repo") {
    startHfRepoDownload(model, hfToken);
    return;
  }

  const url = `${HF_BASE}/${model.repo}/resolve/main/${model.filename}`;

  // Check existing partial file for resume
  let startByte = 0;
  try {
    const stat = fs.statSync(partPath);
    startByte = stat.size;
  } catch {
    /* no partial */
  }

  const dl: ActiveDownload = {
    modelId: model.id,
    url,
    dest: localPath,
    partDest: partPath,
    progress: 0,
    speed: 0,
    totalBytes: 0,
    downloadedBytes: startByte,
    startedAt: Date.now(),
  };
  activeDownloads.set(model.id, dl);

  const parsed = new URL(url);
  const _proto = parsed.protocol === "https:" ? https : http;
  const reqHeaders: Record<string, string> = {
    "User-Agent": "HoC-ModelManager/1.0",
  };
  if (hfToken) {
    reqHeaders["Authorization"] = `Bearer ${hfToken}`;
  }
  if (startByte > 0) {
    reqHeaders["Range"] = `bytes=${startByte}-`;
  }

  // Follow up to 5 redirects before giving up
  function makeRequest(requestUrl: string, depth: number): http.ClientRequest {
    if (depth > 5) {
      dl.error = "Too many redirects";
      activeDownloads.delete(model.id);
      return http.request(requestUrl); // dead stub
    }
    const parsedR = new URL(requestUrl);
    const protoR = parsedR.protocol === "https:" ? https : http;
    const r = protoR.request(
      {
        hostname: parsedR.hostname,
        path: parsedR.pathname + parsedR.search,
        headers: reqHeaders,
        method: "GET",
      },
      (res) => {
        // Redirect — consume response body to free socket, then follow
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume(); // drain so socket is freed (CRITICAL: not draining prevents redirects completing)
          const redirectUrl = res.headers.location;
          console.log(
            `[model-manager] ${model.id}: redirect ${res.statusCode} → ${redirectUrl.slice(0, 80)}...`,
          );
          dl.url = redirectUrl;
          const next = makeRequest(redirectUrl, depth + 1);
          dl.request = next;
          next.end();
          return;
        }
        // Non-2xx and non-redirect = error
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          // HTTP 416 (Range Not Satisfiable) — .part file is corrupt or stale, retry from scratch
          if (res.statusCode === 416 && startByte > 0) {
            try {
              fs.unlinkSync(partPath);
            } catch {
              /* already gone */
            }
            activeDownloads.delete(model.id);
            startDownloadImmediate(model, hfToken);
            return;
          }
          dl.error = `HTTP ${res.statusCode ?? "unknown"}`;
          console.error(`[model-manager] ${model.id}: HTTP ${res.statusCode} error`);
          scheduleErrorCleanup(model.id);
          return;
        }
        // 2xx → actual data stream
        handleStream(res, dl, model);
      },
    );
    r.on("error", (e) => {
      dl.error = e.message;
      scheduleErrorCleanup(model.id);
    });
    return r;
  }

  const req = makeRequest(url, 0);

  function handleStream(
    res: http.IncomingMessage,
    dl: ActiveDownload,
    model: (typeof MODEL_REGISTRY)[number],
  ) {
    const contentLen = parseInt(res.headers["content-length"] ?? "0", 10);
    dl.totalBytes = startByte + contentLen;

    const writeFlag = startByte > 0 ? "a" : "w";
    const ws = fs.createWriteStream(partPath, { flags: writeFlag });
    const startTime = Date.now();
    let lastUpdate = Date.now();

    res.on("data", (chunk: Buffer) => {
      // Bandwidth throttle: if limit is set, pause stream briefly to cap speed
      if (bandwidthLimitBps > 0) {
        const perDlLimit = Math.floor(
          bandwidthLimitBps /
            Math.max([...activeDownloads.values()].filter((d) => !d.paused).length, 1),
        );
        const elapsed = (Date.now() - startTime) / 1000;
        const expectedBytes = perDlLimit * elapsed;
        if (dl.downloadedBytes > expectedBytes) {
          res.pause();
          const delayMs = Math.min(
            ((dl.downloadedBytes - expectedBytes) / perDlLimit) * 1000,
            2000,
          );
          setTimeout(() => {
            try {
              res.resume();
            } catch {
              /* stream ended */
            }
          }, delayMs);
        }
      }
      ws.write(chunk);
      dl.downloadedBytes += chunk.length;

      const now = Date.now();
      if (now - lastUpdate >= 500) {
        lastUpdate = now;
        const elapsed = (now - startTime) / 1000;
        dl.speed =
          Math.round((dl.downloadedBytes / 1024 / 1024 / Math.max(elapsed, 0.1)) * 10) / 10;
        saveDownloadState();
        dl.progress =
          dl.totalBytes > 0 ? Math.round((dl.downloadedBytes / dl.totalBytes) * 100) : 0;
      }
    });

    res.on("end", () => {
      ws.end();
      ws.on("finish", () => {
        // ── Validate download completeness ──────────────────────────
        // If server provided Content-Length but we received less data,
        // the connection was dropped mid-transfer → don't rename a corrupt file.
        if (dl.totalBytes > 0 && dl.downloadedBytes < dl.totalBytes) {
          const pct = Math.round((dl.downloadedBytes / dl.totalBytes) * 100);
          console.error(
            `[model-manager] ${model.id}: INCOMPLETE download — got ${dl.downloadedBytes}/${dl.totalBytes} bytes (${pct}%). Retrying...`,
          );
          try {
            fs.unlinkSync(partPath);
          } catch {
            /* already gone */
          }
          activeDownloads.delete(model.id);
          // Retry once via the queue (will resume from scratch)
          enqueueDownload(model, hfToken);
          return;
        }

        // Also reject suspiciously small files (< 100KB) — likely an HTML error page
        try {
          const finalSize = fs.statSync(partPath).size;
          if (finalSize < 100_000) {
            console.error(
              `[model-manager] ${model.id}: download too small (${finalSize} bytes) — likely an error page, not a model file`,
            );
            try {
              fs.unlinkSync(partPath);
            } catch {
              /* already gone */
            }
            dl.error = `Downloaded file too small (${finalSize} bytes) — may need authentication or the model URL is invalid`;
            activeDownloads.set(model.id, dl);
            scheduleErrorCleanup(model.id);
            return;
          }
        } catch {
          /* stat failed, proceed anyway */
        }

        try {
          if (fs.existsSync(dl.dest)) {
            fs.unlinkSync(dl.dest);
          }
          fs.renameSync(dl.partDest, dl.dest);
          console.log(
            `[model-manager] Download complete: ${model.id} → ${dl.dest} (${Math.round(dl.downloadedBytes / 1024 / 1024)}MB)`,
          );
          activeDownloads.delete(model.id);
          processQueue();
        } catch (e) {
          dl.error = String(e);
          console.error(`[model-manager] ${model.id}: rename failed: ${String(e)}`);
          activeDownloads.delete(model.id);
          processQueue();
        }
      });
    });

    res.on("error", (e) => {
      ws.destroy();
      dl.error = e.message;
      scheduleErrorCleanup(model.id);
    });
  }

  dl.request = req;
  req.end();
}

// ─── HF Repo Download (multi-file via huggingface-cli) ────────────────────────

function startHfRepoDownload(model: (typeof MODEL_REGISTRY)[number], hfToken?: string): void {
  const dl: ActiveDownload = {
    modelId: model.id,
    url: `${HF_BASE}/${model.repo}`,
    dest: resolveLocalPath(model),
    partDest: "",
    progress: 0,
    speed: 0,
    totalBytes: 0,
    downloadedBytes: 0,
    startedAt: Date.now(),
  };
  activeDownloads.set(model.id, dl);

  // Build CLI args — download to the model's target directory
  const destDir = path.dirname(resolveLocalPath(model));
  const args = [
    "download",
    model.repo,
    "--local-dir",
    destDir,
    "--local-dir-use-symlinks",
    "False",
  ];
  if (hfToken) {
    args.push("--token", hfToken);
  }

  // Prefer the repo-local huggingface-cli from runtime/python/Scripts/
  const localHfCli = path.join(REPO_ROOT, "runtime", "python", "Scripts", "huggingface-cli.exe");
  const localPython = path.join(REPO_ROOT, "runtime", "python", "python.exe");
  let cmd: string;
  let spawnArgs: string[];

  if (fs.existsSync(localHfCli)) {
    cmd = localHfCli;
    spawnArgs = args;
  } else if (fs.existsSync(localPython)) {
    // Fallback: run via python -m huggingface_hub.cli
    cmd = localPython;
    spawnArgs = ["-m", "huggingface_hub.cli", ...args];
  } else {
    // Last resort: system PATH
    cmd = "huggingface-cli";
    spawnArgs = args;
  }

  const child = spawn(cmd, spawnArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  dl.request = child as unknown as http.ClientRequest;

  let stderr = "";

  child.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    // Parse progress from HF CLI output: "Downloading model.safetensors: 45%|..."
    const pct = text.match(/(\d+)%/);
    if (pct) {
      dl.progress = parseInt(pct[1], 10);
      const now = Date.now();
      const elapsed = (now - dl.startedAt) / 1000;
      dl.speed =
        Math.round((((dl.progress / 100) * (model.diskGB * 1024)) / Math.max(elapsed, 1)) * 10) /
        10;
      saveDownloadState();
    }
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  child.on("close", (code) => {
    if (code === 0) {
      dl.progress = 100;
      console.log(`[model-manager] HF repo download complete: ${model.id}`);
      activeDownloads.delete(model.id);
      processQueue();
    } else {
      dl.error = stderr.slice(0, 500) || `huggingface-cli exited with code ${code}`;
      scheduleErrorCleanup(model.id);
    }
    saveDownloadState();
  });

  child.on("error", (e) => {
    // CLI not available — fall back to single-file downloads
    activeDownloads.delete(model.id);
    if (model.files && model.files.length > 0) {
      // Download first/main file via HTTP as fallback
      const fallback = {
        ...model,
        downloadType: "single-file" as const,
        filename: model.files[0].name,
      };
      startDownloadImmediate(fallback, hfToken);
    } else {
      dl.error = `huggingface-cli not available: ${e.message}. Install with: pip install huggingface_hub[cli]`;
      // Re-add so the error is visible in the UI
      activeDownloads.set(model.id, dl);
      scheduleErrorCleanup(model.id);
    }
  });
}

// ─── Ollama Helpers ───────────────────────────────────────────────────────────

async function ollamaList(): Promise<Array<{ name: string; size: number; modified_at: string }>> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return [];
    }
    const data = (await res.json()) as {
      models?: Array<{ name: string; size: number; modified_at: string }>;
    };
    return data.models ?? [];
  } catch {
    return [];
  }
}

async function ollamaDelete(name: string): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export const modelsManagerHandlers: GatewayRequestHandlers = {
  /** Get the full local model catalog with status and disk info */
  "models.manager.catalog": async ({ respond }) => {
    try {
      const catalog = buildCatalog();
      // System RAM info
      let freeRamGB = 8;
      let totalRamGB = 16;
      try {
        const os = await import("node:os");
        freeRamGB = Math.round((os.freemem() / 1024 / 1024 / 1024) * 10) / 10;
        totalRamGB = Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10;
      } catch {
        /* ignore */
      }
      // GPU VRAM info — cached 30s to avoid blocking event loop
      const gpuInfo = await _getCachedGpuInfo();
      respond(
        true,
        {
          models: catalog,
          freeRamGB,
          totalRamGB,
          totalVramGB: gpuInfo.totalVramGB,
          gpus: gpuInfo.gpus,
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  /** Start downloading a model by ID */
  "models.manager.download": async ({ params, respond }) => {
    const p = (params ?? {}) as ModelDownloadParams;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }
    const entry = MODEL_REGISTRY.find((m) => m.id === p.id);
    if (!entry) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Model not found: ${p.id}`));
      return;
    }
    // Check if already downloaded
    const localPath = resolveLocalPath(entry);
    try {
      const stat = fs.statSync(localPath);
      if (stat.size > 100_000) {
        respond(true, { already: true, path: localPath }, undefined);
        return;
      }
    } catch {
      /* needs download */
    }

    enqueueDownload(entry, resolveHfToken(p.hfToken));
    respond(true, { started: true, modelId: p.id }, undefined);
  },

  /** Cancel/abort an in-progress download */
  "models.manager.cancel": async ({ params, respond }) => {
    const p = (params ?? {}) as unknown as ModelDeleteParams;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const dl = activeDownloads.get(p.id);
    if (dl) {
      try {
        dl.request?.destroy();
      } catch {
        /* ignore */
      }
      activeDownloads.delete(p.id);
    }
    respond(true, { cancelled: true }, undefined);
  },

  /** Delete a local model file */
  "models.manager.delete": async ({ params, respond }) => {
    const p = (params ?? {}) as unknown as ModelDeleteParams;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }
    const entry = MODEL_REGISTRY.find((m) => m.id === p.id);
    if (!entry) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Model not found"));
      return;
    }
    const localPath = resolveLocalPath(entry);
    try {
      fs.unlinkSync(localPath);
      respond(true, { deleted: true, path: localPath }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  /** Get active download progress */
  "models.manager.progress": async ({ respond }) => {
    const progress: Record<
      string,
      {
        progress: number;
        speed: number;
        totalBytes: number;
        downloadedBytes: number;
        error?: string;
      }
    > = {};
    for (const [id, dl] of activeDownloads) {
      progress[id] = {
        progress: dl.progress,
        speed: dl.speed,
        totalBytes: dl.totalBytes,
        downloadedBytes: dl.downloadedBytes,
        error: dl.error,
      };
    }
    respond(true, { progress }, undefined);
  },

  /** List Ollama models */
  "models.manager.ollama.list": async ({ respond }) => {
    const models = await ollamaList();
    respond(true, { models }, undefined);
  },

  /** Pull an Ollama model by tag */
  "models.manager.ollama.pull": async ({ params, respond }) => {
    const p = (params ?? {}) as { tag?: string };
    if (!p.tag) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "tag required"));
      return;
    }
    // Fire and forget — Ollama pull happens async
    fetch(`${OLLAMA_URL}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: p.tag, stream: false }),
    }).catch(() => {
      /* silent */
    });
    respond(true, { pulling: p.tag }, undefined);
  },

  /** Delete an Ollama model */
  "models.manager.ollama.delete": async ({ params, respond }) => {
    const p = params as { name?: string } | undefined;
    if (!p?.name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name required"));
      return;
    }
    const ok = await ollamaDelete(p.name);
    respond(
      ok,
      { deleted: ok },
      ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, "Ollama delete failed"),
    );
  },

  /** Get disk usage summary for models directory (async, cached 60s) */
  "models.manager.disk": async ({ respond }) => {
    // Use cached result if fresh (within 60s)
    const now = Date.now();
    if (_diskCache && now - _diskCacheTime < 60_000) {
      respond(true, _diskCache, undefined);
      return;
    }

    const toGB = (b: number) => Math.round((b / 1e9) * 100) / 100;

    const [bitnetBytes, ggufBytes, pluginBytes, lmStudioBytes, ollamaBytes, hfCacheBytes] =
      await Promise.all([
        _asyncDirSize(BITNET_DIR),
        _asyncDirSize(GGUF_DIR),
        _asyncDirSize(PLUGINS_DIR),
        _asyncDirSize(LM_STUDIO_DIR),
        _asyncDirSize(
          process.env.OLLAMA_MODELS ??
            path.join(process.env.USERPROFILE ?? process.env.HOME ?? "~", ".ollama", "models"),
        ),
        _asyncDirSize(HF_CACHE),
      ]);

    const ollamaDir =
      process.env.OLLAMA_MODELS ??
      path.join(process.env.USERPROFILE ?? process.env.HOME ?? "~", ".ollama", "models");

    const hocBytes = bitnetBytes + ggufBytes + pluginBytes;
    const totalBytes = hocBytes + lmStudioBytes + ollamaBytes + hfCacheBytes;

    const result = {
      totalGB: toGB(totalBytes),
      bitnetGB: toGB(bitnetBytes),
      ggufGB: toGB(ggufBytes),
      pluginGB: toGB(pluginBytes),
      lmStudioGB: toGB(lmStudioBytes),
      ollamaGB: toGB(ollamaBytes),
      hfCacheGB: toGB(hfCacheBytes),
      dataDir: DATA_DIR,
      lmStudioDir: LM_STUDIO_DIR,
      ollamaDir,
      hfCacheDir: HF_CACHE,
    };
    _diskCache = result;
    _diskCacheTime = now;
    respond(true, result, undefined);
  },

  /** Pause an active download */
  "models.manager.pause": async ({ params, respond }) => {
    const p = (params ?? {}) as { id?: string };
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const dl = activeDownloads.get(p.id);
    if (!dl) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "No active download"));
      return;
    }
    try {
      dl.request?.destroy();
    } catch {
      /* ignore */
    }
    dl.paused = true;
    dl.request = undefined;
    saveDownloadState();
    respond(true, { paused: true, modelId: p.id, downloadedBytes: dl.downloadedBytes }, undefined);
  },

  /** Resume a paused download */
  "models.manager.resume": async ({ params, respond }) => {
    const p = (params ?? {}) as { id?: string; hfToken?: string };
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    // Check if there is a paused download in memory
    const dl = activeDownloads.get(p.id);
    if (dl?.paused) {
      activeDownloads.delete(p.id);
    }
    // Find the model and restart with resume
    const entry = MODEL_REGISTRY.find((m) => m.id === p.id);
    if (!entry) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Model not found: ${p.id}`));
      return;
    }
    enqueueDownload(entry, resolveHfToken(p.hfToken));
    respond(true, { resumed: true, modelId: p.id }, undefined);
  },

  /** Check system prerequisites for model execution */
  "models.manager.prerequisites": async ({ respond }) => {
    const checks: Record<
      string,
      {
        available: boolean;
        version?: string;
        path?: string;
        installCmd?: string;
        installUrl?: string;
        installHint?: string;
        autoInstallable?: boolean;
      }
    > = {};
    const { execSync } = await import("node:child_process");

    // Resolve local Python from runtime/python/
    const localPy = path.join(REPO_ROOT, "runtime", "python", "python.exe");
    const localHfCli = path.join(REPO_ROOT, "runtime", "python", "Scripts", "huggingface-cli.exe");
    const hasLocalPy = fs.existsSync(localPy);

    function tryExec(cmd: string, timeout = 5000): string | null {
      try {
        return execSync(cmd, {
          encoding: "utf-8",
          timeout,
          stdio: ["pipe", "pipe", "pipe"],
        }).trim();
      } catch {
        return null;
      }
    }

    // Python — prefer local runtime
    if (hasLocalPy) {
      const ver = tryExec(`"${localPy}" --version`);
      checks["python"] = { available: !!ver, version: ver ?? undefined, path: localPy };
    } else {
      const candidates =
        process.platform === "win32" ? ["python", "python3", "py"] : ["python3", "python"];
      for (const cmd of candidates) {
        const ver = tryExec(`${cmd} --version`);
        if (ver?.includes("Python 3.")) {
          checks["python"] = { available: true, version: ver };
          break;
        }
      }
      if (!checks["python"]) {
        checks["python"] = {
          available: false,
          installUrl: "https://www.python.org/downloads/",
          installHint:
            "Download Python 3.11+ from python.org. On Windows, check 'Add to PATH' during install.",
          installCmd:
            process.platform === "win32"
              ? "winget install Python.Python.3.12"
              : "sudo apt install python3 python3-pip",
          autoInstallable: process.platform === "win32",
        };
      }
    }

    // Resolve python command for subsequent checks
    const pyCmd = hasLocalPy ? `"${localPy}"` : checks["python"]?.available ? "python" : "python3";

    // Run non-dependent checks in parallel
    const [nvResult, torchResult, gitResult, ollamaResult] = await Promise.allSettled([
      // NVIDIA GPU
      new Promise<string | null>((resolve) => {
        resolve(tryExec("nvidia-smi --query-gpu=name,driver_version --format=csv,noheader"));
      }),
      // PyTorch + CUDA
      new Promise<string | null>((resolve) => {
        resolve(
          tryExec(
            `${pyCmd} -c "import torch; print(f'PyTorch {torch.__version__} CUDA={torch.cuda.is_available()}')"`,
            10000,
          ),
        );
      }),
      // Git
      new Promise<string | null>((resolve) => {
        resolve(tryExec("git --version"));
      }),
      // Ollama
      fetch(`${OLLAMA_URL}/api/version`, { signal: AbortSignal.timeout(3000) })
        .then((r) => (r.ok ? (r.json() as Promise<{ version?: string }>) : null))
        .catch(() => null),
    ]);

    // NVIDIA GPU
    if (nvResult.status === "fulfilled" && nvResult.value) {
      checks["nvidia_gpu"] = {
        available: true,
        version: nvResult.value.split("\n")[0]?.trim() || "detected",
      };
    } else {
      checks["nvidia_gpu"] = {
        available: false,
        installUrl: "https://www.nvidia.com/Download/index.aspx",
        installHint:
          "Install NVIDIA GPU drivers from nvidia.com. Required for CUDA acceleration. If you have an AMD GPU, CUDA is not available.",
      };
    }

    // PyTorch + CUDA
    const torchInstallCmd = hasLocalPy
      ? `"${localPy}" -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124`
      : "pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124";

    if (torchResult.status === "fulfilled" && torchResult.value) {
      const hasCuda = torchResult.value.includes("CUDA=True");
      checks["pytorch"] = { available: true, version: torchResult.value };
      checks["cuda"] = {
        available: hasCuda,
        version: hasCuda ? torchResult.value : undefined,
        installCmd: hasCuda ? undefined : torchInstallCmd,
        installUrl: "https://pytorch.org/get-started/locally/",
        installHint: hasCuda
          ? undefined
          : "PyTorch is installed but without CUDA support. Reinstall with CUDA 12.4 support using the command below.",
        autoInstallable: !hasCuda && checks["python"]?.available,
      };
    } else {
      checks["pytorch"] = {
        available: false,
        installCmd: torchInstallCmd,
        installUrl: "https://pytorch.org/get-started/locally/",
        installHint:
          "PyTorch is required for diffusion, TTS, audio, and face models. Install with CUDA 12.4 support.",
        autoInstallable: !!checks["python"]?.available,
      };
      checks["cuda"] = {
        available: false,
        installCmd: torchInstallCmd,
        installUrl: "https://pytorch.org/get-started/locally/",
        installHint:
          "Install PyTorch with CUDA support. Requires NVIDIA GPU drivers to be installed first.",
        autoInstallable: !!checks["python"]?.available,
      };
    }

    // Git
    if (gitResult.status === "fulfilled" && gitResult.value) {
      checks["git"] = { available: true, version: gitResult.value };
    } else {
      checks["git"] = {
        available: false,
        installUrl: "https://git-scm.com/downloads",
        installHint:
          "Git is required for cloning model repositories (StableAvatar, DeepFaceLab, etc.).",
        installCmd:
          process.platform === "win32" ? "winget install Git.Git" : "sudo apt install git",
        autoInstallable: process.platform === "win32",
      };
    }

    // huggingface-cli
    const hfInstallCmd = hasLocalPy
      ? `"${localPy}" -m pip install huggingface_hub[cli]`
      : "pip install huggingface_hub[cli]";

    if (fs.existsSync(localHfCli)) {
      const ver = tryExec(`"${localHfCli}" version`, 3000);
      checks["huggingface_cli"] = {
        available: true,
        version: ver ?? "installed",
        path: localHfCli,
      };
    } else {
      // Try system PATH
      const hfCmds = ["huggingface-cli version", "hf version"];
      let found = false;
      for (const cmd of hfCmds) {
        const ver = tryExec(cmd, 3000);
        if (ver) {
          checks["huggingface_cli"] = { available: true, version: ver };
          found = true;
          break;
        }
      }
      if (!found) {
        checks["huggingface_cli"] = {
          available: false,
          installCmd: hfInstallCmd,
          installHint:
            "HuggingFace CLI is required for downloading multi-file model repos (TTS, Diffusion, etc.).",
          autoInstallable: !!checks["python"]?.available,
        };
      }
    }

    // Ollama
    if (ollamaResult.status === "fulfilled" && ollamaResult.value) {
      const data = ollamaResult.value as { version?: string };
      checks["ollama"] = { available: true, version: data.version };
    } else {
      checks["ollama"] = {
        available: false,
        installUrl: "https://ollama.com/download",
        installHint:
          "Ollama lets you run GGUF models locally with one command. Download from ollama.com.",
        installCmd:
          process.platform === "win32"
            ? "winget install Ollama.Ollama"
            : "curl -fsSL https://ollama.com/install.sh | sh",
        autoInstallable: process.platform === "win32",
      };
    }

    // HF token
    const hfToken = process.env.HUGGINGFACE_HUB_TOKEN || process.env.HF_TOKEN;
    checks["hf_token"] = {
      available: !!hfToken,
      version: hfToken ? "configured" : undefined,
      installUrl: "https://huggingface.co/settings/tokens",
      installHint: hfToken
        ? undefined
        : "Some models require a HuggingFace token. Create one at huggingface.co/settings/tokens and paste it in the HF Token field above.",
    };

    respond(true, { prerequisites: checks }, undefined);
  },

  /** Auto-install a prerequisite by running its install command */
  "models.manager.install": async ({ params, respond }) => {
    const p = (params ?? {}) as { prerequisite?: string };
    if (!p?.prerequisite) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "prerequisite name required"),
      );
      return;
    }

    const localPy = path.join(REPO_ROOT, "runtime", "python", "python.exe");
    const hasLocalPy = fs.existsSync(localPy);
    const _pyCmd = hasLocalPy ? `"${localPy}"` : "python";

    // Map prerequisite names to their install commands
    const installCommands: Record<string, { cmd: string; args: string[]; timeout: number }> = {
      pytorch: {
        cmd: hasLocalPy ? localPy : "pip",
        args: hasLocalPy
          ? [
              "-m",
              "pip",
              "install",
              "torch",
              "torchvision",
              "torchaudio",
              "--index-url",
              "https://download.pytorch.org/whl/cu124",
            ]
          : [
              "install",
              "torch",
              "torchvision",
              "torchaudio",
              "--index-url",
              "https://download.pytorch.org/whl/cu124",
            ],
        timeout: 600_000, // 10 minutes — PyTorch is huge
      },
      cuda: {
        cmd: hasLocalPy ? localPy : "pip",
        args: hasLocalPy
          ? [
              "-m",
              "pip",
              "install",
              "torch",
              "torchvision",
              "torchaudio",
              "--index-url",
              "https://download.pytorch.org/whl/cu124",
            ]
          : [
              "install",
              "torch",
              "torchvision",
              "torchaudio",
              "--index-url",
              "https://download.pytorch.org/whl/cu124",
            ],
        timeout: 600_000,
      },
      huggingface_cli: {
        cmd: hasLocalPy ? localPy : "pip",
        args: hasLocalPy
          ? ["-m", "pip", "install", "huggingface_hub[cli]"]
          : ["install", "huggingface_hub[cli]"],
        timeout: 120_000,
      },
      python: {
        cmd: "winget",
        args: [
          "install",
          "Python.Python.3.12",
          "--accept-source-agreements",
          "--accept-package-agreements",
        ],
        timeout: 300_000,
      },
      git: {
        cmd: "winget",
        args: ["install", "Git.Git", "--accept-source-agreements", "--accept-package-agreements"],
        timeout: 300_000,
      },
      ollama: {
        cmd: "winget",
        args: [
          "install",
          "Ollama.Ollama",
          "--accept-source-agreements",
          "--accept-package-agreements",
        ],
        timeout: 300_000,
      },
    };

    const install = installCommands[p.prerequisite];
    if (!install) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.NOT_FOUND,
          `No auto-install available for: ${p.prerequisite}. Please install manually.`,
        ),
      );
      return;
    }

    try {
      const child = spawn(install.cmd, install.args, {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: install.timeout,
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      await new Promise<void>((resolve, reject) => {
        child.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(stderr.slice(-500) || `Exit code ${code}`));
          }
        });
        child.on("error", reject);
      });

      respond(
        true,
        {
          installed: true,
          prerequisite: p.prerequisite,
          output: stdout.slice(-500),
        },
        undefined,
      );
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INTERNAL_ERROR,
          `Install failed for ${p.prerequisite}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  /** List models found in LM Studio's model directory */
  "models.manager.lmstudio.list": async ({ respond }) => {
    const models: Array<{ name: string; path: string; sizeBytes: number }> = [];
    try {
      if (fs.existsSync(LM_STUDIO_DIR)) {
        const walk = (dir: string) => {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walk(full);
            } else if (entry.name.endsWith(".gguf")) {
              try {
                const stat = fs.statSync(full);
                models.push({
                  name: path.relative(LM_STUDIO_DIR, full).replace(/\\/g, "/"),
                  path: full,
                  sizeBytes: stat.size,
                });
              } catch {
                /* skip */
              }
            }
          }
        };
        walk(LM_STUDIO_DIR);
      }
    } catch {
      /* dir doesn't exist */
    }
    respond(true, { models, lmStudioDir: LM_STUDIO_DIR }, undefined);
  },

  /** Restore paused downloads from persisted state (called on gateway boot) */
  "models.manager.restore": async ({ respond }) => {
    const state = loadDownloadState();
    if (!state) {
      respond(true, { restored: 0 }, undefined);
      return;
    }
    let restored = 0;
    for (const [id, dl] of Object.entries(state.activeDownloads)) {
      if (dl.paused && dl.downloadedBytes > 0) {
        // Re-register as paused so the catalog shows the partial state
        activeDownloads.set(id, {
          modelId: dl.modelId,
          url: "",
          dest: dl.partPath.replace(/\.part$/, ""),
          partDest: dl.partPath,
          progress: dl.totalBytes > 0 ? Math.round((dl.downloadedBytes / dl.totalBytes) * 100) : 0,
          speed: 0,
          totalBytes: dl.totalBytes,
          downloadedBytes: dl.downloadedBytes,
          startedAt: dl.startedAt,
          paused: true,
        });
        restored++;
      }
    }
    respond(true, { restored }, undefined);
  },

  /** Resolve a model's local path and status by id or pluginId */
  "models.manager.resolve": async ({ params, respond }) => {
    const p = (params ?? {}) as { id?: string; pluginId?: string };

    let matches: (typeof MODEL_REGISTRY)[number][];
    if (p.id) {
      matches = MODEL_REGISTRY.filter((m) => m.id === p.id);
    } else if (p.pluginId) {
      matches = MODEL_REGISTRY.filter((m) => m.pluginId === p.pluginId);
    } else {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id or pluginId required"));
      return;
    }

    const results = matches.map((m) => {
      const localPath = resolveLocalPath(m);
      const exists = fs.existsSync(localPath);
      const dl = activeDownloads.get(m.id);
      let sizeBytes = 0;
      try {
        if (exists) {
          sizeBytes = fs.statSync(localPath).size;
        }
      } catch {
        /* skip */
      }
      return {
        id: m.id,
        name: m.name,
        localPath,
        exists,
        status: dl ? (dl.paused ? "paused" : "downloading") : exists ? "downloaded" : "available",
        sizeBytes,
        category: m.category,
        repo: m.repo,
        pluginId: m.pluginId,
      };
    });

    respond(true, { models: results }, undefined);
  },

  /** Ensure a model is downloaded — returns path immediately if exists, starts download otherwise */
  "models.manager.ensure": async ({ params, respond }) => {
    const p = (params ?? {}) as { id?: string; hfToken?: string };
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }

    const entry = MODEL_REGISTRY.find((m) => m.id === p.id);
    if (!entry) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Model not found: ${p.id}`));
      return;
    }

    const localPath = resolveLocalPath(entry);
    if (fs.existsSync(localPath)) {
      respond(true, { ready: true, localPath, status: "downloaded" }, undefined);
      return;
    }

    // Start download if not active
    if (!activeDownloads.has(entry.id)) {
      enqueueDownload(entry, resolveHfToken(p.hfToken));
    }

    const dl = activeDownloads.get(entry.id);
    respond(
      true,
      {
        ready: false,
        localPath,
        status: dl?.paused ? "paused" : "downloading",
        progress: dl?.progress ?? 0,
      },
      undefined,
    );
  },

  /** Configure download manager settings (concurrency, bandwidth) */
  "models.manager.config": async ({ params, respond }) => {
    const p = (params ?? {}) as {
      maxConcurrent?: number;
      bandwidthLimitMBps?: number;
    };

    if (p.maxConcurrent != null && p.maxConcurrent >= 1 && p.maxConcurrent <= 10) {
      MAX_CONCURRENT_DOWNLOADS = p.maxConcurrent;
    }
    if (p.bandwidthLimitMBps != null) {
      bandwidthLimitBps =
        p.bandwidthLimitMBps <= 0 ? 0 : Math.floor(p.bandwidthLimitMBps * 1024 * 1024);
    }

    // Persist to state
    saveDownloadState();

    respond(
      true,
      {
        maxConcurrent: MAX_CONCURRENT_DOWNLOADS,
        bandwidthLimitMBps:
          bandwidthLimitBps > 0 ? Math.round((bandwidthLimitBps / 1024 / 1024) * 10) / 10 : 0,
        activeDownloads: [...activeDownloads.values()].filter((d) => !d.paused).length,
        queuedDownloads: downloadQueue.length,
      },
      undefined,
    );
  },

  /** List all models required by a specific plugin */
  "models.manager.plugin.requirements": async ({ params, respond }) => {
    const p = (params ?? {}) as { pluginId?: string };
    if (!p?.pluginId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "pluginId required"));
      return;
    }

    const models = MODEL_REGISTRY.filter((m) => m.pluginId === p.pluginId);
    const catalog = models.map((m) => {
      const localPath = resolveLocalPath(m);
      const exists = fs.existsSync(localPath);
      let sizeBytes = 0;
      try {
        if (exists) {
          sizeBytes = fs.statSync(localPath).size;
        }
      } catch {
        /* skip */
      }
      return {
        id: m.id,
        name: m.name,
        category: m.category,
        repo: m.repo,
        localPath,
        exists,
        status: exists ? "downloaded" : "available",
        sizeBytes,
        diskGB: m.diskGB,
        ramGB: m.ramGB,
        vramGB: m.vramGB,
        prerequisites: m.prerequisites,
      };
    });

    respond(true, { pluginId: p.pluginId, models: catalog }, undefined);
  },

  /** Get readiness summary for a plugin — how many of its required models are available */
  "models.manager.plugin.status": async ({ params, respond }) => {
    const p = (params ?? {}) as { pluginId?: string };
    if (!p?.pluginId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "pluginId required"));
      return;
    }

    const required = MODEL_REGISTRY.filter((m) => m.pluginId === p.pluginId);
    const ready = required.filter((m) => fs.existsSync(resolveLocalPath(m)));
    const downloading = required.filter((m) => {
      const dl = activeDownloads.get(m.id);
      return dl && !dl.paused;
    });
    const paused = required.filter((m) => activeDownloads.get(m.id)?.paused);

    respond(
      true,
      {
        pluginId: p.pluginId,
        total: required.length,
        ready: ready.length,
        downloading: downloading.length,
        paused: paused.length,
        allReady: required.length > 0 && ready.length === required.length,
        models: required.map((m) => ({
          id: m.id,
          name: m.name,
          status: fs.existsSync(resolveLocalPath(m))
            ? "downloaded"
            : activeDownloads.get(m.id)?.paused
              ? "paused"
              : activeDownloads.has(m.id)
                ? "downloading"
                : "available",
          localPath: resolveLocalPath(m),
        })),
      },
      undefined,
    );
  },
};
