/**
 * ComfyUI Download Manager — Background queue with pause/resume/progress
 *
 * Features:
 *  - Download queue with configurable concurrency (default: 1)
 *  - Real-time progress (bytes, speed, ETA)
 *  - Pause / Resume (curl -C - for file continuation)
 *  - Cancel in-flight downloads
 *  - Persistent partial files for resumable downloads
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, statSync, unlinkSync, renameSync } from "node:fs";
import { join } from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { MODEL_REGISTRY, COMFYUI_MODELS_DIR } from "./comfyui-manager.js";
import { emitNationalEvent } from "./event-sourcing.js";

const logger = createSubsystemLogger("comfyui-dl");

// ─── Types ──────────────────────────────────────────────────────

export type DownloadState = "queued" | "downloading" | "paused" | "completed" | "failed" | "cancelled";

export interface DownloadProgress {
  id: string;
  modelId: string;
  modelName: string;
  state: DownloadState;
  /** Bytes downloaded so far */
  bytesDownloaded: number;
  /** Total bytes (0 if unknown) */
  bytesTotal: number;
  /** Percentage 0–100 */
  percent: number;
  /** Current download speed in bytes/sec */
  speedBps: number;
  /** Formatted speed string */
  speed: string;
  /** Estimated seconds remaining (0 if unknown) */
  etaSeconds: number;
  /** Formatted ETA string */
  eta: string;
  /** When this download was queued */
  queuedAt: number;
  /** When downloading actually started (0 if still queued) */
  startedAt: number;
  /** When completed/failed/cancelled (0 if still in progress) */
  endedAt: number;
  /** Error message if failed */
  error?: string;
  /** Destination path */
  destPath: string;
}

interface ActiveDownload {
  progress: DownloadProgress;
  child: ChildProcess | null;
  /** Temp file path (download writes here, renamed on completion) */
  tempPath: string;
}

// ─── Download Manager ───────────────────────────────────────────

const MAX_CONCURRENT = 1; // One download at a time for bandwidth control
const queue: DownloadProgress[] = [];
const active = new Map<string, ActiveDownload>();
const completed: DownloadProgress[] = [];
let nextId = 1;

function generateId(): string {
  return `dl-${Date.now().toString(36)}-${(nextId++).toString(36)}`;
}

function getTypeDir(type: string): string {
  const map: Record<string, string> = {
    checkpoint: "checkpoints",
    lora: "loras",
    vae: "vae",
    controlnet: "controlnet",
    upscaler: "upscale_models",
    clip: "clip",
  };
  return map[type] ?? "checkpoints";
}

function formatSpeed(bps: number): string {
  if (bps <= 0) { return "—"; }
  if (bps < 1024) { return `${bps.toFixed(0)} B/s`; }
  if (bps < 1_048_576) { return `${(bps / 1024).toFixed(1)} KB/s`; }
  if (bps < 1_073_741_824) { return `${(bps / 1_048_576).toFixed(1)} MB/s`; }
  return `${(bps / 1_073_741_824).toFixed(2)} GB/s`;
}

function formatETA(seconds: number): string {
  if (seconds <= 0) { return "—"; }
  if (seconds < 60) { return `${Math.ceil(seconds)}s`; }
  if (seconds < 3600) { return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`; }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// ─── Queue Management ───────────────────────────────────────────

/** Enqueue a model for download. Returns the download ID. */
export function enqueueDownload(modelId: string): { ok: boolean; downloadId?: string; error?: string } {
  const model = MODEL_REGISTRY.find((m) => m.id === modelId);
  if (!model) {
    return { ok: false, error: `Unknown model: ${modelId}` };
  }

  // Check if already queued or downloading
  const existingActive = [...active.values()].find((a) => a.progress.modelId === modelId);
  if (existingActive) {
    return { ok: true, downloadId: existingActive.progress.id };
  }
  const existingQueued = queue.find((q) => q.modelId === modelId && q.state === "queued");
  if (existingQueued) {
    return { ok: true, downloadId: existingQueued.id };
  }

  // Check if already downloaded
  const destDir = join(COMFYUI_MODELS_DIR, getTypeDir(model.type));
  const destPath = join(destDir, model.filename);
  if (existsSync(destPath)) {
    return { ok: false, error: "Model already downloaded" };
  }

  const id = generateId();
  const progress: DownloadProgress = {
    id,
    modelId,
    modelName: model.name,
    state: "queued",
    bytesDownloaded: 0,
    bytesTotal: 0,
    percent: 0,
    speedBps: 0,
    speed: "—",
    etaSeconds: 0,
    eta: "—",
    queuedAt: Date.now(),
    startedAt: 0,
    endedAt: 0,
    destPath,
  };

  queue.push(progress);
  logger.info(`Queued download: ${model.name} (${id})`);

  // Try to start if we have capacity
  processQueue();
  return { ok: true, downloadId: id };
}

/** Process the queue — start downloads if capacity available */
function processQueue(): void {
  const downloading = [...active.values()].filter((a) => a.progress.state === "downloading");
  if (downloading.length >= MAX_CONCURRENT) { return; }

  const slotsAvailable = MAX_CONCURRENT - downloading.length;
  const toStart = queue.filter((q) => q.state === "queued").slice(0, slotsAvailable);

  for (const item of toStart) {
    startDownload(item);
  }
}

/** Start a specific download */
function startDownload(progress: DownloadProgress): void {
  const model = MODEL_REGISTRY.find((m) => m.id === progress.modelId);
  if (!model) {
    progress.state = "failed";
    progress.error = "Model not found in registry";
    progress.endedAt = Date.now();
    return;
  }

  const destDir = join(COMFYUI_MODELS_DIR, getTypeDir(model.type));
  mkdirSync(destDir, { recursive: true });

  const tempPath = progress.destPath + ".part";

  // Check for partial file (for resume)
  let resumeFrom = 0;
  if (existsSync(tempPath)) {
    try {
      resumeFrom = statSync(tempPath).size;
    } catch {
      resumeFrom = 0;
    }
  }

  progress.state = "downloading";
  progress.startedAt = Date.now();
  progress.bytesDownloaded = resumeFrom;

  // curl args: -L (follow redirects), -C for resume, -o for output
  const curlArgs = [
    "-L",             // follow redirects
    "-o", tempPath,   // output to temp file
    "-#",             // progress bar mode
    ...(resumeFrom > 0 ? ["-C", String(resumeFrom)] : []),
    model.url,
  ];

  const child = spawn("curl", curlArgs, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const dl: ActiveDownload = { progress, child, tempPath };
  active.set(progress.id, dl);

  // Remove from pending queue
  const queueIdx = queue.findIndex((q) => q.id === progress.id);
  if (queueIdx >= 0) { queue.splice(queueIdx, 1); }

  // Track progress via stderr (curl outputs progress to stderr)
  let lastSpeedUpdate = Date.now();
  let lastBytes = resumeFrom;

  child.stderr?.on("data", (data: Buffer) => {
    const text = data.toString();

    // Parse curl progress output
    // Format: "  47 17.0G   47 8.1G    0     0  45.2M      0  0:06:24  0:03:03  0:03:21 42.1M"
    // Or simpler: " 47.2%"
    const pctMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
    const speedMatch = text.match(/(\d+(?:\.\d+)?)\s*([BKMGT])(?:\/s|\b)/i);

    if (pctMatch) {
      const pct = parseFloat(pctMatch[1]);
      progress.percent = Math.min(pct, 100);

      // Try to extract total size from percentage + downloaded bytes
      if (pct > 0 && progress.bytesTotal === 0 && progress.bytesDownloaded > 0) {
        progress.bytesTotal = Math.round((progress.bytesDownloaded / pct) * 100);
      }
    }

    // Parse speed from curl output
    if (speedMatch) {
      const val = parseFloat(speedMatch[1]);
      const unit = speedMatch[2].toUpperCase();
      const multipliers: Record<string, number> = { B: 1, K: 1024, M: 1_048_576, G: 1_073_741_824, T: 1_099_511_627_776 };
      const bps = val * (multipliers[unit] ?? 1);
      if (bps > 0) {
        progress.speedBps = bps;
        progress.speed = formatSpeed(bps);
      }
    }

    // Calculate speed from actual bytes if curl doesn't give us a clean number
    const now = Date.now();
    const elapsed = (now - lastSpeedUpdate) / 1000;
    if (elapsed >= 2) {
      const byteDelta = progress.bytesDownloaded - lastBytes;
      if (byteDelta > 0) {
        const realSpeed = byteDelta / elapsed;
        if (progress.speedBps === 0 || Math.abs(realSpeed - progress.speedBps) / progress.speedBps > 0.3) {
          progress.speedBps = realSpeed;
          progress.speed = formatSpeed(realSpeed);
        }
      }
      lastBytes = progress.bytesDownloaded;
      lastSpeedUpdate = now;
    }

    // Calculate ETA
    if (progress.speedBps > 0 && progress.bytesTotal > 0) {
      const remaining = progress.bytesTotal - progress.bytesDownloaded;
      progress.etaSeconds = Math.max(0, remaining / progress.speedBps);
      progress.eta = formatETA(progress.etaSeconds);
    }

    // Try to get bytes from the temp file periodically
    if (existsSync(tempPath)) {
      try {
        progress.bytesDownloaded = statSync(tempPath).size;
      } catch {
        // Ignore stat errors during download
      }
    }
  });

  child.on("close", (code) => {
    active.delete(progress.id);

    if (progress.state === "cancelled" || progress.state === "paused") {
      // Don't overwrite paused/cancelled state
      processQueue();
      return;
    }

    if (code === 0 && existsSync(tempPath)) {
      // Rename temp file to final destination
      try {
        renameSync(tempPath, progress.destPath);
        progress.state = "completed";
        progress.percent = 100;
        progress.endedAt = Date.now();
        progress.speedBps = 0;
        progress.speed = "—";
        progress.etaSeconds = 0;
        progress.eta = "—";

        // Update final size
        try {
          progress.bytesDownloaded = statSync(progress.destPath).size;
          progress.bytesTotal = progress.bytesDownloaded;
        } catch { /* ignore */ }

        logger.info(`Download completed: ${progress.modelName}`);
        emitNationalEvent("infrastructure", "comfyui_model_downloaded", "comfyui-dl", {
          modelId: progress.modelId,
          modelName: progress.modelName,
          sizeBytes: progress.bytesDownloaded,
        });
        completed.push({ ...progress });
      } catch (err) {
        progress.state = "failed";
        progress.error = `Failed to rename: ${err instanceof Error ? err.message : String(err)}`;
        progress.endedAt = Date.now();
        completed.push({ ...progress });
      }
    } else if (code !== 0) {
      progress.state = "failed";
      progress.error = `curl exited with code ${code}`;
      progress.endedAt = Date.now();
      completed.push({ ...progress });
      logger.warn(`Download failed: ${progress.modelName} (exit ${code})`);
    }

    processQueue();
  });

  child.on("error", (err) => {
    active.delete(progress.id);
    progress.state = "failed";
    progress.error = err.message;
    progress.endedAt = Date.now();
    completed.push({ ...progress });
    processQueue();
  });

  logger.info(`Started download: ${model.name} (${progress.id})${resumeFrom > 0 ? ` resuming from ${formatSpeed(resumeFrom)}` : ""}`);
}

/** Pause a downloading item */
export function pauseDownload(downloadId: string): { ok: boolean; error?: string } {
  const dl = active.get(downloadId);
  if (!dl) {
    return { ok: false, error: "Download not found or not active" };
  }
  if (dl.progress.state !== "downloading") {
    return { ok: false, error: `Cannot pause download in state: ${dl.progress.state}` };
  }

  dl.progress.state = "paused";
  dl.progress.speedBps = 0;
  dl.progress.speed = "—";
  dl.progress.etaSeconds = 0;
  dl.progress.eta = "paused";

  // Kill the curl process — the .part file is preserved for resume
  dl.child?.kill("SIGTERM");
  active.delete(downloadId);

  logger.info(`Paused download: ${dl.progress.modelName}`);
  processQueue();
  return { ok: true };
}

/** Resume a paused download */
export function resumeDownload(downloadId: string): { ok: boolean; error?: string } {
  // Find in paused items across queue and completed
  const pausedInQueue = queue.find((q) => q.id === downloadId && q.state === "paused");
  const pausedInCompleted = completed.find((c) => c.id === downloadId && c.state === "paused");
  const paused = pausedInQueue ?? pausedInCompleted;

  if (!paused) {
    return { ok: false, error: "Paused download not found" };
  }

  // Re-queue it
  paused.state = "queued";
  if (pausedInCompleted) {
    // Move back to queue
    const idx = completed.indexOf(pausedInCompleted);
    if (idx >= 0) { completed.splice(idx, 1); }
    queue.push(paused);
  }

  processQueue();
  logger.info(`Resumed download: ${paused.modelName}`);
  return { ok: true };
}

/** Cancel a download (removes partial file) */
export function cancelDownload(downloadId: string): { ok: boolean; error?: string } {
  // Check active
  const dl = active.get(downloadId);
  if (dl) {
    dl.progress.state = "cancelled";
    dl.progress.endedAt = Date.now();
    dl.child?.kill("SIGTERM");
    active.delete(downloadId);

    // Remove partial file
    try {
      if (existsSync(dl.tempPath)) { unlinkSync(dl.tempPath); }
    } catch { /* ignore */ }

    completed.push({ ...dl.progress });
    processQueue();
    logger.info(`Cancelled download: ${dl.progress.modelName}`);
    return { ok: true };
  }

  // Check queue
  const queueIdx = queue.findIndex((q) => q.id === downloadId);
  if (queueIdx >= 0) {
    const item = queue[queueIdx];
    queue.splice(queueIdx, 1);
    item.state = "cancelled";
    item.endedAt = Date.now();
    completed.push({ ...item });
    logger.info(`Cancelled queued download: ${item.modelName}`);
    return { ok: true };
  }

  return { ok: false, error: "Download not found" };
}

/** Get all download statuses */
export function getAllDownloads(): {
  active: DownloadProgress[];
  queued: DownloadProgress[];
  completed: DownloadProgress[];
} {
  // Update byte counts for active downloads from file system
  for (const dl of active.values()) {
    if (dl.progress.state === "downloading" && existsSync(dl.tempPath)) {
      try {
        dl.progress.bytesDownloaded = statSync(dl.tempPath).size;
        if (dl.progress.bytesTotal > 0) {
          dl.progress.percent = Math.min(100, (dl.progress.bytesDownloaded / dl.progress.bytesTotal) * 100);
        }
      } catch { /* ignore */ }
    }
  }

  return {
    active: [...active.values()].map((a) => ({ ...a.progress })),
    queued: queue.filter((q) => q.state === "queued").map((q) => ({ ...q })),
    completed: completed.slice(-20).map((c) => ({ ...c })),
  };
}

/** Clear completed/failed/cancelled entries from history */
export function clearCompletedDownloads(): void {
  completed.length = 0;
}
